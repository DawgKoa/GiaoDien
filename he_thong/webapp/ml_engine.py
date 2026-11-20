import os
import warnings
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.dummy import DummyClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import KNeighborsClassifier
from sklearn.cluster import KMeans
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.metrics import roc_auc_score, brier_score_loss, recall_score, precision_score, roc_curve

# Thử nghiệm import TabPFN & PyTorch
try:
    import torch
    from tabpfn import TabPFNClassifier
    HAS_TABPFN = True
    HAS_CUDA = torch.cuda.is_available()
except Exception:
    HAS_TABPFN = False
    HAS_CUDA = False

# Đường dẫn thư mục gốc của dự án
BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DATA_PATH = BASE_DIR / "du_lieu_gia_lap_500_sv_may_hoc.csv"
INTERVENTION_LOG_PATH = BASE_DIR / "nhat_ky_can_thiep.csv"
FEEDBACK_LOG_PATH = BASE_DIR / "phan_hoi_sai_lech.csv"

FEATURES_CORE = ["diem_qua_trinh_1", "ty_le_vang", "so_lan_hoc_lai", "thoi_gian_tu_hoc"]


# ==============================================================================
# HÀM HELPER CHUẨN HÓA DỮ LIỆU JSON SERIALIZATION AN TOÀN
# ==============================================================================
def sanitize_for_json(obj: Any) -> Any:
    """
    Chuyển đổi đệ quy toàn bộ các kiểu dữ liệu numpy (int64, float64, ndarray, bool_)
    sang kiểu dữ liệu Python thuần (int, float, list, bool), đồng thời chuyển
    toàn bộ các giá trị NaN, Inf, pd.NA sang None để FastAPI serialize JSON 100% không lỗi.
    """
    if obj is None:
        return None
    if isinstance(obj, (float, np.floating)):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj)
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    if isinstance(obj, str):
        return obj
    if isinstance(obj, dict):
        return {str(k): sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, np.ndarray, pd.Series)):
        return [sanitize_for_json(item) for item in obj]
    if isinstance(obj, pd.DataFrame):
        return [sanitize_for_json(row) for row in obj.to_dict(orient="records")]
    if pd.isna(obj):
        return None
    return obj


# ==============================================================================
# HÀM HUẤN LUYỆN TẦNG 2 & ĐÁNH GIÁ SINH VIÊN (GIỮ NGUYÊN 100% TỪ APP.PY)
# ==============================================================================
def train_tier2_model(
    df_tier2: pd.DataFrame,
    model_name: str,
    n_est: int = 8,
    temp: float = 0.9,
    calib_method: str = "Platt (Sigmoid)",
    seed: int = 42
):
    X = df_tier2[FEATURES_CORE]
    y = df_tier2["nhan_rot_mon"]
    X_dev, X_test, y_dev, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=seed
    )

    # Hai mốc sàn bắt buộc theo Mục 11.2 (KB1)
    dummy = DummyClassifier(strategy="prior").fit(X_dev, y_dev)
    prob_dummy = dummy.predict_proba(X_test)[:, 1]

    stump = DecisionTreeClassifier(max_depth=1, random_state=seed).fit(X_dev[["diem_qua_trinh_1"]], y_dev)
    prob_stump = stump.predict_proba(X_test[["diem_qua_trinh_1"]])[:, 1]

    # Mô hình Tầng 2
    status_msg = ""
    if model_name.startswith("TabPFN"):
        if not HAS_TABPFN:
            raise RuntimeError("Chưa cài đặt thư viện `tabpfn` hoặc `torch` trong môi trường hiện tại.")
        device = "cuda" if HAS_CUDA else "cpu"
        base_clf = TabPFNClassifier(
            n_estimators=n_est,
            softmax_temperature=temp,
            device=device,
            random_state=seed
        )
        status_msg = f"TabPFN ({device.upper()}, n_est={n_est}, temp={temp})"
    elif model_name.startswith("Logistic Regression"):
        base_clf = Pipeline([
            ("scaler", StandardScaler()),
            ("lr", LogisticRegression(class_weight="balanced", random_state=seed))
        ])
        status_msg = "Logistic Regression (Mô hình đối chứng Mục 19.7)"
    else:
        base_clf = Pipeline([
            ("scaler", StandardScaler()),
            ("knn", KNeighborsClassifier(n_neighbors=9, weights="distance"))
        ])
        status_msg = "KNN k=9 (Mô hình đối chứng Chương 3 - Mục 19.6)"

    # Hiệu chỉnh xác suất (Mục 11.7)
    if calib_method == "Platt (Sigmoid)":
        model = CalibratedClassifierCV(base_clf, method="sigmoid", cv=5)
    elif calib_method == "Hồi quy đẳng điệu (Isotonic)":
        model = CalibratedClassifierCV(base_clf, method="isotonic", cv=5)
    else:
        model = base_clf

    model.fit(X_dev, y_dev)
    prob_test = model.predict_proba(X_test)[:, 1]

    baselines = {
        "Tỷ lệ nền (Dummy)": {
            "Brier": float(brier_score_loss(y_test, prob_dummy)),
            "AUC": float(roc_auc_score(y_test, prob_dummy)),
        },
        "Luật 1 thuộc tính (Điểm QT1)": {
            "Brier": float(brier_score_loss(y_test, prob_stump)),
            "AUC": float(roc_auc_score(y_test, prob_stump)),
        },
    }
    return model, X_dev, y_dev, X_test, y_test, prob_test, baselines, status_msg


