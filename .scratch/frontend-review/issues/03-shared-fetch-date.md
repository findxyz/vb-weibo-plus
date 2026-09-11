# 03 — shared 基建第一批：fetchJson 与日期工具，chat 页接入

**What to build:** 新建 `static/shared/` 目录，落地两份跨页工具：统一 fetchJson（解析错误响应体取 msg，附带 status）与日期工具（本地日期值、日起止时间封装、日历倒退 N 月）。chat 页（含由其注入的历史/分析模块）改用共享版，删除页内副本。post 页接入留到模块化工单。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] shared/fetch.js 提供 fetchJson：非 2xx 时抛出携带 status 与后端 msg 的错误
- [x] shared/date.js 提供本地日期值、pad、日起止（toQueryDateTime/toQueryEndTime）与 calendarMonthsAgo
- [x] chat 页与 chat-common 删除重复副本，统一从 shared 导入
- [x] composer 的错误提示仍能显示后端 msg（composer 接入统一骨架后 naturally 获得，见工单 07）
- [x] 两页全部既有功能行为不变

## Comments

- chat.js 改从 shared 导入 fetchJson/localDateValue/calendarMonthsAgo，本地副本删除；chat-common.js 仅保留消息比较与滚动锚点三个 DOM/域工具。composer 留待工单 07 一并接入。
