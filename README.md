# 🛡️ EduGuard. — Hệ Thống Cảnh Báo Sớm Nguy Cơ Rớt Môn (CS301_ML)

> **Dự án Môn học Máy học (CS301) — Khoa Khoa học Máy tính**  
> Thiết kế giao diện Dashboard chuẩn phong cách **Portal-std.** kết hợp gam màu **Vibrant Rose Blush**, ứng dụng kiến trúc suy luận phân tầng kết hợp Luật Quy chế Sư phạm và Mô hình Học máy có hiệu chỉnh xác suất.

---

## 📸 Tổng Quan Giao Diện & Tính Năng

Ứng dụng được xây dựng theo tiêu chuẩn **AI EdTech Dashboard / SaaS hiện đại**:
- **Bento Grid Layout**: Các khối thẻ bo góc lớn `24px`, hiệu ứng viền mờ `backdrop-filter: blur(12px)`, đổ bóng êm ái.
- **Top Navigation Pill Bar**: Thanh điều hướng viên thuốc ngang nổi bật 5 phân hệ chức năng.
- **Floating KPI Counters**: 5 chỉ số nổi trực tiếp trên nền gradient (Tổng SV, Nguy cơ Cao, Trung bình, Thấp, Cấm thi Luật L1).
- **Hệ thống Biểu đồ Tương tác**: Vẽ bằng **Chart.js** (Đường cong ROC kèm 2 mốc sàn T1/T2, Đường cong hiệu chỉnh Calibration, và Biểu đồ phân cụm K-Means++ tương tác).
- **Trợ lý Giọng nói Sư phạm**: Tích hợp **Web Speech API tiếng Việt (`vi-VN`)** đọc to nhận xét học vụ và khuyến nghị sư phạm.

---

## 🗂️ Cấu Trúc 5 Phân Hệ (Tabs)

1. **Trợ lý Học vụ AI CS301 (AI Assistant)**:
   - 4 kịch bản kiểm tra nhanh 1-Click với tên sinh viên chuẩn thuần Việt:
     - *Lê Minh Tuấn* (Vắng 30% — Cấm thi L1).
     - *Trần Bảo Ngọc* (Vắng 18% — Kích hoạt Luật sàn S1).
     - *Nguyễn Hoàng Nam* (Điểm QT1 thấp 4.0, học lại 2 lần).
     - *Đặng Thị Phương Thảo* (Điểm QT1 8.5, an toàn).
   - Form nhập liệu tùy biến tính toán xác suất rớt tức thì.
   - Thẻ kết quả phân tích học vụ, thanh phần trăm Capsule cao cấp và nút phát âm thanh trợ lý ảo.
2. **Quản lý Lớp học (Classroom)**:
   - Bảng dữ liệu 500 sinh viên kèm cột thanh tiến trình xác suất rớt trực quan hóa bằng màu sắc.
   - Bộ lọc đa tiêu chí: Khóa học (K64–K67), Mức nguy cơ (Cao/TB/Thấp) và Nguồn ra quyết định.
   - Biểu đồ cột phân bố tỷ lệ rớt thực tế và Biểu đồ đồng hồ Gauge tiến độ lớp học.
3. **Cố vấn Học tập (Advisor Hub)**:
   - Danh sách sinh viên thuộc diện nguy cơ cao cần can thiệp sư phạm khẩn cấp.
   - Thao tác gửi nhắc nhở học tập hoặc đặt lịch hẹn gặp riêng.
   - Bảng nhật ký can thiệp sư phạm lưu trữ theo thời gian thực.
4. **Cổng Tra cứu Sinh viên (Student Portal)**:
   - Đăng nhập bảo mật bằng MSSV và mã PIN (Tài khoản demo: `SV_K67_0020`, PIN: `123456`).
   - Thẻ Hồ sơ cá nhân hiển thị ảnh đại diện, kết quả đánh giá và lời khuyên học tập sư phạm riêng biệt.
   - Biểu mẫu phản ánh sai lệch thông tin điểm/chuyên cần gửi về Ban Cố vấn.
5. **Đánh giá & Thẩm định Mô hình ML (Model Evaluation)**:
   - Bảng đối chứng 2 mốc sàn (Tỷ lệ nền Dummy & Luật 1 thuộc tính Điểm QT1).
   - 4 độ đo đánh giá (AUC, Brier score, Recall tại T1, Precision tại T2) tính kèm **Khoảng tin cậy 95% Bootstrap (B=500)**.
   - Biểu đồ đường cong ROC (hiển thị vị trí 2 điểm ngưỡng vận hành T1, T2).
   - Biểu đồ đường cong hiệu chỉnh độ tin cậy (Calibration Curve).
   - Trực quan hóa không gian phân cụm **K-Means++** kèm thanh trượt thay đổi linh hoạt số cụm $K \in [2, 6]$.

---

## ⚙️ Kiến Trúc Công Nghệ

```text
EduGuard/
├── CHAY_UNG_DUNG.bat             # File khởi chạy 1-Click tự động hóa môi trường trên Windows
├── HUONG_DAN_SU_DUNG.txt         # Tài liệu hướng dẫn sử dụng và tài khoản test
├── README.md                     # Tài liệu giới thiệu tổng quan hệ thống
└── he_thong/
    ├── requirements.txt          # Thư viện: fastapi, uvicorn, pandas, numpy, scikit-learn
    ├── start_app.py              # Script khởi chạy uvicorn & tự động mở trình duyệt web
    ├── du_lieu_gia_lap_500_sv_may_hoc.csv  # Tập dữ liệu 500 sinh viên
    ├── nhat_ky_can_thiep.csv     # Nhật ký can thiệp học vụ
    ├── phan_hoi_sai_lech.csv     # Tiếp nhận phản hồi từ sinh viên
    └── webapp/
        ├── ml_engine.py          # Pipeline Tầng 1 (L1/S1) & Tầng 2 (Logistic/KNN/Platt)
        ├── server.py             # Máy chủ FastAPI RESTful JSON APIs
        └── static/
            ├── index.html        # Khung giao diện HTML5 Bento
            ├── styles.css        # Hệ màu Soft Pink / Rose Blush & Animation
            ├── app.js            # Logic frontend tương tác, Chart.js & Web Speech API
            └── mock_data.js      # Bộ dữ liệu Offline Mock dự phòng thông minh
```

---

## 🚀 Hướng Dẫn Khởi Chạy

### Cách 1: Chạy 1-Click trên Windows (Khuyên dùng)
Chỉ cần nhấp đúp vào file:
```bash
CHAY_UNG_DUNG.bat
```
File sẽ tự động:
1. Kiểm tra Python trên máy.
2. Tự động tạo môi trường ảo `.venv` và cài đặt 6 thư viện nhẹ cần thiết.
3. Bật máy chủ FastAPI và tự động mở trình duyệt tại `http://127.0.0.1:8000`.

*(Trường hợp máy tính chưa cài Python, file sẽ tự động mở xem trước toàn bộ giao diện tĩnh hoàn chỉnh ngay trên trình duyệt).*

### Cách 2: Chạy bằng dòng lệnh (Dành cho macOS / Linux / Developers)
```bash
cd he_thong
python -m venv .venv
source .venv/bin/activate  # Trên Windows: .venv\Scripts\activate
pip install -r requirements.txt
python start_app.py
```
Trình duyệt sẽ tự động mở giao diện tại `http://127.0.0.1:8000`.

---
*Phát triển bởi DawgKoa — Dự án Đồ án / Bài tập lớn Môn Học máy CS301.*
