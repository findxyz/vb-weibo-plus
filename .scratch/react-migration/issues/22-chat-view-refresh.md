# 22：chat View Refresh、Catch-up 与新消息提示

**What to build:** chat 预览按旧页节奏轮询当前群的新消息：新消息只追加、不移动视口，并显示「有新消息」提示；回到页面后补齐离开期间的消息；提示与右下角按钮都能先刷新再一次落底。

**Blocked by:** 21，已完成。

**Status:** resolved

日期：2026-10-17。用户要求继续下一票。本票只做本地 View Refresh 与 Catch-up，不调用微博接口、不写入本地库。

## 实施边界

### View Refresh 轮询

- 每 1 秒读取当前群最新一页（`size=50`，无游标）；失败按 1 秒起、每次翻倍退避，封顶 30 秒，成功后归零。
- 页面隐藏时不对后端发起消息请求；回到页面或窗口重新获得焦点时立即刷新一次。
- 只保留当前群的轮询；切群或卸载后停止，旧响应不得修改新界面。
- 新消息按 `mid` 去重后追加，永不移动视口；到达时结束落底收尾。

### 新消息提示与滚底

- 有新消息时显示「有新消息」提示；用户滚动到接近底部时提示自动隐藏。
- 点击提示或右下角「滚到最新消息」按钮：先刷新一次，再一次落底、收起提示并结束收尾。

### Catch-up

- 页面隐藏或失焦时结束收尾并标记需要补齐；恢复时用 `afterCreatedAt`／`afterMid` 从已加载的最新消息向后分页，直到没有更多。
- 补齐的消息按序追加，不移动视口；补齐完成后同样显示提示。

## 验收标准

- [x] 每秒轮询当前群；失败后按 1 秒起的指数退避重试并封顶 30 秒，成功后恢复 1 秒；页面隐藏期间不发起消息请求。
- [x] 轮询到新消息时按 `mid` 去重追加，视口位置不变，并显示「有新消息」。
- [x] 点击提示或滚底按钮后只刷新一次，随后落到底部、提示收起；滚动到接近底部时提示隐藏。
- [x] 失焦或隐藏后恢复时，以 `afterCreatedAt`／`afterMid` 补齐断档，按序追加且不移动视口。
- [x] 切群或卸载后旧轮询与旧响应不修改新界面；全程无业务写请求。
- [x] 旧正式 chat 与 React post 回归保持通过，构建资源中的 chat 预览可加载。

## 验证方法

- 先红后绿：先用现有实现的断言复现「新消息不出现、没有提示、没有轮询」。
- 扩展 frontend/tests/chat.spec.ts：本地替身支持 `after` 游标与延迟响应，断言轮询请求、去重追加、视口不动、提示与滚底、失焦后的 catch-up、切群隔离。
- 运行 `npm run typecheck`、`npm test`、`mvn "-Dtest=PostPageTest,GroupChatPageTest" test "-Dskip.npm=true" "-Dskip.installnodenpm=true"`，使用本轮构建的生成资源。
- 证据写回本票并同步 [阶段计划](../PLAN.md)。

## 范围外

微博接口调用与写入（Background Capture）、群列表元数据刷新与未读统计、消息发送、表态、历史浏览、Analysis、回归庆祝、扫码登录、沉浸阅读。

## 实施与验证证据

日期：2026-10-17。

### 实现

- `MessageList.tsx` 增加轮询循环：每 1 秒调用 `refreshOnce`；失败按 `1s × 2^n` 退避、封顶 30 秒，成功后归零；页面隐藏时 `refreshOnce` 直接早退，不发请求；`visibilitychange`、`blur`、`focus` 分别标记 away、结束收尾与立即唤醒。
- 新消息按 `mid` 去重后追加；`appendFresh` 结束落底收尾并显示「有新消息」，不移动视口。
- 失焦或隐藏后，`pendingCatchUp` 让下一次刷新改走 `afterCreatedAt`／`afterMid` 分页，循环补齐直到没有更多；游标不前进时退出，避免死循环。
- 提示与右下角按钮共用 `jumpToLatest`：先刷新一次，再一次性落底并收起提示；滚动到距底部 80px 内时提示自动隐藏。
- `api.ts` 增加 `fetchNewerMessages` 与 `nextAfterCursor`；`chat.css` 增加提示与滚底按钮样式，沿用旧页的 `--accent` 与几何。

### 红绿

- 临时撤下轮询与 Catch-up 实现后运行四项新用例：新消息轮询、滚底按钮、失焦补齐、失败退避全部失败（4 failed）；恢复后通过。

### 验证

- 前端：`npm run typecheck` 通过；`npm run build` 通过；`npx playwright test` 144 项通过，其中 `chat.spec.ts` 21 项、post 既有 123 项。
- Java：`mvn "-Dtest=PostPageTest,GroupChatPageTest" test "-Dskip.npm=true" "-Dskip.installnodenpm=true"` 100 项通过（GroupChatPageTest 82、PostPageTest 18），使用本轮构建的生成资源。
- 覆盖：轮询请求序列与当前群限定、失败后恢复、新消息去重追加与视口不动、提示和滚底按钮、失焦后的 `after` 游标补齐、切群与卸载隔离；无业务写请求。
- 测试替身对 `afterCreatedAt`／`afterMid` 分页与延迟响应提供支持，避免轮询与 Catch-up 竞争造成偶发失败。

## 交付与下一步

形成可回退增量。完成后更新阶段计划的当前任务表、阶段 4 状态与本票记录；下一票建议为群列表与元数据刷新。
