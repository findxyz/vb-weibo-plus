# 完整 Rust 后端

**Status:** done

## Problem Statement

目前本地客户端只有 Java 后端。用户希望获得可独立运行的 Rust 实现，沿用现有 React 页面、接口、已采集内容和登录状态。

## Solution

Rust 后端从同一端口提供现有页面、HTTP 接口和 SSE。用户可以停止 Java，启动 Rust 并继续使用已有的 SQLite 和 Credential。Windows x64 归档包含可以直接启动的 `weibo-plus.exe`。

## User Stories

1. 作为本地用户，我可以独立启动 Rust 并打开 chat 和 post 页面。
2. 作为 Java 用户，我切换后端后可以继续浏览已采集的群消息、博主微博和分析。
3. 作为已登录用户，我可以继续使用已有 Credential，过期后可通过原页面扫码登录。
4. 作为群聊用户，我可以查看群列表、历史、游标分页、长文和群消息态度。
5. 作为群聊用户，我可以发送文字、图片和视频，并按 Java 的方式看到后续采集结果。
6. 作为群聊用户，我可以按指定时间启动 Historical Capture，并在页面上浏览结果。
7. 作为博主微博用户，我可以添加博主、筛选日期、搜索正文和转发、采集历史并点赞或取消赞。
8. 作为媒体查看者，我可以通过原有代理地址查看图片、视频和封面，也可以拖动视频进度。
9. 作为分析用户，我可以流式接收分析结果，并在成功完成后重新打开结果。
10. 作为维护者，我可以继续使用原有 HTTP 示例和 OpenAPI 开关核对行为。
11. 作为发布包用户，我可以解压 Windows x64 归档并直接运行 EXE。

## Implementation Decisions

- Java 是发布行为的基线。保持 HTTP 方法、路径、字段类型、日期边界、错误状态和媒体响应头。
- React 继续使用同源路径。Rust 归档嵌入现有前端构建产物。
- 支持 Java 的 SQLite 表结构、WAL、编码与 Credential 格式。切换前关闭当前后端。
- 保持 View Refresh、Background Capture、Historical Capture 和 Media Send 的业务语义。
- 保持 WebSocket 推送和定时采集、扫码登录、二维码图片、媒体 Range、可选 ffmpeg 和 AI 配置。
- 保持 Java 现有的低层微博 HTTP 入口和默认关闭的 API 文档行为。

## Testing Decisions

- 在 HTTP/SSE 层对照已知状态码、JSON、事件和头部，使用现有 Java Controller 测试和接口示例确认预期。
- 上游微博、扫码和 AI 使用隔离的测试数据。限制手工真实扫码验证为明确受控的发布验收。
- 用独立临时 SQLite 和 Credential 验证双向切换，包括分页、重复采集、字面搜索、旧 JSON 和上海时区。
- 运行 React 浏览器测试，并从解压后的 EXE 验证两页和静态资源。

## Out of Scope

- 多用户、两个后端同时使用同一目录、远程部署和改变现有 React 交互。
