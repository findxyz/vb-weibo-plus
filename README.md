# vb-weibo-plus

本机单用户微博客户端。用一个微博账号扫码登录后，服务在后台将群聊与博主发布的最新微博增量同步到本地 SQLite，并提供两个网页界面：

- **本地微博**：添加博主，按日历浏览某一天的微博，支持按时间范围同步历史微博
- **微博群聊**：查看群聊消息、发送文字/图片/视频，可选接入 OpenAI 兼容模型的 AI 分析

所有微博图片、视频经本地服务代理后直接在浏览器预览，无需在浏览器中登录微博。

## 页面预览

### 微博群聊

![微博群聊](chat.png)

### 本地微博

![本地微博](post.png)

## 系统架构

### 整体分层

```mermaid
graph TB
    subgraph Browser["浏览器前端（纯静态）"]
        ChatUI["chat/index.html + chat.js<br/>群聊查看 · 发消息 · AI 分析"]
        PostUI["post/index.html + post.js<br/>微博浏览 · 日历 · 博主管理"]
    end

    subgraph SpringBoot["Spring Boot :18080"]
        Controller["Controller 层<br/>8 个 REST 控制器"]
        Service["Service 层<br/>ChatService · PostService<br/>AnalysisService · ImageProxyService"]
        API["API 适配层<br/>8 个微博 HTTP 端点封装"]
        Push["GroupPushApi<br/>Bayeux WebSocket"]
        Client["Client 层<br/>WeiboHttpClient · AiClient"]
        Repo["Repository 层<br/>5 个 JPA Repository"]
        SyncTask["SyncTask<br/>CommandLineRunner + @Scheduled"]
    end

    subgraph Storage["本地存储"]
        SQLite[("SQLite weibo.db<br/>5 张表 · WAL 模式")]
        CookieFile[".weibo_cookie.txt<br/>登录态文件"]
    end

    subgraph External["外部服务"]
        Weibo["微博 Web/API<br/>api.weibo.com · weibo.com/ajax · 图床 CDN"]
        AiAPI["OpenAI 兼容 AI API<br/>可选"]
        FFmpeg["ffmpeg / ffprobe<br/>HEIC 转码 · 视频封面 · 可选"]
        Playwright["Playwright Chromium<br/>扫码登录"]
    end

    ChatUI -->|HTTP / SSE| Controller
    PostUI -->|HTTP| Controller
    Controller --> Service
    Service --> API
    Service -->|开启 / 关闭| Push
    Service --> Repo
    API --> Client
    Client -->|带 Cookie HTTP| Weibo
    Push -->|携带 Credential 的 WebSocket| Weibo
    Push -->|原始 data 的 Spring 事件| SyncTask
    Client -->|SSE / 同步| AiAPI
    API --> Playwright
    Service --> FFmpeg
    Repo --> SQLite
    SyncTask -->|定时拉取 / 维持连接| Service
    Playwright -.->|写入 Cookie| CookieFile
    CookieFile -.->|启动恢复| Client
```

## 前置条件

- **JDK 21**
- **Maven 3.9+**
- **ffmpeg**（可选，但推荐安装）：群聊图片预览在遇到 HEIC 格式（苹果设备原图，微博会错标为 image/jpeg）时，依赖系统 ffmpeg 将其转码为 JPEG 以便桌面浏览器显示。未安装时 HEIC 图片会原样透传（浏览器无法显示），但不影响其他格式图片和其余功能。

#### ffmpeg 安装

将 ffmpeg 加入系统 PATH 即可，应用启动时会自动探测。

