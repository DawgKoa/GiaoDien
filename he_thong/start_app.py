"""
==============================================================================
EDUGUARD — BỘ KHỞI ĐỘNG ỨNG DỤNG WEB (START_APP.PY)
Hệ thống Cảnh báo sớm Nguy cơ Rớt môn (Môn Học Máy - CS301)
Tự động mở trình duyệt web và chạy máy chủ Uvicorn ổn định.
==============================================================================
"""

import os
import sys
import time
import threading
import webbrowser
from pathlib import Path

# Đảm bảo đường dẫn gốc của dự án luôn nằm trong sys.path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import uvicorn
from webapp.server import app

PORT = 8000
HOST = "127.0.0.1"
URL = f"http://{HOST}:{PORT}"

def auto_open_browser():
    """Tự động mở trình duyệt mặc định sau 1.5 giây khi máy chủ sẵn sàng."""
    time.sleep(1.5)
    try:
        print(f"\n[INFO] Dang tu dong mo trinh duyet tai: {URL}")
        webbrowser.open(URL)
    except Exception as e:
        print(f"[CANH BAO] Khong the tu dong mo trinh duyet: {e}")
        print(f"-> Vui long mo trinh duyet va truy cap thu cong: {URL}")

def main():
    print("=" * 66)
    print("   HE THONG CANH BAO SOM NGUY CO ROT MON - EDUGUARD (CS301_ML)   ")
    print("=" * 66)
    print(f" [OK] Dia chi truy cap: {URL}")
    print(" [OK] Trinh duyet web se tu dong bat len sau 1.5 giay...")
    print(" [LƯU Ý] Vui long GIU NGUYEN cua so nay trong suot qua trinh su dung.")
    print("         Nhan Ctrl + C de dung may chu khi hoan tat.")
    print("=" * 66)

    # Khởi chạy tiểu trình hẹn giờ mở trình duyệt
    threading.Thread(target=auto_open_browser, daemon=True).start()

    # Chạy uvicorn ở chế độ production ổn định (reload=False)
    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        log_level="info",
        access_log=True
    )

if __name__ == "__main__":
    main()
