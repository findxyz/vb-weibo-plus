# vb-weibo-plus

本机单用户微博客户端。扫码登录后，服务在后台将群聊与博主发布的最新微博增量同步到本地 SQLite，并提供两个网页界面：

- **本地微博**：添加博主，按日历浏览某一天的微博，支持按时间范围同步历史微博
- **微博群聊**：查看群聊消息、发送文字／图片／视频，可选接入 OpenAI 兼容模型的 AI 分析

所有微博图片、视频经本地服务代理后直接在浏览器预览，无需在浏览器中登录微博。

## 页面预览

### 微博群聊

![微博群聊](chat.png)

### 本地微博

![本地微博](post.png)

## 系统架构

浏览器中的 React 页面通过 HTTP／SSE 访问 Spring Boot（默认 `:18080`）；Spring Boot 负责微博 API、群聊 WebSocket、本地 SQLite、图片／视频代理及可选的 AI 分析。ffmpeg 可选，用于 HEIC 图片转码。

## 前置条件

- **JDK 21**
- **Maven 3.9+**
- **ffmpeg**（可选）：用于 HEIC 图片转码，未安装时 HEIC 图片无法预览。将 ffmpeg 加入 PATH，或用 `WEIBO_FFMPEG_PATH` 指定路径。

## 启动运行

```bash
mvn spring-boot:run
```

默认监听 `http://localhost:18080`。接口示例见 `CHAT_API.http`、`POST_API.http`、`WEIBO_API.http`。

也可将 `weibo-plus.jar` 放到 `run.bat` 同目录后双击运行。脚本使用固定参数（端口 `18080`、默认同步群号等），可在 `run.bat` 中调整。

## 前端开发

前端位于 `frontend`，需要 Node.js 22.12.0 或更新版本，以及 npm 10 或更新版本。先启动 Spring Boot，再运行：

```bash
cd frontend
npm ci
npm run dev
```

访问 `http://127.0.0.1:5173/post/index.html` 或 `http://127.0.0.1:5173/chat/index.html`。后端使用其他端口时，设置 `API_PROXY_TARGET`。

类型检查、构建与浏览器测试：

```bash
npm run typecheck
npm run build
npx playwright install chromium
npm test
```

测试默认使用 Playwright Chromium；已有 Chrome 时可设置 `PREVIEW_BROWSER_CHANNEL=chrome`。

## 构建和发布

```bash
mvn clean package
```

产物为 `target/weibo-plus.jar` 和 `target/weibo-plus.7z`。首次构建会自动安装前端依赖；运行只需 JDK 21。

## 配置说明

主要配置在 `src/main/resources/application.yml`，均可通过环境变量覆盖：

| 配置项 | 环境变量 | 默认值 |
|--------|----------|--------|
| `server.port` | - | `18080` |
| `weibo.cookie-file` | - | `.weibo_cookie.txt` |
| `weibo.qr-timeout-seconds` | - | `300` |
| `weibo.database-path` | `WEIBO_DATABASE_PATH` | `weibo.db` |
| `weibo.chat.auto-sync-gids` | `WEIBO_AUTO_SYNC_GIDS` | `4761715839862414,5046020575330655` |
| `weibo.chat.sync-group-fixed-delay` | `WEIBO_SYNC_GROUP_FIXED_DELAY` | `1m` |
| `weibo.media.ffmpeg-path` | `WEIBO_FFMPEG_PATH` | `ffmpeg` |
| `weibo.ai.base-url` | `WEIBO_AI_BASE_URL` | 空 |
| `weibo.ai.api-key` | `WEIBO_AI_API_KEY` | 空 |
| `weibo.ai.model` | `WEIBO_AI_MODEL` | `deepseek-v4-flash` |
| `weibo.ai.timeout-seconds` | `WEIBO_AI_TIMEOUT` | `120` |
| `weibo.ai.system-prompt` | `WEIBO_AI_SYSTEM_PROMPT` | `请用中文回复分析结果。` |
| `spring.servlet.multipart.max-file-size` | - | `20MB` |
| `spring.servlet.multipart.max-request-size` | - | `21MB` |

`weibo.ai.base-url` 留空可禁用 AI 分析；`weibo.chat.auto-sync-gids` 留空则不同步任何群。修改 `server.port` 需直接编辑 yml。
