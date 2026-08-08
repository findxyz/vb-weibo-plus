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

echo 正在启动 vb-weibo-plus...
echo 端口：%WEIBO_PORT%
echo 数据库：%WEIBO_DATABASE_PATH%
echo.

java -jar "%~dp0%JAR%" --server.port=%WEIBO_PORT%

pause
