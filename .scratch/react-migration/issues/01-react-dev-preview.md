# 01：React 开发预览与真实博主查询

**What to build:** 开发者可以启动 React、TypeScript 和 Vite 工程，通过独立的 post 与 chat 预览入口查看页面。post 预览通过开发代理调用现有本地查询，显示实际返回的博主名称；修改组件或样式能够热更新。原正式页面继续使用现有实现。

**Blocked by:** None（可以作为第一张实现票）。

**Status:** resolved

## 实施边界

使用一个前端工程和两个独立 HTML 入口，分别提供 `/preview/post/index.html` 与 `/preview/chat/index.html`。
post 预览展示查询得到的博主名称及加载、空数据、错误状态；chat 预览只证明独立入口能加载，不接入群聊业务。
后端默认端口为 18080；浏览器使用相对接口地址，由 Vite 按具体接口路径代理。
选择当前受支持的 React、TypeScript、Vite 和 TanStack Query 版本，记录工具版本要求并提交依赖锁文件。
复用现有界面令牌，分别加载两套皮肤，不修改现有后端协议或正式页面。
只建立这个增量所需的 HTTP 请求与查询能力，不提前设计全部共享模块。

## Acceptance criteria

- [x] 首先运行原两页定向回归，记录测试基线与已有失败。
- [x] 前端依赖可以根据锁文件安装，类型检查和双入口构建通过；产物生成到专用生成资源目录。
- [x] 两个预览入口在开发服务器中直接访问和刷新均成功，浏览器无模块加载错误或 pageerror。
- [x] post 预览经相对地址调用 `GET /post/bloggers`，展示其名称；本地 HTTP 测试替身能覆盖成功、空数据和失败。
- [x] HTML 入口、JS 模块、样式和 API 的代理匹配不会互相覆盖；修改组件或样式可以热更新。
- [x] 预览未向采集、添加博主、扫码或发送接口发起业务写入请求；原正式入口与资源继续可用。

## 验证方法

先建立现有 UI 回归基线，再验证开发预览与真实查询路径。
用已有浏览器与 HTTP 测试方式验证可见名称和失败提示；同时检查网络路径、资源 MIME 与控制台。
本票不要求 classpath 测试服务加载尚未接入 Maven 的生成资源，可以针对开发服务器验证。
前端类型检查与构建完成后检查差异，记录实际命令和结果。

## 范围外

Maven 构建集成、博文列表、日期切换、完整登录与媒体交互、chat 业务、正式入口切换。
教学示例中的本地消息追加不作为业务实现迁入。

## 交付与下一步

开发入口、真实博主查询和验证构成一个可回退增量。
完成后更新 [阶段计划](../PLAN.md) 并报告，由用户决定是否开始任务 02。
共同约束见 [总纲](../PRD.md)，事实依据按阶段计划的场景索引读取。

## 验证记录

日期：2026-10-12。

- 实施前由集成任务运行 `mvn '-Dtest=PostPageTest,GroupChatPageTest' test`，119 项通过（chat 82 项，post 37 项），失败、错误、跳过均为 0；无已知基线失败。本票未修改正式页面和后端业务源码。
- 工具版本为 Node.js 24.15.0、npm 11.14.1；固定 React 19.3.0、TypeScript 7.0.2、Vite 8.3.4、TanStack Query 5.104.2，提交 npm 锁文件。
- `npm --prefix frontend ci`、`npm --prefix frontend run typecheck`、`npm --prefix frontend run build` 均通过；构建包含两入口及 hash JS／CSS，输出到 `target/generated-resources/frontend`。
- 在 PowerShell 中设置 `$env:PREVIEW_BROWSER_CHANNEL='chrome'` 后运行 `npm --prefix frontend test`，8 项真实浏览器检查通过。测试启动隔离本地 HTTP 服务与实际 Vite 开发服务器，验证名称、加载、空列表、HTTP 503 错误、两入口刷新、两套皮肤、资源 MIME 和精确 API 代理。所有页面检查均断言无 pageerror 与非 GET／HEAD 请求。
- 名称、加载、空、失败及 chat 入口均先观察到浏览器可见断言失败，再实现通过。热更新测试先发现整页刷新，随后分离组件与 createRoot 挂载入口；修改组件文字与 CSS 字号后断言页面文档仍保留，finally 恢复源文件。
- 已查看 post 与 chat 的浏览器截图，确认纸面点阵／硬阴影与蔚蓝渐变分别使用各自皮肤；`git diff --check` 通过。
- Chromium 下载未完成且已停止；本次验收使用已安装的 Chrome。默认 Playwright Chromium 的安装运行、Maven 生成资源集成和生产 JAR 未在本票验证，后两项属于任务 02。

本批任务 01 → 02 → 03 已获用户授权按依赖推进；共同计划与总纲由集成任务统一更新。
