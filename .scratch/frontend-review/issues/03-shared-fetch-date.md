# 03 — shared 基建第一批：fetchJson 与日期工具，chat 页接入

**What to build:** 新建 `static/shared/` 目录，落地两份跨页工具：统一 fetchJson（解析错误响应体取 msg，附带 status）与日期工具（本地日期值、格式化、日历倒退 N 月、日起止时间封装）。chat 页（含由其注入的历史/分析模块）改用共享版，删除页内副本。post 页接入留到模块化工单。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] shared/fetch.js 提供 fetchJson：非 2xx 时抛出携带 status 与后端 msg 的错误
- [ ] shared/date.js 提供本地日期值、pad、日起止（00:00:00/23:59:59）与 calendarMonthsAgo
- [ ] chat 页与 chat-common 删除重复副本，统一从 shared 导入
- [ ] composer 的错误提示仍能显示后端 msg（handleSendError 里的二次解析随之简化）
- [ ] 两页全部既有功能行为不变

## Comments
