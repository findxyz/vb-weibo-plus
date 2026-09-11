# 06 — shared：关键词高亮统一为 DOM 版

**What to build:** 以历史记录模块的 DOM 版文本高亮为基准抽到 shared，post 页搜索结果摘要改用它构建，删除字符串拼接 + 手工 escapeHtml 的实现及 innerHTML 注入点。

**Blocked by:** 03。

**Status:** resolved

- [x] shared 提供 appendHighlightedText（DOM 构建、大小写不敏感、全部命中包裹 mark）
- [x] post 页搜索摘要改用 DOM 版（含命中词截取前后文的逻辑保留）
- [x] post 页 escapeHtml 与 snippet innerHTML 赋值删除
- [x] 搜索结果高亮显示与点击跳转行为不变

## Comments

- shared/highlight.js 的 `appendHighlightedText(element, value, keyword, {max})` 在 history 原版上加了可选 `max`（默认全部标记）：history 走默认全量；post 摘要传 `max: 1` 只标首处命中，与原 buildSnippet 行为一致。
- post 摘要改为 `appendSearchSnippet(snippet, post, keyword)`：±30 字符窗口截取与省略号逻辑原样保留，省略号作为独立文本节点 append 在窗口两侧；窗口内首处命中必是原文首处命中（idx 本就是首次出现位置），显示无差异。
- escapeHtml 函数与 `snippet.innerHTML` 注入点删除；post.js 剩余 innerHTML 均为清空赋值或属工单 02（renderContent）范围。
- 大小写折叠统一为 toLocaleLowerCase（原 post 用 toLowerCase），对中英文关键词结果一致；commit ce7c9b7。
