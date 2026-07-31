# 01 - Historical Capture 端到端打通

**What to build:** 从聊天记录模态窗（Historical Browse）触发一次 Historical Capture：操作者在筛选区选一个时间点并点击「同步历史」按钮，后端立即返回，在后台线程向微博拉取该群更早的 Group Messages 入库，拉取以本地 `min_mid` 为起点跳过已捕获区间，到指定时间点为止。操作者稍后手动重新查询模态窗，能看到原本不存在的更早消息。

**Blocked by:** None - can start immediately

**Status:** ready-for-agent

- [ ] 新增 `GroupRepository.findMinMid(gid)`，语义仿 `findMaxMid`（返回本地该群已存消息的最小 mid，无消息返回 0）
- [ ] 在配置类（`WeiboApplication` 或 `WeiboConfig`）开启 `@EnableAsync`，使 `@Async` 注解生效
- [ ] 新增异步触发端点（如 `POST /chat/historical-capture?gid=&sinceTime=`），方法标注 `@Async`，内部调用 `saveBySince(gid, sinceTime, beforeMid)`，其中 `beforeMid` = 本地 `min_mid`；当 `min_mid == 0`（空群）时传 `null` 以走「拉最新 50 条」语义
- [ ] 端点立即返回（不等待 `saveBySince` 完成），HTTP 200；`saveBySince` 的返回值不回传前端
- [ ] 模态窗筛选区（`.history-filters`）增加一个时间选择器与「同步历史」按钮；点击后 `fetch` 异步端点，给出「已开始同步，稍后请手动刷新查看」提示，不轮询、不等待结果
- [ ] 验证：对一个本地已有部分消息的群，指定一个更早的时间点触发同步，等待一段时间后重新查询模态窗，能看到时间点之前、原本缺失的旧消息已入库
- [ ] 不改动 `saveBySince` 的锁、翻页、sleep 逻辑；不改动定时任务与主对话窗口
