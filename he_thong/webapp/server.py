import io
import os
from pathlib import Path
from typing import Dict, Any, List, Optional

import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, Query, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from webapp.ml_engine import engine

# Đường dẫn thư mục static & gốc
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = Path(__file__).resolve().parent / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)

# Khởi tạo FastAPI app
app = FastAPI(
    title="CS301_ML Early Warning API",
    description="Backend API cho Hệ thống Cảnh báo sớm Nguy cơ Rớt môn (3 Mức) — Môn Máy học",
    version="2.0.0"
)

# Kích hoạt CORS đầy đủ để dễ dàng phát triển Frontend độc lập
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount thư mục static assets
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ==============================================================================
# PYDANTIC SCHEMAS
# ==============================================================================
class ConfigUpdateRequest(BaseModel):
    model_choice: Optional[str] = Field(None, description="Tên mô hình Tầng 2")
    calib_method: Optional[str] = Field(None, description="Phương pháp hiệu chỉnh xác suất")
    nguong_L1: Optional[float] = Field(None, ge=0.10, le=0.35, description="Ngưỡng vắng cấm thi L1 (0.10 – 0.35)")
    nguong_S1: Optional[float] = Field(None, ge=0.05, le=0.25, description="Ngưỡng vắng luật sàn S1 (0.05 – 0.25)")
    t1: Optional[float] = Field(None, ge=0.10, le=0.50, description="Ngưỡng T1 Thấp -> Trung bình")
    t2: Optional[float] = Field(None, ge=0.40, le=0.85, description="Ngưỡng T2 Trung bình -> Cao")
    n_est: Optional[int] = Field(None, description="Số thành viên tổ hợp TabPFN")
    temp: Optional[float] = Field(None, description="Nhiệt độ softmax TabPFN")


class SinglePredictRequest(BaseModel):
    ten: str = Field("Huỳnh Đăng Khoa", description="Họ và tên sinh viên")
    qt1: float = Field(..., ge=0.0, le=10.0, description="Điểm quá trình 1 (0–10)")
    vang_pct: float = Field(..., ge=0.0, le=100.0, description="Tỷ lệ vắng mặt (%)")
    hl: int = Field(0, ge=0, le=10, description="Số lần học lại môn này")
    th: int = Field(1, ge=1, le=4, description="Mức tự học ở nhà (1: <2h, 2: 2–5h, 3: 5–10h, 4: >10h)")


class StudentLookupRequest(BaseModel):
    student_id: str = Field(..., description="Mã số sinh viên (ví dụ: SV_K67_0020)")
    pin: str = Field("123456", description="Mật khẩu xác thực tài khoản sinh viên")


class InterventionLogRequest(BaseModel):
    ma_sinh_vien: str = Field(..., description="Mã số sinh viên")
    ho_ten: str = Field(..., description="Họ tên sinh viên")
    hanh_dong_can_thiep: str = Field(..., description="Hành động sư phạm đã thực hiện")
    ghi_chu_giang_vien: Optional[str] = Field("", description="Ghi chú chi tiết của Giảng viên")


class FeedbackLogRequest(BaseModel):
    ma_sinh_vien: str = Field(..., description="Mã số sinh viên")
    ho_ten: str = Field(..., description="Họ tên sinh viên")
    loai_sai_lech: str = Field(..., description="Loại sai lệch thông tin cần xác minh")
    noi_dung_minh_chung: str = Field(..., description="Nội dung minh chứng chi tiết")


# ==============================================================================
# HÀM TỔNG HỢP TRẠNG THÁI TOÀN BỘ (STATE)
# ==============================================================================
def build_system_state():
    return {
        "kpi": engine.get_kpi_summary(),
        "config": engine.get_config_summary(),
        "filter_options": engine.get_filter_options(),
        "monotonicity": engine.get_monotonicity_table(),
        "students": engine.get_students()
    }


# ==============================================================================
# ROUTE PHỤC VỤ TRANG GIAO DIỆN (INDEX.HTML)
# ==============================================================================
@app.get("/", summary="Trang chủ ứng dụng")
def read_root():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {
        "message": "CS301_ML Early Warning API đang hoạt động.",
        "note": "File webapp/static/index.html chưa được tạo. API docs sẵn sàng tại /docs"
    }


