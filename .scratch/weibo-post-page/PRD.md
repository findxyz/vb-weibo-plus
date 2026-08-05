# 本地 Post 页面：移植 weiboblog 浏览功能

## Problem Statement

操作者用 vb-weibo-plus 浏览本地已捕获的 Blogger Blog（博主微博）。当前的 `weibo/index.html`（即将重命名为 `post/index.html`）提供了一个基础浏览页：左侧博主列表 + 右侧带日期/关键词筛选栏与分页的 feed。但它的浏览体验弱于参考项目 `weiboblog`（`D:\weiboblog`）：没有按月/日的日期时间轴导航、没有全文搜索结果片段与跳转高亮、图片查看器不支持多图翻页、也没有后台同步后的新帖提示。操作者想在保留现有蓝色风格与后端能力的前提下，把 weiboblog 的这些浏览功能补进来。

## Solution

把 weiboblog 的「左侧日期时间轴 + 按日加载 + 高级搜索 + 多图灯箱 + 新帖提示」移植到现有页面，同时：

- 视觉保持现有蓝色主题（与 chat 页面共享），只搬结构与功能，不改色。
- 不新增前端同步触发，依赖现有后台 `SyncTask`（每 10 分钟拉取全部博主），前端只做定时视图刷新。
- 后端仅新增一个日期聚合端点，其余复用现有 `/post/*` 接口。
- 把页面目录与路由从 `weibo` 改名为 `post`，使其与所用 `PostController` 命名一致。

## User Stories

1. 作为操作者，我想在页面加载后看到默认选中「全部博主」并自动展开最近月份、选中最近一天，这样我一进来就能看到最新的微博。
2. 作为操作者，我想在博主列表顶部看到一个始终置顶的「全部博主」行，这样我能随时切回查看所有博主聚合的微博。
3. 作为操作者，我想点击「全部博主」后日期时间轴显示所有博主聚合的月份与每日条数，这样我能在全部博主范围内按日期浏览。
4. 作为操作者，我想点击某个具体博主后日期时间轴只显示该博主的月份与每日条数，这样我能聚焦单个博主。
5. 作为操作者，我想在左侧看到日期时间轴（月份可展开/折叠，展开后显示每日条目及条数），这样我能快速跳到某天的微博。
6. 作为操作者，我想点击日期时间轴上某天后右侧 feed 一次加载该日全部微博（倒序），这样我能完整看到一天的内容而不是分页片段。
7. 作为操作者，我想在 feed 头部看到一个「高级搜索」按钮，这样我能按关键词加时间范围搜索微博。
8. 作为操作者，我想在高级搜索浮层里输入关键词（必填）和起止日期（可选），搜索范围跟随当前选中的博主（含「全部博主」），这样搜索结果与我的浏览上下文一致。
9. 作为操作者，我想在搜索结果列表里看到每条命中微博的日期与正文片段（命中词前后文，命中词高亮），这样我能快速判断哪条是想要的。
10. 作为操作者，我想点击某条搜索结果后关闭浮层、自动选中日期树对应日、加载该日微博、滚动到该卡片并闪烁高亮，这样我能立刻定位到命中微博。
11. 作为操作者，我想点击某条微博的任一图片后打开灯箱，能在该微博的图片集合内左右翻页，这样我能连贯浏览多图。
12. 作为操作者，我想在灯箱里看到当前图片序号（1/N）、加载占位，并用键盘左右键翻页，这样浏览体验流畅。
13. 作为操作者，我想在浏览某日微博时，后台同步新增了该日微博后看到一条「新增 N 条微博，点击查看」提示条，这样我既不被打断阅读，又知道有新内容。
14. 作为操作者，我想点击新帖提示条后把新帖插入到当前列表顶部并高亮，这样我能即时看到新内容。
15. 作为操作者，我想页面每 60 秒自动刷新视图（重拉月份/日期/当日微博），这样后台 SyncTask 拉到的新内容能逐步反映到页面上。
16. 作为操作者，我想页面在加载失败时显示失败状态并允许重试，这样网络或后端临时故障不会让页面卡死。
17. 作为操作者，我想页面在登录失效时显示「登录已失效」与扫码登录入口，这样我能重新登录。
18. 作为操作者，我想页面的 URL 从 `/weibo/index.html` 改为 `/post/index.html`，chat 页面的切换按钮也指向新路径，这样页面命名与所用的 `PostController` 一致。

## Implementation Decisions

### 目录与路由重命名

- `src/main/resources/static/weibo/` 整体改名为 `src/main/resources/static/post/`，页面路由随之从 `/weibo/index.html` 变为 `/post/index.html`。
- chat 页面 `chat/index.html` 的 titlebar 切换按钮 aria-label/title 文案「切换到本地微博」保留（页面标题是面向人的中文），但其 `chat.js` 里的跳转目标从 `/weibo/` 改为 `/post/`。
- post 页面的 titlebar 切换按钮跳转目标已是 `/chat/`，不变。
- 页面 `<title>` 与 `<h1>` 保持中文「本地微博」，不改成英文 Post。

