# 04：React post 博主与日期浏览导航

**What to build:** 使用者在 post 预览中选择全部博主或一位博主，通过年、月、日时间轴阅读对应日期的本地 Blogger Blog。迁移已有导航规则，保持当前默认阅读、安全正文与发布通路。

**Blocked by:** 03，默认日期的本地博文阅读，已完成。

**Status:** ready-for-agent

日期：2026-10-13。
本票已具体化，当前仅形成实施规格，尚未实现。

## 范围与事实依据

沿用总纲已经确认的后端契约、双皮肤和逐页迁移约束。本票不新增产品选择规则。

- 博主选择是单选，包含始终可见的「全部博主」入口，来源为旧 `bloggers.js` 的 `selectAllBloggers`、`selectBlogger`。
- 每次博主选择先清空旧日期、旧博文与旧总数，再读取该范围的日期聚合，选中最新有效日并加载列表。重新点击当前博主也走该路径，来源为 `onBloggerChanged`。
- 时间轴按年 → 月 → 日分组，显示年、月、日数量；默认展开选中日期所属的年与月，其他分组可独立开合，来源为旧 `dates.js` 与 ADR-0006。
- 日列表加载或重试在途时，拒绝用户日期切换，保持当前高亮且不发送另一日期请求；博主切换仍可抢占在途请求，来源为旧 `posts.js` 的 `selectDate`、`clear`。
- 请求完成后再次点击已选日期会重新读取该日列表，不以相同查询键为由忽略用户操作，来源为 `selectDate`、`loadPosts`。

最新有效日沿用任务 03 的有效日期与正数量判定，按日期降序显示；不使用机器今天代替本地有数据的日期。

## 查询与状态边界

选择全部博主时，`GET /post/calendar` 不传 `uid`，`GET /post/list` 不传 `uids`；选择单个博主时分别传 `uid=<uid>` 与 `uids=<uid>`，注意参数名不同。
列表仍使用 `page=1`、`size=9999`、所选日期 `00:00:00` 到 `23:59:59` 的含端点区间，由后端按 `Asia/Shanghai` 解释。总数使用服务端 `total`。

博主列表作为已有查询数据保留；切换博主只重新查询日期与列表，切换日期只重新查询列表。折叠或展开分组不发起业务查询。
每次博主选择都重新读取该范围的日期；缓存不能让新范围显示旧范围的数据，也不能静默跳过用户主动读取。
列表重试只读取当前博主、当前日期，不重新初始化页面。
日期请求失败时提示可理解的错误，保留博主选择；日列表失败时保留当前日期与时间轴，并提供既有列表重试。错误恢复也可通过重新点击当前博主或日期完成。
无有效日期时清空日期选择、列表与总数，显示无数据提示，不发送无日期的列表请求；当日列表为空仍显示当前日期及服务端总数。

页面协调状态只记录当前博主、用户选择的日期与分组开合所需状态；聚合、卡片和计数来自查询结果，最新默认日期从聚合推导。
查询键与请求归属包含博主范围和日期，消费取消信号。快速切换博主、切回曾查看的范围、请求失败和卸载时，旧响应及旧请求结束回调均不得改写新选择、错误或加载状态。
继续关闭自动重试、聚焦／重连刷新和轮询；点击导航与重试属于本地 View Refresh，不触发 Background Capture。

## Acceptance criteria

- [ ] 导航可用：初始全部博主与最新有效日保持任务 03 行为；选择单个博主或返回全部博主后，标题、选中项、日期聚合、最新默认日及卡片一致；年／月／日分组、数量、折叠与自动展开正常。
- [ ] 请求与恢复正确：参数、上海日边界和服务端总数保持契约；加载期间拒绝日期切换，博主可抢占旧请求；重复选择能重新读取；空数据、失败与局部重试有明确状态，迟到响应和卸载不污染当前范围。
- [ ] 两种运行路径一致：纸感三栏与独立列滚动保留，博主、分组和日期控件可用键盘操作，折叠态与 `aria-expanded` 一致，选中态可辨识；开发预览与构建资源检查通过，原正式 post、chat 及任务 03 正文安全行为保持通过。

## 实施顺序与验证

按用户路径做纵向增量，每个增量先写真实浏览器 HTTP 边界测试，再实现最少代码。

1. 全部博主下的日期时间轴与日期点击 → 验证跨年／月开合、默认展开、日边界、同日重读、加载期间拒绝改选与键盘操作。
2. 单博主与全部博主联动 → 验证两个接口的参数名、切换后复位最新日、清空旧结果、重新点击当前范围与快速切换的响应隔离。
3. 空状态、失败恢复与发布检查 → 验证无日期不查列表、日列表局部重试、旧错误不覆盖新范围、取消与现有安全正文；检查真实纸感布局与独立 JAR 导航。

前端在 `frontend` 目录运行以下命令。浏览器测试使用本地 HTTP fixture，无需真实登录或 Spring Boot 服务。

```powershell
npm ci
$env:PREVIEW_BROWSER_CHANNEL = 'chrome'
npm test
npm run typecheck
npm run build
```

仓库根目录运行 `mvn -Dtest=PostPageTest,GroupChatPageTest,ReactPreviewPageTest package`，在生成资源上覆盖单博主和日期切换路径，并运行原页面定向回归。
若目标 JAR 被运行中的应用占用，使用基于集成提交的独立 worktree 验证，不能为了构建停止用户正在使用的服务。
独立 JAR 冒烟采用已记录的临时 SQLite、不可用 Credential、空自动采集群号和 localhost 端口；直接插入两个博主、跨月日期及博文 fixture，检查切换后的参数与内容。后台调度仍可能执行，不声称全部调度已关闭。
仅在新的修改、失败或未解决风险需要时扩大检查；本票不预先要求重复上一批已通过的全量测试。

主要修改位置：`frontend/src/post/PostPreview.tsx`、`queries.ts`、`post.css`、`frontend/tests/preview.spec.ts` 与 `ReactPreviewPageTest.java`。必要时提取一个日期时间轴组件，不引入通用导航框架、路由或全局状态库。

## 范围外

博主名称过滤、高级搜索与搜索跳转、头像／认证信息补齐、完整转发与媒体卡片、媒体查看器、博主管理、采集、扫码、定时 View Refresh、chat 业务、后端与数据库改造及正式入口切换。上述能力按后续票迁移，不因本票可浏览而宣布 post 整页完成。

## 参考与交付

共同约束：[PRD.md](../PRD.md)。依赖与进度：[PLAN.md](../PLAN.md)。
旧行为：[bloggers.js](../../../src/main/resources/static/post/bloggers.js)、[dates.js](../../../src/main/resources/static/post/dates.js)、[posts.js](../../../src/main/resources/static/post/posts.js)。
接口：[PostController.java](../../../src/main/java/xyz/fz/weibo/controller/PostController.java)。设计：[DESIGN.md](../../../docs/design/DESIGN.md)。
导航 ADR：[ADR-0006](../../../docs/adr/0006-weibo-page-three-column-date-calendar-navigation.md)。旧行为测试：[PostPageTest.java](../../../src/test/java/xyz/fz/weibo/ui/PostPageTest.java)。

实现后记录每项验收证据、实际检查命令与结果，保存可回退提交，更新全局计划并报告，由用户决定后续票。
