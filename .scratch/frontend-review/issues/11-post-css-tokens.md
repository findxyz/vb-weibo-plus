# 11 — post.css 令牌收口与重复块去重（纸感手绘）

**What to build:** 按 docs/design/DESIGN.md 把纸感手绘皮肤缺失的令牌补成 CSS 变量（硬偏移阴影近景/卡片两档、斜纹头像底纹、正文基础字体栈等），正文重复取值全部收口：认证徽章 data-URI、斜纹底纹、硬偏移阴影、标题栏 marker 带与关闭按钮块。纯等值替换，视觉零变化。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] 硬偏移阴影两档成为变量并统一引用，无模糊投影混入
- [x] 斜纹头像底纹、认证徽章 data-URI 只声明一次
- [x] 正文/转发正文字体栈引用变量，不再绕过令牌硬编码
- [x] dialog 标题栏 marker 带与关闭按钮重复块合并
- [x] 对照 style-guide.html 与原页面视觉一致

## Comments

- :root 新增 --hatch（DESIGN.md：sketch-hatch）、--sans（正文 Tahoma 字体栈）、--shadow-near/--shadow-card/--shadow-dialog（硬偏移三档，无模糊）、--avatar-hatch、--title-band、--verified-badge。
- 硬偏移阴影 7 处、斜纹头像底纹 3 处、认证徽章 data-URI 2 处、正文/转发字体栈 2 处全部改为引用变量；主标题栏与三个对话框标题栏共用 --title-band。
- add-blogger/sync-history/search-overlay 三个对话框的标题栏、h2 与关闭按钮（含 ::before、hover）合并为单一规则组。
- posts-state 与视频播放钮的两处既有模糊投影按「纯等值替换」保留未动；转发空位斜纹（--grid 变体）与头像斜纹非同款，不并入。
- 验证：与工单 10 同法，107 个元素 computed-style 全量比对渲染属性零差异，截图目视正常。
