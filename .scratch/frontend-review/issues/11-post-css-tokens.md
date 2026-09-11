# 11 — post.css 令牌收口与重复块去重（纸感手绘）

**What to build:** 按 docs/design/DESIGN.md 把纸感手绘皮肤缺失的令牌补成 CSS 变量（硬偏移阴影近景/卡片两档、斜纹头像底纹、正文基础字体栈等），正文重复取值全部收口：认证徽章 data-URI、斜纹底纹、硬偏移阴影、标题栏 marker 带与关闭按钮块。纯等值替换，视觉零变化。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 硬偏移阴影两档成为变量并统一引用，无模糊投影混入
- [ ] 斜纹头像底纹、认证徽章 data-URI 只声明一次
- [ ] 正文/转发正文字体栈引用变量，不再绕过令牌硬编码
- [ ] dialog 标题栏 marker 带与关闭按钮重复块合并
- [ ] 对照 style-guide.html 与原页面视觉一致

## Comments
