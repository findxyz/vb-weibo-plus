# vb-weibo-plus

单用户本地微博客户端服务。通过本地 Spring Boot 应用驱动一个微博账号的 Web 凭证：扫码登录后，通过 HTTP 接口手动调用微博 Web/API 端点。

## 前置条件

- **JDK 21**
- **Maven 3.9+**
- **ffmpeg**（可选，但推荐安装）：群聊图片预览在遇到 HEIC 格式（苹果设备原图，微博会错标为 image/jpeg）时，依赖系统 ffmpeg 将其转码为 JPEG 以便桌面浏览器显示。未安装时 HEIC 图片会原样透传（浏览器无法显示），但不影响其他格式图片和其余功能。

### 安装 ffmpeg

将 ffmpeg 加入系统 PATH 即可，应用启动时会自动探测。

- **Windows**：下载 [ffmpeg](https://ffmpeg.org/download.html) 解压，将其 `bin` 目录加入 PATH；或设置环境变量 `WEIBO_FFMPEG_PATH` 指向 ffmpeg 可执行文件绝对路径。
- **macOS**：`brew install ffmpeg`
- **Linux**：`sudo apt install ffmpeg` 或对应发行版的包管理器。

若 ffmpeg 不在 PATH，可通过环境变量 `WEIBO_FFMPEG_PATH` 指定其路径，例如：

```bash
export WEIBO_FFMPEG_PATH=/path/to/ffmpeg
```

## 运行

```bash
mvn spring-boot:run
```

应用默认监听 `http://localhost:18080`。HTTP 接口集合见 `CHAT_API.http`、`POST_API.http`、`WEIBO_API.http`。

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
        API["API 适配层<br/>8 个微博端点封装"]
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
    Service --> Repo
    API --> Client
    Client -->|带 Cookie HTTP| Weibo
    Client -->|SSE / 同步| AiAPI
    API --> Playwright
    Service --> FFmpeg
    Repo --> SQLite
    SyncTask -->|定时增量同步| Service
    Playwright -.->|写入 Cookie| CookieFile
    CookieFile -.->|启动恢复| Client
```

## 配置

主要配置项在 `src/main/resources/application.yml`，均可通过环境变量覆盖：

| 配置项 | 环境变量 | 默认值 | 说明 |
|--------|----------|--------|------|
| `server.port` | - | `18080` | 应用监听端口，改端口需直接修改 yml |
| `weibo.cookie-file` | - | `.weibo_cookie.txt` | 登录态 cookie 文件路径 |
| `weibo.qr-timeout-seconds` | - | `300` | 扫码登录等待确认的超时秒数，超时后报「扫码登录超时」 |
| `weibo.database-path` | `WEIBO_DATABASE_PATH` | `weibo.db` | 本地 SQLite 数据库路径 |
| `weibo.chat.auto-sync-gids` | `WEIBO_AUTO_SYNC_GIDS` | `4761715839862414,5046020575330655` | 定时增量同步的群号，逗号分隔，留空则不同步任何群 |
| `weibo.chat.sync-group-fixed-delay` | `WEIBO_SYNC_GROUP_FIXED_DELAY` | `20s` | 群消息增量同步间隔，支持 `20s` / `30000ms` 等 Duration 写法 |
| `weibo.media.ffmpeg-path` | `WEIBO_FFMPEG_PATH` | `ffmpeg` | ffmpeg 可执行文件路径 |
| `weibo.ai.base-url` | `WEIBO_AI_BASE_URL` | 空 | OpenAI 兼容 API 地址，留空则禁用 AI 分析 |
| `weibo.ai.api-key` | `WEIBO_AI_API_KEY` | 空 | AI API 密钥 |
| `weibo.ai.model` | `WEIBO_AI_MODEL` | `deepseek-v4-flash` | 模型名称 |
| `weibo.ai.timeout-seconds` | `WEIBO_AI_TIMEOUT` | `120` | AI 请求超时秒数 |
| `weibo.ai.system-prompt` | `WEIBO_AI_SYSTEM_PROMPT` | `请用中文回复分析结果。` | 系统提示词 |
| `spring.servlet.multipart.max-file-size` | - | `20MB` | 群聊发图/发视频的单文件上传上限，需容纳手机原图 |
| `spring.servlet.multipart.max-request-size` | - | `21MB` | 整个 multipart 请求上限，略大于文件上限即可 |

> 通过 `run.bat` 启动时，会以命令行参数注入以下默认值（优先级高于 yml，可直接改 `run.bat` 里的值）：
>
> - `--weibo.ai.base-url=https://api.deepseek.com`：AI 分析默认指向 DeepSeek
> - `--weibo.ai.api-key=sk-xxx`：AI 密钥占位符，**使用前必须替换为真实 key**
> - `--weibo.chat.auto-sync-gids=4761715839862414,5046020575330655`：与 yml 默认一致