def evaluate_student(row, nguong_L1: float, nguong_S1: float, t1: float, t2: float):
    vang = float(row["ty_le_vang"])
    qt1 = float(row["diem_qua_trinh_1"])
    hoclai = int(row["so_lan_hoc_lai"])
    tuhoc = int(row["thoi_gian_tu_hoc"])
    p = row["xac_suat_rot"]

    # Tầng 1: Luật xác định L1
    if vang > nguong_L1:
        return pd.Series([
            "Cao",
            "Luật L1 (Quy chế)",
            f"Vắng {vang*100:.0f}% (vượt ngưỡng {nguong_L1*100:.0f}% cấm thi)",
            "Cấm thi / Gặp riêng & chuyển Cố vấn học tập"
        ])

    # Tầng 2: Chia 3 mức theo xác suất đã hiệu chỉnh
    if p >= t2:
        muc = "Cao"
        nguon = "Mô hình Tầng 2"
    elif p >= t1:
        muc = "Trung bình"
        nguon = "Mô hình Tầng 2"
    else:
        muc = "Thấp"
        nguon = "Mô hình Tầng 2"

    # Luật sàn S1 (vắng 15–20% không được thấp hơn Trung bình)
    if nguong_S1 <= vang <= nguong_L1:
        if muc == "Thấp":
            muc = "Trung bình"
            nguon = "Luật sàn S1 + Mô hình"
        elif muc == "Trung bình":
            nguon = "Luật sàn S1 + Mô hình"

    # Lý do chính
    ly_do = []
    if qt1 < 5.0:
        ly_do.append(f"Điểm QT1 thấp ({qt1:.1f}/10)")
    elif qt1 < 6.0:
        ly_do.append(f"Điểm QT1 trung bình yếu ({qt1:.1f}/10)")
    if vang >= nguong_S1:
        ly_do.append(f"Vắng sát ngưỡng cấm thi ({vang*100:.0f}%)")
    elif vang >= 0.10:
        ly_do.append(f"Tỷ lệ vắng cần lưu ý ({vang*100:.0f}%)")
    if hoclai >= 1:
        ly_do.append(f"Đã từng học lại môn này ({hoclai} lần)")
    if tuhoc <= 1:
        ly_do.append("Thời gian tự học ít (dưới 2h/tuần)")
    if not ly_do:
        ly_do.append("Điểm QT1 và chuyên cần ổn định")

    hanh_dong = {
        "Cao": "Gặp riêng trong 1 tuần + Chuyển Cố vấn học tập",
        "Trung bình": "Nhắc nhở cá nhân + Giao bài tập bổ trợ",
        "Thấp": "Theo dõi định kỳ trên lớp"
    }[muc]

    return pd.Series([muc, nguon, "; ".join(ly_do), hanh_dong])