### 三栏布局

- `.workspace` 从 `grid-template-columns: 280px minmax(0, 1fr)` 改为 `grid-template-columns: 280px 200px minmax(0, 1fr)`。
- 左栏（280px）：博主列表面板，结构与现有保持一致，但列表顶部新增一个「全部博主」行，始终置顶、不受搜索过滤。
- 中栏（200px）：日期时间轴面板（新增），含标题头 + 月份可折叠列表。
- 右栏：feed，头部含标题/计数 + 高级搜索按钮；卡片流（现有卡片结构保留）。

### 移除筛选栏与分页

- 移除现有 `.feed-filters` 表单（开始日期/结束日期/关键词/查询/重置）。
- 移除现有 `.pagination`（上一页/下一页/页信息）。
- 导航改为：博主选择 -> 日期树选日 -> feed 加载该日全部微博。

### 博主列表「全部博主」行

- 列表顶部第一个元素是「全部博主」行，选中后 `selectedUid = null`，日期树与 feed 均不带 uid 过滤（聚合全部）。
- 该行不受 `#blogger-search` 过滤影响，始终可见。
- 页面初始加载默认选中「全部博主」，不再用 localStorage 记忆上次博主（移除 last-uid 逻辑）。

### 日期时间轴

- 中栏头部：「日期时间轴」标题 + 月份总数或状态。
- 月份分组可折叠（默认折叠），展开后显示该月下每日条目（MM-DD + 条数）。
- 选中某日时高亮该日条目。
- 后端聚合端点（见下）一次返回全部月份 + 各月每日条数，前端展开月份时不额外请求。

### feed 按日加载

- 点击某日：调用 `GET /post/list`，参数 `start=该日 00:00:00`、`end=该日 23:59:59`、`uids=选中博主`（全部博主时不传 uids）、`page=1`、`size=9999`，一次拉该日全部，倒序展示。
- feed 头部显示当前日期与条数（如「2026-08-05  共 12 条」）。
- 无分页；切换日期即重新加载。

### 高级搜索浮层

- 入口：feed 头部右侧「🔍 高级搜索」按钮。
- 浮层字段：关键词（必填）、起止日期（可选）。
- 搜索范围跟随当前选中博主（含「全部博主」时 uids 不传）。
- 调用 `GET /post/list?keyword=...&start=...&end=...&uids=...&page=1&size=1000`。
- **前端生成片段**：JS 在命中的正文里找命中词位置，截取前后文，用 `<mark>` 包裹命中词。不新增后端 snippet。
- 结果在浮层内列表展示：每条显示日期 + 时间 + 片段。点击某条 -> 关闭浮层 -> 选中日期树对应日 -> 加载该日微博 -> `requestAnimationFrame` 后滚到该卡片并添加闪烁高亮 class（1.6s 后移除）。
- 空结果/上限提示：「未找到匹配微博」或「已达上限（N 条），请缩小范围」。

### 多图灯箱翻页

- 现有 `<dialog id="image-viewer">` 改造为支持多图：点击某微博任一图片打开时，传入该微博的全部图片 URL 列表 + 当前索引。
- 灯箱内：计数器 `1/N`（N>1 时显示）、上一张/下一张按钮、加载占位。
- 键盘：←/→ 翻页，Esc 关闭。
- 翻页范围：单条微博内的图片集合（本微博图片一组；转发原微博的图片算独立一组，不与本微博混合）。

### 视图刷新 + 新帖提示（无同步按钮）

- 不新增同步按钮、轮询状态端点、自动刷新开关、倒计时圆环。
- 前端每 60 秒定时执行一次视图刷新：并行重拉 `/post/calendar`（刷新日期树计数与新增月份）、`/post/list?start=当日00:00:00&end=当日23:59:59`（刷新当日微博）。
- 日期树刷新：已展开月份重新拉取日列表更新计数；新月份插入；保留展开态。
- 当日微博刷新：与已渲染卡片 + 暂存待插入新帖做 id diff，发现新帖后暂存，显示「新增 N 条微博，点击查看」提示条（仅当前选中日期有新帖时显示）。
- 点击提示条：把暂存新帖插入到列表顶部并闪烁高亮，清空提示条。
- `await` 期间用户已切换日期则丢弃本次结果。
- 搜索浮层打开时不刷新。

### 后端：新增 `GET /post/calendar`

- 挂在 `PostController`（`@RequestMapping("/post")`），路径 `/post/calendar`。
- 参数：`uid`（可选 `Long`，不传 = 聚合全部博主）。
- 返回：月份列表（倒序），每个月份含 `month`（`YYYY-MM`）、`count`（总条数）、`days`（该月下每日 `{date: YYYY-MM-DD, count}` 倒序）。
- 实现：`PostRepository` 新增原生查询，用 SQLite `strftime('%Y-%m', created_at/1000, 'unixepoch', '+8 hours')` 按月聚合、`strftime('%Y-%m-%d', ...)` 按日聚合，可选 `WHERE uid = :uid`。复用现有 `idx_posts_uid_ctime_post` 与 `idx_posts_ctime_post` 索引。
- `PostService` 新增 `queryCalendar(Long uid)` 方法，`PostMapper`（或新 record）映射结果。
- 时区：Asia/Shanghai（+8），与 `PostController.REQUEST_TIME_ZONE` 一致。

