# 01 — 群消息组合筛选与稳定分页

**What to build:** 让调用方通过现有群消息列表接口，按可选时间、发言人姓名和正文关键词组合筛选本地 Group Message，并获得可预测的倒序分页结果。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 群消息列表要求显式提供 `gid`、`page`、`size`，并保留现有页码与每页数量校验。
- [ ] `start`、`end`、`senderName`、`keyword` 均可选；省略或空白值不产生筛选条件。
- [ ] 时间按 `Asia/Shanghai` 解析，起止边界均包含，并支持只有单侧边界。
- [ ] `senderName` 使用精确匹配，`keyword` 只对消息正文做字面包含匹配，数据库通配字符按普通字符处理。
- [ ] 所有已提供条件使用 `AND` 组合，结果按 `createdAt DESC、mid DESC` 排序，总数反映完整筛选条件。
- [ ] 通过已确认的 Controller 与真实 SQLite Repository seam，以逐个红绿循环覆盖参数契约、组合筛选、字面匹配、排序和总数。
- [ ] `API.http` 增加群消息分页、时间、发言人、关键词及组合筛选的可直接执行示例，所有示例显式传递分页参数。
- [ ] 相关单项测试和完整测试套件通过，完成 Standards 与 Spec 双轴代码审查后提交。