def get_pedagogical_note(muc: str, nguon: str) -> Dict[str, str]:
    if muc == "Cao":
        if "Luật L1" in nguon:
            return {
                "type": "error",
                "title": "Ghi chú sư phạm (Cấm thi theo Quy chế)",
                "content": "Sinh viên đã vắng vượt quá 20% số tiết theo quy chế đào tạo. Tầng 1 tự động xác định cấm thi cuối kỳ — trường hợp này không thể cứu vãn bằng điểm số, cần chuyển hồ sơ sang Cố vấn học tập để hướng dẫn thủ tục học vụ."
            }
        else:
            return {
                "type": "warning",
                "title": "Ghi chú sư phạm (Nguy cơ rớt cao từ Học máy)",
                "content": "Mô hình máy học cảnh báo nguy cơ rớt rất cao do kết hợp các yếu tố bất lợi (điểm QT1 dưới trung bình hoặc có tiền sử học lại). Giảng viên nên chủ động liên hệ hẹn gặp riêng ngay trong tuần để lập kế hoạch ôn tập trước kỳ thi."
            }
    elif muc == "Trung bình":
        return {
            "type": "info",
            "title": "Ghi chú sư phạm (Vùng báo động vàng)",
            "content": "Sinh viên nằm trong vùng báo động vàng (xác suất rớt 30%–60% hoặc vắng tiệm cận ngưỡng cấm thi theo Luật sàn S1). Cần nhắc nhở trực tiếp trên lớp và giao thêm các bài tập thực hành bổ trợ để kéo điểm lên."
        }
    else:
        return {
            "type": "success",
            "title": "Ghi chú sư phạm (Trạng thái an toàn)",
            "content": "Sinh viên có kết quả học tập và chuyên cần tốt, xác suất rớt môn rất thấp (< 30%). Giảng viên chỉ cần duy trì theo dõi định kỳ trên lớp."
        }


