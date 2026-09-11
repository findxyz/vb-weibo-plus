# 02 — post 页富文本白名单清理（纵深防御）

**What to build:** post 页正文与转发正文在渲染前做一次客户端白名单清理：解析建树后移除 script/iframe/style/object 等元素与 on* 事件属性、javascript: 链接。后端清洗仍为主防线，此为纵深防御，正常内容视觉零变化。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 渲染管线上对解析后的 DOM 树做白名单清理，不引入新依赖
- [ ] script/iframe/object/embed 元素被移除；所有元素上的 on* 属性被移除
- [ ] a 标签的 javascript: href 被移除或置空
- [ ] 既有微博正文（含表情图、链接、@提及）渲染结果与清理前一致

## Comments
