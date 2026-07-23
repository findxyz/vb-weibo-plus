# 02 — 微博正文搜索与原微博链接

**What to build:** 让调用方通过现有微博列表接口组合筛选本地 Blogger Blog，并能按当前正文或转发正文找到微博、直接打开当前原微博。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 微博列表增加可选 `keyword`，并保留现有 `page = 1`、`size = 100` 默认值、范围校验和重复 `uids` 传参规则。
- [ ] 关键词对当前微博可见正文和被转发微博可见正文做字面包含匹配，两者之间使用 `OR`。
- [ ] 关键词条件与 `uids`、`start`、`end` 使用 `AND` 组合，时间语义与群消息一致。
- [ ] 关键词中的数据库通配字符按普通字符处理，转发信息的非正文字段不能造成误命中。
- [ ] 结果按 `createdAt DESC、postId DESC` 排序，总数反映完整数据库筛选条件，不在分页后做内存过滤。
- [ ] 当前微博响应增加后端生成的 `postUrl`；被转发微博响应不增加该字段。
- [ ] 通过已确认的 Controller、真实 SQLite Repository 和 Mapper seam，以逐个红绿循环覆盖搜索、组合筛选、排序、总数和链接契约。
- [ ] `API.http` 增加当前正文、转发正文和组合条件搜索的可直接执行示例，并展示响应中的当前原微博链接。
- [ ] 相关单项测试和完整测试套件通过，完成 Standards 与 Spec 双轴代码审查后提交。