- **Windows**：下载 [ffmpeg](https://ffmpeg.org/download.html) 解压，将其 `bin` 目录加入 PATH；或设置环境变量 `WEIBO_FFMPEG_PATH` 指向 ffmpeg 可执行文件绝对路径。
- **macOS**：`brew install ffmpeg`
- **Linux**：`sudo apt install ffmpeg` 或对应发行版的包管理器。

若 ffmpeg 不在 PATH，可通过环境变量 `WEIBO_FFMPEG_PATH` 指定其路径，例如：

```bash
export WEIBO_FFMPEG_PATH=/path/to/ffmpeg
```

## 启动运行

```bash
mvn spring-boot:run
```

应用默认监听 `http://localhost:18080`。HTTP 接口集合见 `CHAT_API.http`、`POST_API.http`、`WEIBO_API.http`。

### React 开发预览

前端位于 `frontend`，需要 Node.js 22.12.0 或更新版本，以及 npm 10 或更新版本。本次验证使用 Node.js 24.15.0、npm 11.14.1。先启动上述 Spring Boot 服务，再在另一个终端运行：

```bash
cd frontend
npm ci
npm run dev
```

访问 [本地微博预览](http://127.0.0.1:5173/preview/post/index.html) 或 [群聊入口预览](http://127.0.0.1:5173/preview/chat/index.html)。修改组件或样式后自动热更新。post 预览只读取博主名称，chat 预览只展示入口；正式页面仍由 Spring Boot 的 `/post/index.html` 与 `/chat/index.html` 提供。

开发查询使用相对路径 `GET /post/bloggers`，Vite 将该精确 API 路径代理到 `http://127.0.0.1:18080`，HTML 和模块资源由 Vite 提供。后端使用其他端口时，可以设置 `API_PROXY_TARGET` 环境变量，或在 `frontend/.env.local` 中写入 `API_PROXY_TARGET=http://127.0.0.1:其他端口`。

```bash
npm run typecheck
npm run build
npx playwright install chromium
npm test
```

构建将两个 HTML 入口和 hash 资源写入专用目录 `target/generated-resources/frontend`，不写回手写源码目录。当前尚未接入 Maven 打包。浏览器测试使用隔离的本地 HTTP 服务并经过真实 Vite 代理，无需运行 Spring Boot。

测试默认使用 Playwright 安装的 Chromium；已有 Chrome 时，可以省略浏览器下载，设置 `PREVIEW_BROWSER_CHANNEL=chrome` 后运行 `npm test`。PowerShell 中使用 `$env:PREVIEW_BROWSER_CHANNEL='chrome'`，本次开发预览验收使用此方式。

工程依据：React 的 [createRoot](https://react.dev/reference/react-dom/client/createRoot)、Vite 的[多入口构建](https://vite.dev/guide/build.html#multi-page-app)与[精确正则代理](https://vite.dev/config/server-options.html#server-proxy)，以及 TanStack Query 的[默认查询策略](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)。查询将显式关闭自动重试、窗口聚焦和网络重连刷新，避免在预览中引入额外的 View Refresh。

也可直接使用 `run.bat` 启动：将打包产物 `weibo-plus.jar` 放到 run.bat 同目录后双击运行。脚本会自动检查 JDK 版本（要求 21 及以上），并以固定参数启动服务（端口 18080、默认同步群号 `4761715839862414`、AI 指向 DeepSeek），启动 5 秒后自动打开群聊页面。如需调整参数，直接修改 run.bat 中 java 命令行的值即可。

### 配置说明

主要配置项在 `src/main/resources/application.yml`，均可通过环境变量覆盖：

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

各配置项说明：

- `server.port`：应用监听端口，改端口需直接修改 yml
- `weibo.cookie-file`：登录态 cookie 文件路径
- `weibo.qr-timeout-seconds`：扫码登录等待确认的超时秒数，超时后报「扫码登录超时」
- `weibo.database-path`：本地 SQLite 数据库路径
- `weibo.chat.auto-sync-gids`：自动接收和增量同步的群号，逗号分隔，留空则不同步任何群
- `weibo.chat.sync-group-fixed-delay`：群消息定时增量拉取间隔，默认每 1 分钟执行一次，与 WebSocket 连接状态无关，支持 `1m` / `60000ms` 等 Duration 写法
- `weibo.media.ffmpeg-path`：ffmpeg 可执行文件路径
- `weibo.ai.base-url`：OpenAI 兼容 API 地址，留空则禁用 AI 分析
- `weibo.ai.api-key`：AI API 密钥
- `weibo.ai.model`：模型名称
- `weibo.ai.timeout-seconds`：AI 请求超时秒数
- `weibo.ai.system-prompt`：系统提示词
- `spring.servlet.multipart.max-file-size`：群聊发图/发视频的单文件上传上限，需容纳手机原图
- `spring.servlet.multipart.max-request-size`：整个 multipart 请求上限，略大于文件上限即可
