@echo off
title EduGuard - He thong Canh bao som Nguy co Rot mon (CS301_ML)
cd /d "%~dp0"

echo ====================================================================
echo    HE THONG CANH BAO SOM NGUY CO ROT MON - EDUGUARD (CS301_ML)
echo ====================================================================
echo.

set "PYTHON_CMD="
where python >nul 2>&1 && set "PYTHON_CMD=python"
if "%PYTHON_CMD%"=="" where py >nul 2>&1 && set "PYTHON_CMD=py"
if "%PYTHON_CMD%"=="" (
    for /d %%p in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
        if exist "%%p\python.exe" set "PYTHON_CMD=%%p\python.exe"
    )
)

if "%PYTHON_CMD%"=="" goto :NO_PYTHON

echo [OK] Phat hien Python: %PYTHON_CMD%

set "VENV_DIR=%~dp0he_thong\.venv"
set "RUN_PY=%VENV_DIR%\Scripts\python.exe"

REM Neu da cai dat uvicorn roi thi chay ngay lap tuc
if exist "%RUN_PY%" (
    "%RUN_PY%" -c "import uvicorn" >nul 2>&1
    if not errorlevel 1 goto :START_SERVER
)

REM Neu chua co moi truong ao thi tao moi
if not exist "%RUN_PY%" (
    echo [1/2] Dang khoi tao moi truong ao .venv trong he_thong...
    %PYTHON_CMD% -m venv "%VENV_DIR%"
)

REM Cai dat cac thu vien can thiet
if exist "%RUN_PY%" (
    echo [2/2] Dang cai dat cac thu vien can thiet tu requirements.txt...
    "%RUN_PY%" -m pip install -r "%~dp0he_thong\requirements.txt" --no-warn-script-location
    echo [OK] Cai dat thu vien hoan tat!
    goto :START_SERVER
)

echo [THONG BAO] Dung truc tiep Python he thong.
set "RUN_PY=%PYTHON_CMD%"
%PYTHON_CMD% -m pip install -r "%~dp0he_thong\requirements.txt" --no-warn-script-location

:START_SERVER
echo.
echo ====================================================================
echo  Dang chay may chu EduGuard tai: http://127.0.0.1:8000
echo  Trinh duyet web se tu dong bat len sau 1.5 giay...
echo.
echo  [CHU Y] KHONG TAT cua so nay trong khi dang su dung.
echo  Nhan Ctrl + C de dung may chu khi hoan tat.
echo ====================================================================
echo.

cd /d "%~dp0he_thong"
"%RUN_PY%" start_app.py
pause
exit /b 0

:NO_PYTHON
echo [THONG BAO] May tinh chua cai dat Python hoac chua them vao PATH.
echo Dang tu dong mo xem truoc Giao dien Web tren trinh duyet...
start "" "%~dp0he_thong\webapp\static\index.html"
echo.
echo [HUONG DAN] De he thong ket noi truc tiep voi Mo hinh May hoc:
echo Vui long cai dat Python tai https://www.python.org/
echo Nho tich chon vao muc Add python.exe to PATH khi cai dat.
echo ====================================================================
pause
exit /b 0
