@echo off
chcp 65001 >nul
setlocal

rem ===== 可选参数（通过环境变量覆盖默认值，留空则用 application.yml 中的默认值）=====

rem 服务端口，默认 18080
if not defined WEIBO_PORT set WEIBO_PORT=18080

rem 数据库文件路径，默认当前目录下的 weibo.db
if not defined WEIBO_DATABASE_PATH set WEIBO_DATABASE_PATH=weibo.db

rem ffmpeg 路径，群聊 HEIC 图片转码用，留空则不转码
if not defined WEIBO_FFMPEG_PATH set WEIBO_FFMPEG_PATH=

rem 群聊 AI 分析（OpenAI 兼容 API），不需要可留空
if not defined WEIBO_AI_BASE_URL set WEIBO_AI_BASE_URL=
if not defined WEIBO_AI_API_KEY set WEIBO_AI_API_KEY=
if not defined WEIBO_AI_MODEL set WEIBO_AI_MODEL=

rem 定时同步的群号，逗号分割，留空则不同步
if not defined WEIBO_AUTO_SYNC_GIDS set WEIBO_AUTO_SYNC_GIDS=

rem =====================================================================

set JAR=weibo-plus.jar

if not exist "%~dp0%JAR%" (
    echo 找不到 %JAR%，请将 jar 包放在本脚本同目录下。
    pause
    exit /b 1
)

rem ===== JDK 版本检查（要求 21 或以上）=====
java -version >nul 2>&1
if errorlevel 1 (
    echo 未找到 java 命令，请先安装 JDK 21 或以上版本并配置 PATH。
    pause
    exit /b 1
)
for /f tokens^=2delims^=^" %%v in ('java -version 2^>^&1') do (
    set JAVA_VER=%%v
    goto :check_ver
)
:check_ver
for /f "tokens=1 delims=." %%a in ("%JAVA_VER%") do set JAVA_MAJOR=%%a
if %JAVA_MAJOR% LSS 21 (
    echo JDK 版本过低：当前 %JAVA_VER%，要求 21 或以上。
    echo 请前往 Oracle JDK 下载页安装：https://www.oracle.com/java/technologies/downloads/
    pause
    exit /b 1
)
echo JDK 版本：%JAVA_VER%
echo.

echo 正在启动 vb-weibo-plus...
echo 端口：%WEIBO_PORT%
echo 数据库：%WEIBO_DATABASE_PATH%
echo.

java -jar "%~dp0%JAR%" --server.port=%WEIBO_PORT%

pause