@app.get("/styles.css", include_in_schema=False)
def get_root_css():
    return FileResponse(STATIC_DIR / "styles.css")


@app.get("/app.js", include_in_schema=False)
def get_root_js():
    return FileResponse(STATIC_DIR / "app.js")


@app.get("/mock_data.js", include_in_schema=False)
def get_root_mock():
    return FileResponse(STATIC_DIR / "mock_data.js")


# ==============================================================================
# CÁC API ENDPOINTS
# ==============================================================================
@app.get("/api/state", summary="Lấy toàn bộ trạng thái hệ thống")
def get_state():
    """
    Trả về toàn bộ trạng thái hiện thời của hệ thống:
    - kpi: Thống kê 5 chỉ số (Tổng SV, Cao, Trung bình, Thấp, L1).
    - config: Cấu hình mô hình, phương pháp hiệu chỉnh và các ngưỡng.
    - filter_options: Danh sách khóa học, nguồn quyết định cho bộ lọc.
    - monotonicity: Bảng kiểm tra tính đơn điệu 3 mức nguy cơ.
    - students: Danh sách toàn bộ 500 sinh viên kèm kết quả đánh giá.
    """
    return build_system_state()


@app.post("/api/config", summary="Cập nhật cấu hình mô hình & ngưỡng")
def update_config(req: ConfigUpdateRequest):
    """
    Cập nhật các tham số điều hành:
    - model_choice, calib_method, nguong_L1, nguong_S1, t1, t2, n_est, temp.
    Tự động chạy lại suy luận và trả về trạng thái mới nhất.
    """
    try:
        engine.update_config(
            model_choice=req.model_choice,
            calib_method=req.calib_method,
            nguong_L1=req.nguong_L1,
            nguong_S1=req.nguong_S1,
            t1=req.t1,
            t2=req.t2,
            n_est=req.n_est,
            temp=req.temp
        )
        return {
            "success": True,
            "message": "Cập nhật cấu hình và suy luận lại thành công.",
            "state": build_system_state()
        }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.post("/api/upload", summary="Tải lên tệp CSV lớp học khác")
