@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

set JAR=weibo-plus.jar

if not exist "%~dp0%JAR%" (
    echo [错误] 找不到 %JAR%，请将 jar 包放在本脚本同目录下。
    pause
    exit /b 1
)

rem ===== JDK 版本检查（要求 21 及以上） =====
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

rem ===== 启动参数（如需调整，直接修改下方 java 命令中的值） =====
rem --server.port                     - 服务端口，默认 18080
rem --weibo.database-path             - 数据库文件路径，默认 weibo.db
rem --weibo.chat.auto-sync-gids       - 定时增量同步的群号，逗号分隔，默认 4761715839862414,5046020575330655
rem --weibo.ai.base-url               - OpenAI 兼容 API 地址，默认 https://api.deepseek.com
rem --weibo.ai.api-key                - AI API 密钥，默认 sk-xxx（请替换为真实 key）

echo ============================================
echo   vb-weibo-plus
echo ============================================
echo   端口: 18080
echo   数据库: weibo.db
echo   JDK: %JAVA_VER%
echo ============================================
echo.

rem 延迟 5 秒后自动打开浏览器
start "" /b cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:18080/chat/index.html"

java -jar "%~dp0%JAR%" --server.port=18080 --weibo.database-path=weibo.db --weibo.chat.auto-sync-gids=4761715839862414,5046020575330655 --weibo.ai.base-url=https://api.deepseek.com --weibo.ai.api-key=sk-xxx

pause