### 页面使用的接口清单

- `GET /post/bloggers`（现有）
- `GET /post/list`（现有，复用按日加载与搜索）
- `GET /post/image`（现有，图片代理）
- `GET /post/video-cover`（现有，视频封面代理）
- `GET /post/calendar`（新增）
- `GET /weibo/login/status`（现有，登录态检测，全局共享不属于「微博原始测试接口」）
- `POST /weibo/login/qr`（现有，扫码登录）

### 已记录 ADR

- `docs/adr/0005-weibo-page-view-refresh-only-no-sync-button.md`：不新增前端同步按钮，依赖后台 SyncTask + 视图刷新。
- `docs/adr/0006-weibo-page-three-column-date-calendar-navigation.md`：三栏布局，日期时间轴取代筛选栏与分页。

## Testing Decisions

### 好测试的标准

- 只测外部行为，不测实现细节（不测私有方法、不测内部状态结构）。
- UI 测试通过真实 DOM 交互验证用户可见结果，不断言内部数据结构。
- 后端聚合测试用真实 SQLite 验证 SQL 正确性（时区、计数、uid 过滤），而非 mock。

### seam 1：Playwright `PostPageTest`（UI 行为，最高 seam）

- 位于 `src/test/java/xyz/fz/weibo/ui/PostPageTest.java`。
- 仿 `GroupChatPageTest`：用 `com.sun.net.httpserver.HttpServer` 起一个 stub 后端，返回固定的 `/post/bloggers`、`/post/calendar`、`/post/list`、`/post/image`、`/post/video-cover`、`/weibo/login/status` JSON；用 Playwright headless chromium 打开 `baseUrl + "/post/index.html"` 驱动真实页面。
- 覆盖：默认选中全部博主 + 最近一天、博主列表全部博主行、日期树展开/选日加载、高级搜索浮层关键词+片段+跳转高亮、多图灯箱翻页与键盘、新帖提示条插入与定时刷新、加载失败重试、登录失效提示。
- `@Test` 方法用 snake_case（遵循 AGENTS.md）。

### seam 2：`PostRepositoryTest` 新增 calendar 聚合测试（SQL 正确性）

- 位于现有 `src/test/java/xyz/fz/weibo/repository/PostRepositoryTest.java`。
- 用真实 SQLite（仿现有 `MessageRepositoryTest` / `PostRepositoryTest` 的 @DataJpaTest 模式）插入多条不同 uid、不同日期的 PostEntity，验证：
  - 不传 uid 时聚合全部博主的月份与每日条数。
  - 传 uid 时只聚合该博主。
  - 跨时区边界：created_at 落在 UTC 边界但 CST 属于次日的，按 CST 归入正确日期。
  - 月份与日期倒序。

### 不新增的测试

- 不为 `/post/calendar` 端点加 `PostControllerTest` 的 MockMvc 测试：参数绑定与现有 `/post/list` 同模式，仓库层已覆盖 SQL 正确性，覆盖度足够。

## Out of Scope

- 不改后端远程微博接口（`/weibo/blog/*`、`/weibo/media/*`），它们只用于原始 API 测试。
- 不新增前端同步触发、轮询状态端点、自动刷新开关、倒计时圆环。
- 不改视觉主题（保持蓝色，不改橙色）。
- 不做移动端适配（沿用现有桌面双栏/三栏最小宽度约定）。
- 不做搜索结果分页（size=1000 上限，超限提示缩小范围）。
- 不做跨微博灯箱翻页（翻页范围仅单条微博内）。
- 不改后端 SyncTask 的同步频率或逻辑。
- 不改 chat 页面的功能，只改其切换按钮跳转路径。

## Further Notes

- weiboblog（`D:\weiboblog\web/`）是原生 JS 无框架前端，本次移植保持同样技术栈（原生 JS，无构建），与现有 `weibo.js`/`weibo.css` 一致，文件改名后延续 `post.js`/`post.css`。
- 现有 `weibo.css` 的 `.workspace`、`.bloggers-panel`、`.feed` 等样式类在三栏布局下需调整 grid 列数与新增 `.dates-panel`（日期树面板）样式，但保持现有视觉变量（`--accent` 等）与蓝色主题不变。
- 日期树的月份折叠/展开交互可参考 weiboblog 的 `.month-group` / `.month-header::before` 模式，但视觉用现有蓝色变量。
- 搜索片段生成逻辑参考 weiboblog `app.js` 的 `snippetToHtml`（用 `\x00\x01` 包裹命中词再转 `<mark>`），但在 vb-weibo-plus 中 `/post/list` 不返回 snippet，需前端拿到完整正文后自行截取。
