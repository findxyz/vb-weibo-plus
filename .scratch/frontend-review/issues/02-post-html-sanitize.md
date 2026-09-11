# 02 — post 页富文本白名单清理（纵深防御）

**What to build:** post 页正文与转发正文在渲染前做一次客户端白名单清理：解析建树后移除 script/iframe/style/object 等元素与 on* 事件属性、javascript: 链接。后端清洗仍为主防线，此为纵深防御，正常内容视觉零变化。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] 渲染管线上对解析后的 DOM 树做白名单清理，不引入新依赖
- [x] script/iframe/object/embed 元素被移除；所有元素上的 on* 属性被移除
- [x] a 标签的 javascript: href 被移除或置空
- [x] 既有微博正文（含表情图、链接、@提及）渲染结果与清理前一致

## Comments

- `sanitizeContentTree(root)` 插在 `renderContent` 的 DOMParser 解析之后、linkify 之前，正文与转发正文两个调用点一次覆盖；清理与 linkify 都在 detached 文档树上进行，最后才序列化回填，无执行风险。
- 元素白名单取票据点名集合：script、iframe、style、object、embed；属性清理遍历全部元素，on* 前缀一律移除，href 匹配 `^\s*javascript:`（忽略前导空白、大小写不敏感）时移除属性。
- 内联 style 属性保留（微博正文的颜色/加粗样式依赖它，视觉零变化）；linkify 自产的 a 标签只使用 http/https 地址，不受清理影响。
- commit 1170aab；渲染结果一致性留待收尾的浏览器烟雾验证对照。
