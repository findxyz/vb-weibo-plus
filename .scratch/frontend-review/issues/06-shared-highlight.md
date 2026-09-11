# 06 — shared：关键词高亮统一为 DOM 版

**What to build:** 以历史记录模块的 DOM 版文本高亮为基准抽到 shared，post 页搜索结果摘要改用它构建，删除字符串拼接 + 手工 escapeHtml 的实现及 innerHTML 注入点。

**Blocked by:** 03。

**Status:** ready-for-agent

- [ ] shared 提供 appendHighlightedText（DOM 构建、大小写不敏感、全部命中包裹 mark）
- [ ] post 页搜索摘要改用 DOM 版（含命中词截取前后文的逻辑保留）
- [ ] post 页 escapeHtml 与 snippet innerHTML 赋值删除
- [ ] 搜索结果高亮显示与点击跳转行为不变

## Comments
