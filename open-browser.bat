@echo off
chcp 65001 >nul 2>&1
setlocal

set PORT=%1

for /l %%i in (1,1,60) do (
    timeout /t 1 /nobreak >nul
    powershell -NoProfile -Command "try{if((Invoke-WebRequest -Uri 'http://localhost:%PORT%/post/index.html' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200){exit 0}}catch{exit 1}" >nul 2>&1
    if not errorlevel 1 (
        start http://localhost:%PORT%/post/index.html
        exit /b 0
    )
)
