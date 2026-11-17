@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

set JAR=weibo-plus.jar

if not exist "%~dp0%JAR%" (
    echo [ERROR] %JAR% not found. Please put the jar file in the same directory as this script.
    pause
    exit /b 1
)

java -version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] java command not found. Please install JDK 21 or higher and configure PATH.
    echo Download: https://www.oracle.com/java/technologies/downloads/
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
    echo [ERROR] Cannot parse the JDK version. Please make sure JDK 21 or higher is installed correctly.
    echo Download: https://www.oracle.com/java/technologies/downloads/
    pause
    exit /b 1
)

if !JAVA_MAJOR! LSS 21 (
    echo [ERROR] JDK version too old: current !JAVA_VER!, JDK 21 or higher is required.
    echo Download: https://www.oracle.com/java/technologies/downloads/
    pause
    exit /b 1
)

echo ============================================
echo   vb-weibo-plus
echo ============================================
echo   Port: 18080
echo   Database: weibo.db
echo   JDK: %JAVA_VER%
echo ============================================
echo.

start "" /b cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:18080/chat/index.html"

java -jar "%~dp0%JAR%" --server.port=18080 --weibo.database-path=weibo.db --weibo.chat.auto-sync-gids=4761715839862414 --weibo.ai.base-url=https://api.deepseek.com --weibo.ai.api-key=sk-xxx

pause