async def upload_classroom_csv(file: UploadFile = File(...)):
    """
    Nhận tệp CSV danh sách lớp học mới, kiểm tra các cột bắt buộc,
    huấn luyện & suy luận lại kiến trúc 2 tầng và trả về state mới.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tệp tải lên phải có định dạng CSV (.csv)"
        )
    try:
        contents = await file.read()
        buffer = io.BytesIO(contents)
        engine.load_custom_csv(buffer)
        return {
            "success": True,
            "filename": file.filename,
            "message": f"Đã nạp thành công tệp '{file.filename}' và cập nhật toàn bộ hệ thống.",
            "state": build_system_state()
        }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.post("/api/predict", summary="Dự báo & Phân tích nguy cơ 1 sinh viên (AI Chat)")
def predict_single_student(req: SinglePredictRequest):
    """
    Nhận thông tin 1 sinh viên từ form hoặc kịch bản kiểm tra nhanh:
    - ten, qt1, vang_pct, hl, th
    Trả về:
    - muc: Cao / Trung bình / Thấp
    - nguon: Luật L1 / Luật sàn S1 + Mô hình / Mô hình Tầng 2
    - xac_suat_rot: float hoặc None (nếu dính luật L1)
    - ly_do: chuỗi lý giải sư phạm
    - khuyen_nghi: kế hoạch hành động
    - pedagogical_note: ghi chú sư phạm (type, title, content)
    """
    try:
        res = engine.predict_single(
            ten=req.ten,
            qt1=req.qt1,
            vang_pct=req.vang_pct,
            hl=req.hl,
            th=req.th
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@app.get("/api/interventions", summary="Đọc lịch sử nhật ký can thiệp sư phạm (CN5)")
def get_interventions():
    """
    Trả về danh sách các lượt can thiệp sư phạm đã lưu từ tệp nhat_ky_can_thiep.csv.
    """
    return engine.get_interventions()


@app.post("/api/interventions", summary="Ghi nhận nhật ký can thiệp sư phạm (CN5)")
def record_intervention(req: InterventionLogRequest):
    """
    Lưu một bản ghi can thiệp thực tế vào tệp nhat_ky_can_thiep.csv và trả về danh sách cập nhật.
    """
    try:
        logs = engine.log_intervention(
            ma_sv=req.ma_sinh_vien,
            ho_ten=req.ho_ten,
            hanh_dong=req.hanh_dong_can_thiep,
            ghi_chu=req.ghi_chu_giang_vien or ""
        )
        return {
            "success": True,
            "message": f"Đã lưu nhật ký can thiệp cho sinh viên {req.ho_ten} ({req.ma_sinh_vien}).",
            "interventions": logs
        }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@app.post("/api/student-lookup", summary="Xác thực & Tra cứu hồ sơ cá nhân sinh viên (CN7)")
def student_lookup(req: StudentLookupRequest):
    """
    Xác thực sinh viên với mã SV và mật khẩu (mặc định demo: 123456).
    Trả về hồ sơ cá nhân và cảnh báo riêng tư nếu hợp lệ.
    """
    res = engine.lookup_student(student_id=req.student_id, pin=req.pin)
    if not res.get("authenticated"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=res.get("error"))
    return res


@app.post("/api/feedback", summary="Gửi phản hồi sai lệch dữ liệu học vụ (CN8)")
def submit_feedback(req: FeedbackLogRequest):
    """
    Lưu phản ánh sai lệch điểm danh/điểm số của sinh viên vào tệp phan_hoi_sai_lech.csv.
    """
    try:
        engine.log_feedback(
            ma_sv=req.ma_sinh_vien,
            ho_ten=req.ho_ten,
            loai_sai_lech=req.loai_sai_lech,
            noi_dung=req.noi_dung_minh_chung
        )
        return {
            "success": True,
            "message": f"Yêu cầu xác minh của sinh viên {req.ho_ten} ({req.ma_sinh_vien}) đã được ghi nhận."
        }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@app.get("/api/evaluation", summary="Lấy dữ liệu đánh giá mô hình & phân cụm K-Means++ (M7, M10)")
def get_evaluation(k: int = Query(4, ge=2, le=6, description="Số lượng cụm K-Means++ (2–6)")):
    """
    Trả về toàn bộ dữ liệu khoa học để vẽ biểu đồ và phân tích:
    - metrics: AUC, Brier, Recall, Precision kèm khoảng tin cậy 95% Bootstrap (B=500).
    - comparison_table: Bảng đối chứng 3 mốc sàn (Dummy, Cây 1 nút, Mô hình chọn).
    - roc_curve: Tọa độ FPR, TPR, điểm ngưỡng T1, T2.
    - calibration_curve: Tọa độ hiệu chỉnh xác suất thực tế vs lý tưởng.
    - kmeans: Bảng tổng hợp đặc trưng từng cụm và các điểm dữ liệu phân tán.
    """
    try:
        return engine.get_evaluation_data(k=k)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@app.get("/api/export-csv", summary="Xuất danh sách sinh viên theo bộ lọc (CSV)")
def export_csv(
    search: Optional[str] = Query(None, description="Từ khóa tìm kiếm họ tên hoặc mã SV"),
    muc: Optional[List[str]] = Query(None, description="Danh sách mức nguy cơ (Cao, Trung bình, Thấp)"),
    khoa: Optional[List[str]] = Query(None, description="Danh sách khóa học"),
    nguon: Optional[List[str]] = Query(None, description="Danh sách nguồn quyết định")
):
    """
    Xuất danh sách sinh viên ra tệp CSV có mã hóa utf-8-sig (hỗ trợ tiếng Việt trên Excel).
    """
    try:
        csv_bytes = engine.export_csv_bytes(
            search=search,
            muc_filter=muc,
            khoa_filter=khoa,
            nguon_filter=nguon
        )
        return Response(
            content=csv_bytes,
            media_type="text/csv",
            headers={
                "Content-Disposition": "attachment; filename=danh_sach_canh_bao_CS301.csv"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# ==============================================================================
# KHỞI CHẠY SERVER QUA UVICORN
# ==============================================================================
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
