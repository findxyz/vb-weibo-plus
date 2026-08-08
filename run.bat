@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

set JAR=weibo-plus.jar

if not exist "%~dp0%JAR%" (
    echo [错误] 找不到 %JAR%，请将 jar 包放在本脚本同目录下。
    pause
    exit /b 1
)

rem ===== JDK version check (requires 21+) =====
java -version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 java 命令，请先安装 JDK 21 或以上版本并配置 PATH。
    echo 下载地址：https://www.oracle.com/java/technologies/downloads/
    pause
    exit /b 1
)

set JAVA_VER=
for /f "tokens=3" %%v in ('java -version 2^>^&1 ^| findstr /r "version"') do (
    if not defined JAVA_VER set "JAVA_VER=%%~v"
)

set JAVA_MAJOR=
for /f "tokens=1 delims=." %%a in ("%JAVA_VER%") do set "JAVA_MAJOR=%%a"

if not defined JAVA_MAJOR (
    echo [错误] 无法解析 JDK 版本，请确认已正确安装 JDK 21 或以上版本。
    echo 下载地址：https://www.oracle.com/java/technologies/downloads/
    pause
    exit /b 1
)

if !JAVA_MAJOR! LSS 21 (
    echo [错误] JDK 版本过低：当前 !JAVA_VER!，要求 21 或以上。
    echo 下载地址：https://www.oracle.com/java/technologies/downloads/
    pause
    exit /b 1
)

rem ===== Optional parameters (override via env vars before running) =====
rem WEIBO_PORT            - server port, default 18080
rem WEIBO_DATABASE_PATH   - database file path, default weibo.db
rem WEIBO_FFMPEG_PATH     - ffmpeg path for HEIC transcoding, empty to skip
rem WEIBO_AI_BASE_URL      - OpenAI compatible API base URL, empty to disable
rem WEIBO_AI_API_KEY       - AI API key
rem WEIBO_AI_MODEL         - AI model name
rem WEIBO_AUTO_SYNC_GIDS   - group IDs for auto sync, comma separated, empty to skip

if not defined WEIBO_PORT set "WEIBO_PORT=18080"
if not defined WEIBO_DATABASE_PATH set "WEIBO_DATABASE_PATH=weibo.db"

echo ============================================
echo   vb-weibo-plus
echo ============================================
echo   端口: %WEIBO_PORT%
echo   数据库: %WEIBO_DATABASE_PATH%
echo   JDK: %JAVA_VER%
echo ============================================
echo.

rem 后台轮询等待服务就绪后自动打开浏览器
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 60;$i++){Start-Sleep -Seconds 1;try{if((Invoke-WebRequest -Uri 'http://localhost:%WEIBO_PORT%/post/index.html' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200){Start-Process 'http://localhost:%WEIBO_PORT%/post/index.html';break}}catch{}}"

java -jar "%~dp0%JAR%" --server.port=%WEIBO_PORT%

pause