# ==============================================================================
# CLASS QUẢN LÝ ML ENGINE TOÀN CỤC CHO HỆ THỐNG
# ==============================================================================
class EarlyWarningMLEngine:
    def __init__(self):
        # Cấu hình mặc định khớp 100% app.py
        self.nguong_L1: float = 0.20
        self.nguong_S1: float = 0.15
        self.model_choice: str = "Logistic Regression (Đối chứng Mục 19.7)"
        self.n_est: int = 8
        self.temp: float = 0.9
        self.calib_method: str = "Platt (Sigmoid)"
        self.t1: float = 0.30
        self.t2: float = 0.60
        self.seed: int = 42

        # Dữ liệu & kết quả
        self.df_raw: pd.DataFrame = pd.DataFrame()
        self.df_out: pd.DataFrame = pd.DataFrame()
        self.model = None
        self.X_dev = None
        self.y_dev = None
        self.X_test = None
        self.y_test = None
        self.prob_test = None
        self.baselines = {}
        self.status_msg: str = ""

        # Nạp dữ liệu ban đầu
        self.load_initial_data()

    def load_initial_data(self):
        if DEFAULT_DATA_PATH.exists():
            self.df_raw = pd.read_csv(DEFAULT_DATA_PATH)
        else:
            # Fallback nếu gọi từ thư mục con
            alt_path = Path("du_lieu_gia_lap_500_sv_may_hoc.csv")
            if alt_path.exists():
                self.df_raw = pd.read_csv(alt_path)
            else:
                raise FileNotFoundError(f"Không tìm thấy file dữ liệu mẫu tại {DEFAULT_DATA_PATH}")

        self.run_pipeline()

    def load_custom_csv(self, file_path_or_buffer) -> bool:
        df_new = pd.read_csv(file_path_or_buffer)
        req_cols = ["ma_sinh_vien_an_danh", "ho_ten_sinh_vien", "khoa_hoc", "diem_qua_trinh_1", "ty_le_vang", "so_lan_hoc_lai", "thoi_gian_tu_hoc", "nhan_rot_mon"]
        for col in req_cols:
            if col not in df_new.columns:
                raise ValueError(f"Tệp CSV thiếu cột bắt buộc: '{col}'")
        self.df_raw = df_new
        self.run_pipeline()
        return True

    def update_config(
        self,
        model_choice: Optional[str] = None,
        calib_method: Optional[str] = None,
        nguong_L1: Optional[float] = None,
        nguong_S1: Optional[float] = None,
        t1: Optional[float] = None,
        t2: Optional[float] = None,
        n_est: Optional[int] = None,
        temp: Optional[float] = None,
    ):
        if model_choice is not None:
            self.model_choice = model_choice
        if calib_method is not None:
            self.calib_method = calib_method
        if nguong_L1 is not None:
            self.nguong_L1 = float(nguong_L1)
        if nguong_S1 is not None:
            self.nguong_S1 = float(nguong_S1)
        if t1 is not None:
            self.t1 = float(t1)
        if t2 is not None:
            self.t2 = float(t2)
        if n_est is not None:
            self.n_est = int(n_est)
        if temp is not None:
            self.temp = float(temp)

        self.run_pipeline()

    def run_pipeline(self):
        mask_L1 = self.df_raw["ty_le_vang"] > self.nguong_L1
        df_tier2 = self.df_raw[~mask_L1].copy()

        try:
            model, X_dev, y_dev, X_test, y_test, prob_test, baselines, status_msg = train_tier2_model(
                df_tier2,
                self.model_choice,
                n_est=self.n_est,
                temp=self.temp,
                calib_method=self.calib_method,
                seed=self.seed
            )
        except Exception:
            # Tự động chuyển fallback an toàn về Logistic Regression như app.py
            model, X_dev, y_dev, X_test, y_test, prob_test, baselines, status_msg = train_tier2_model(
                df_tier2,
                "Logistic Regression (Đối chứng Mục 19.7)",
                calib_method=self.calib_method,
                seed=self.seed
            )

        self.model = model
        self.X_dev = X_dev
        self.y_dev = y_dev
        self.X_test = X_test
        self.y_test = y_test
        self.prob_test = prob_test
        self.baselines = baselines
        self.status_msg = status_msg

        # Tính toán suy luận trên toàn bộ tập dữ liệu
        df_out = self.df_raw.copy()
        probs = np.zeros(len(df_out))
        probs[~mask_L1] = self.model.predict_proba(df_out.loc[~mask_L1, FEATURES_CORE])[:, 1]
        probs[mask_L1] = np.nan
        df_out["xac_suat_rot"] = probs

        df_out[["muc_nguy_co", "nguon_quyet_dinh", "ly_do_chinh", "khuyen_nghi"]] = df_out.apply(
            evaluate_student, axis=1, args=(self.nguong_L1, self.nguong_S1, self.t1, self.t2)
        )
        self.df_out = df_out

    def get_kpi_summary(self) -> Dict[str, Any]:
        cnt_all = len(self.df_out)
        cnt_cao = int((self.df_out["muc_nguy_co"] == "Cao").sum())
        cnt_tb = int((self.df_out["muc_nguy_co"] == "Trung bình").sum())
        cnt_thap = int((self.df_out["muc_nguy_co"] == "Thấp").sum())
        cnt_l1 = int((self.df_out["nguon_quyet_dinh"] == "Luật L1 (Quy chế)").sum())

        return sanitize_for_json({
            "total": cnt_all,
            "cao": cnt_cao,
            "trung_binh": cnt_tb,
            "thap": cnt_thap,
            "l1": cnt_l1,
            # Aliases
            "tong_sv": cnt_all,
            "muc_cao": cnt_cao,
            "muc_tb": cnt_tb,
            "muc_thap": cnt_thap,
            "luat_l1": cnt_l1,
            "pct_cao": round(cnt_cao / cnt_all * 100, 1) if cnt_all > 0 else 0.0,
            "pct_trung_binh": round(cnt_tb / cnt_all * 100, 1) if cnt_all > 0 else 0.0,
            "pct_thap": round(cnt_thap / cnt_all * 100, 1) if cnt_all > 0 else 0.0,
            "pct_l1": round(cnt_l1 / cnt_all * 100, 1) if cnt_all > 0 else 0.0,
        })

    def get_config_summary(self) -> Dict[str, Any]:
        return sanitize_for_json({
            "model_choice": self.model_choice,
            "calib_method": self.calib_method,
            "nguong_L1": self.nguong_L1,
            "nguong_S1": self.nguong_S1,
            "t1": self.t1,
            "t2": self.t2,
            "n_est": self.n_est,
            "temp": self.temp,
            "status_msg": self.status_msg
        })

    def get_filter_options(self) -> Dict[str, List[str]]:
        khoa_list = sorted([str(k) for k in self.df_out["khoa_hoc"].unique().tolist()])
        nguon_list = sorted([str(n) for n in self.df_out["nguon_quyet_dinh"].unique().tolist()])
        return {
            "khoa_hoc": khoa_list,
            "nguon_quyet_dinh": nguon_list,
            "muc_nguy_co": ["Cao", "Trung bình", "Thấp"]
        }

    def get_monotonicity_table(self) -> List[Dict[str, Any]]:
        mono = self.df_out.groupby("muc_nguy_co").agg(
            So_SV=("ma_sinh_vien_an_danh", "count"),
            Ca_rot=("nhan_rot_mon", "sum"),
            Ty_le_rot=("nhan_rot_mon", lambda s: float(s.mean() * 100))
        ).reindex(["Thấp", "Trung bình", "Cao"])

        res = []
        for muc in ["Thấp", "Trung bình", "Cao"]:
            if muc in mono.index:
                row = mono.loc[muc]
                res.append({
                    "muc": muc,
                    "so_sv": int(row["So_SV"]),
                    "ca_rot": int(row["Ca_rot"]),
                    "ty_le_rot": round(float(row["Ty_le_rot"]), 1)
                })
        return sanitize_for_json(res)

    def get_students(
        self,
        search: Optional[str] = None,
        muc_filter: Optional[List[str]] = None,
        khoa_filter: Optional[List[str]] = None,
        nguon_filter: Optional[List[str]] = None,
        only_high_risk: bool = False
    ) -> List[Dict[str, Any]]:
        df_view = self.df_out.copy()

        if only_high_risk:
            df_view = df_view[df_view["muc_nguy_co"] == "Cao"]
        elif muc_filter:
            df_view = df_view[df_view["muc_nguy_co"].isin(muc_filter)]

        if khoa_filter:
            df_view = df_view[df_view["khoa_hoc"].isin(khoa_filter)]
        if nguon_filter:
            df_view = df_view[df_view["nguon_quyet_dinh"].isin(nguon_filter)]

        if search and search.strip():
            q = search.strip().lower()
            df_view = df_view[
                df_view["ho_ten_sinh_vien"].str.lower().str.contains(q, na=False) |
                df_view["ma_sinh_vien_an_danh"].str.lower().str.contains(q, na=False)
            ]

        cols = [
            "ma_sinh_vien_an_danh", "ho_ten_sinh_vien", "khoa_hoc",
            "diem_qua_trinh_1", "ty_le_vang", "so_lan_hoc_lai", "thoi_gian_tu_hoc",
            "xac_suat_rot", "muc_nguy_co", "nguon_quyet_dinh", "ly_do_chinh", "khuyen_nghi"
        ]
        
        # Sắp xếp nếu là nhóm cao
        if only_high_risk:
            df_view = df_view.sort_values(by=["nguon_quyet_dinh", "xac_suat_rot"], ascending=[True, False])

        records = df_view[cols].to_dict(orient="records")
        for r in records:
            r["ma_sinh_vien"] = r["ma_sinh_vien_an_danh"]
            r["ho_ten"] = r["ho_ten_sinh_vien"]
            r["diem_qt1"] = r["diem_qua_trinh_1"]
            r["muc_tu_hoc"] = r["thoi_gian_tu_hoc"]
            r["ly_do"] = r["ly_do_chinh"]
        return sanitize_for_json(records)

    def predict_single(self, ten: str, qt1: float, vang_pct: float, hl: int, th: int) -> Dict[str, Any]:
        vang = float(vang_pct) / 100.0
        x_in = pd.DataFrame([{
            "diem_qua_trinh_1": float(qt1),
            "ty_le_vang": vang,
            "so_lan_hoc_lai": int(hl),
            "thoi_gian_tu_hoc": int(th)
        }])

        p_calc = np.nan if vang > self.nguong_L1 else self.model.predict_proba(x_in)[0, 1]
        r_calc = x_in.iloc[0].to_dict()
        r_calc["xac_suat_rot"] = p_calc

        muc_res, nguon_res, lydo_res, hd_res = evaluate_student(
            pd.Series(r_calc), self.nguong_L1, self.nguong_S1, self.t1, self.t2
        )

        note = get_pedagogical_note(muc_res, nguon_res)

        return sanitize_for_json({
            "ten": ten,
            "qt1": float(qt1),
            "vang_pct": float(vang_pct),
            "hl": int(hl),
            "th": int(th),
            "muc": muc_res,
            "nguon": nguon_res,
            "xac_suat_rot": p_calc,
            "ly_do": lydo_res,
            "khuyen_nghi": hd_res,
            "pedagogical_note": note
        })

    def lookup_student(self, student_id: str, pin: str) -> Dict[str, Any]:
        if pin != "123456":
            return {"authenticated": False, "error": "Mật khẩu xác thực không đúng. Mật khẩu mặc định là: 123456"}

        sv_clean = student_id.strip()
        match = self.df_out[self.df_out["ma_sinh_vien_an_danh"] == sv_clean]
        if len(match) == 0:
            return {"authenticated": False, "error": f"Không tìm thấy mã sinh viên '{sv_clean}' trong danh sách học vụ."}

        sv = match.iloc[0].to_dict()
        res_data = {
            "authenticated": True,
            "student": sv,
            "ma_sinh_vien": sv.get("ma_sinh_vien_an_danh"),
            "ho_ten": sv.get("ho_ten_sinh_vien"),
            "diem_qt1": sv.get("diem_qua_trinh_1"),
            "ty_le_vang": sv.get("ty_le_vang"),
            "so_lan_hoc_lai": sv.get("so_lan_hoc_lai"),
            "muc_tu_hoc": sv.get("thoi_gian_tu_hoc"),
            "xac_suat_rot": sv.get("xac_suat_rot"),
            "muc_nguy_co": sv.get("muc_nguy_co"),
            "nguon_quyet_dinh": sv.get("nguon_quyet_dinh"),
            "ly_do": sv.get("ly_do_chinh"),
            "khuyen_nghi": sv.get("khuyen_nghi"),
            "khoa_hoc": sv.get("khoa_hoc")
        }
        return sanitize_for_json(res_data)

    def get_evaluation_data(self, k: int = 4) -> Dict[str, Any]:
        k_clusters = max(2, min(6, int(k)))

        # 1. Các chỉ số metrics trên D_test
        auc_t = float(roc_auc_score(self.y_test, self.prob_test))
        brier_t = float(brier_score_loss(self.y_test, self.prob_test))
        rec_t = float(recall_score(self.y_test, (self.prob_test >= self.t1).astype(int)))
        prec_cao = float(precision_score(self.y_test, (self.prob_test >= self.t2).astype(int), zero_division=0))

        # 2. Bootstrap 95% CI (B=500, random_state=42)
        rng_bs = np.random.RandomState(42)
        bs_aucs, bs_briers = [], []
        for _ in range(500):
            bs_idx = rng_bs.randint(0, len(self.y_test), len(self.y_test))
            if len(np.unique(self.y_test.iloc[bs_idx])) < 2:
                continue
            bs_aucs.append(roc_auc_score(self.y_test.iloc[bs_idx], self.prob_test[bs_idx]))
            bs_briers.append(brier_score_loss(self.y_test.iloc[bs_idx], self.prob_test[bs_idx]))

        auc_ci_low = float(np.percentile(bs_aucs, 2.5))
        auc_ci_high = float(np.percentile(bs_aucs, 97.5))
        brier_ci_low = float(np.percentile(bs_briers, 2.5))
        brier_ci_high = float(np.percentile(bs_briers, 97.5))

        # Bảng đối chứng 3 mốc sàn
        comp_table = [
            {
                "model_name": "Mốc sàn 1: Tỷ lệ nền (Dummy)",
                "brier_score": round(self.baselines["Tỷ lệ nền (Dummy)"]["Brier"], 4),
                "roc_auc": round(self.baselines["Tỷ lệ nền (Dummy)"]["AUC"], 3),
                "ci_note": "Điểm tham chiếu tối thiểu"
            },
            {
                "model_name": "Mốc sàn 2: Cây 1 nút (Điểm QT1)",
                "brier_score": round(self.baselines["Luật 1 thuộc tính (Điểm QT1)"]["Brier"], 4),
                "roc_auc": round(self.baselines["Luật 1 thuộc tính (Điểm QT1)"]["AUC"], 3),
                "ci_note": "Mô hình đơn biến thực tế"
            },
            {
                "model_name": f"Mô hình được chọn ({self.model_choice})",
                "brier_score": round(brier_t, 4),
                "roc_auc": round(auc_t, 3),
                "ci_note": f"95% CI: AUC [{auc_ci_low:.3f}–{auc_ci_high:.3f}], Brier [{brier_ci_low:.4f}–{brier_ci_high:.4f}]"
            }
        ]

        # 3. Tọa độ đường cong ROC & 2 điểm T1, T2
        fpr, tpr, ths = roc_curve(self.y_test, self.prob_test)
        idx_t1 = int(np.argmin(np.abs(ths - self.t1)))
        idx_t2 = int(np.argmin(np.abs(ths - self.t2)))

        roc_data = {
            "fpr": [float(x) for x in fpr],
            "tpr": [float(y) for y in tpr],
            "auc": round(auc_t, 3),
            "point_t1": {
                "threshold": self.t1,
                "fpr": float(fpr[idx_t1]),
                "tpr": float(tpr[idx_t1]),
            },
            "point_t2": {
                "threshold": self.t2,
                "fpr": float(fpr[idx_t2]),
                "tpr": float(tpr[idx_t2]),
            }
        }

        # 4. Tọa độ biểu đồ hiệu chỉnh xác suất (Calibration Curve)
        pt, pp = calibration_curve(self.y_test, self.prob_test, n_bins=5)
        calibration_data = {
            "predicted_prob": [float(p) for p in pp],
            "true_proportion": [float(t) for t in pt],
            "brier_score": round(brier_t, 4)
        }

        # 5. Phân cụm K-Means++ trên X_dev (M10, KB15)
        scaler_km = StandardScaler()
        X_dev_sc = scaler_km.fit_transform(self.X_dev)
        km = KMeans(n_clusters=k_clusters, init="k-means++", n_init=10, random_state=42)
        cluster_labels = km.fit_predict(X_dev_sc)

        df_km = self.X_dev.copy()
        df_km["Cum"] = [f"Cụm {c+1}" for c in cluster_labels]
        df_km["nhan_rot_mon"] = self.y_dev.values

        profile_km = df_km.groupby("Cum").agg(
            So_SV=("diem_qua_trinh_1", "count"),
            Diem_QT1_TB=("diem_qua_trinh_1", lambda s: round(float(s.mean()), 2)),
            Ty_le_vang_TB=("ty_le_vang", lambda s: round(float(s.mean() * 100), 1)),
            Hoc_lai_TB=("so_lan_hoc_lai", lambda s: round(float(s.mean()), 2)),
            Tu_hoc_TB=("thoi_gian_tu_hoc", lambda s: round(float(s.mean()), 2)),
            Ty_le_rot_TB=("nhan_rot_mon", lambda s: round(float(s.mean() * 100), 1))
        ).reset_index().to_dict(orient="records")

        # Rút gọn danh sách điểm dữ liệu (tối đa 400 mẫu dev) để vẽ biểu đồ phân tán K-Means
        points_km = df_km[["diem_qua_trinh_1", "ty_le_vang", "thoi_gian_tu_hoc", "Cum", "nhan_rot_mon"]].to_dict(orient="records")

        return sanitize_for_json({
            "metrics": {
                "auc": round(auc_t, 3),
                "auc_ci": [round(auc_ci_low, 3), round(auc_ci_high, 3)],
                "brier": round(brier_t, 4),
                "brier_ci": [round(brier_ci_low, 4), round(brier_ci_high, 4)],
                "recall_t1": round(rec_t * 100, 1),
                "precision_t2": round(prec_cao * 100, 1),
            },
            "comparison_table": comp_table,
            "roc_curve": roc_data,
            "calibration_curve": calibration_data,
            "kmeans": {
                "k": k_clusters,
                "summary": profile_km,
                "points": points_km
            }
        })

    def log_intervention(self, ma_sv: str, ho_ten: str, hanh_dong: str, ghi_chu: str) -> List[Dict[str, Any]]:
        log_entry = {
            "thoi_gian": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S"),
            "ma_sinh_vien": ma_sv,
            "ho_ten": ho_ten,
            "hanh_dong_can_thiep": hanh_dong if hanh_dong else "Ghi chú theo dõi",
            "ghi_chu_giang_vien": ghi_chu if ghi_chu else "Không có",
            "nguoi_ghi_nhan": "Giảng viên phụ trách"
        }
        df_row = pd.DataFrame([log_entry])
        if INTERVENTION_LOG_PATH.exists():
            df_row.to_csv(INTERVENTION_LOG_PATH, mode="a", header=False, index=False, encoding="utf-8-sig")
        else:
            df_row.to_csv(INTERVENTION_LOG_PATH, index=False, encoding="utf-8-sig")
        return self.get_interventions()

    def get_interventions(self) -> List[Dict[str, Any]]:
        if INTERVENTION_LOG_PATH.exists():
            try:
                df = pd.read_csv(INTERVENTION_LOG_PATH)
                return sanitize_for_json(df.to_dict(orient="records"))
            except Exception:
                return []
        return []

    def log_feedback(self, ma_sv: str, ho_ten: str, loai_sai_lech: str, noi_dung: str) -> bool:
        entry = {
            "thoi_gian": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S"),
            "ma_sinh_vien": ma_sv,
            "ho_ten": ho_ten,
            "loai_sai_lech": loai_sai_lech,
            "noi_dung_minh_chung": noi_dung,
            "trang_thai_xu_ly": "Chờ Giảng viên phê duyệt"
        }
        df_row = pd.DataFrame([entry])
        if FEEDBACK_LOG_PATH.exists():
            df_row.to_csv(FEEDBACK_LOG_PATH, mode="a", header=False, index=False, encoding="utf-8-sig")
        else:
            df_row.to_csv(FEEDBACK_LOG_PATH, index=False, encoding="utf-8-sig")
        return True

    def export_csv_bytes(
        self,
        search: Optional[str] = None,
        muc_filter: Optional[List[str]] = None,
        khoa_filter: Optional[List[str]] = None,
        nguon_filter: Optional[List[str]] = None
    ) -> bytes:
        df_view = self.df_out.copy()

        if muc_filter:
            df_view = df_view[df_view["muc_nguy_co"].isin(muc_filter)]
        if khoa_filter:
            df_view = df_view[df_view["khoa_hoc"].isin(khoa_filter)]
        if nguon_filter:
            df_view = df_view[df_view["nguon_quyet_dinh"].isin(nguon_filter)]

        if search and search.strip():
            q = search.strip().lower()
            df_view = df_view[
                df_view["ho_ten_sinh_vien"].str.lower().str.contains(q, na=False) |
                df_view["ma_sinh_vien_an_danh"].str.lower().str.contains(q, na=False)
            ]

        cols = [
            "ma_sinh_vien_an_danh", "ho_ten_sinh_vien", "khoa_hoc",
            "diem_qua_trinh_1", "ty_le_vang", "so_lan_hoc_lai", "thoi_gian_tu_hoc",
            "xac_suat_rot", "muc_nguy_co", "nguon_quyet_dinh", "ly_do_chinh", "khuyen_nghi"
        ]
        return df_view[cols].to_csv(index=False).encode("utf-8-sig")


# Khởi tạo singleton instance sẵn sàng phục vụ server
engine = EarlyWarningMLEngine()
