# 10 — chat.css 令牌收口与重复块去重（蔚蓝拟物）

**What to build:** 按 docs/design/DESIGN.md 把蔚蓝拟物皮肤缺失的令牌补成 CSS 变量（标题栏四段渐变、气泡描边、琥珀系状态色、玻璃高光阴影等），正文 hex 全部收口到变量；标题栏渐变块与关闭按钮块的多处重复声明合并为单一规则。纯等值替换，视觉零变化。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] DESIGN.md 中已命名但未定义的 chat 侧取值全部成为 :root 变量并被引用
- [ ] 标题栏渐变 + 内阴影只声明一次（含重叠元素的去重）
- [ ] 对话框/弹层关闭按钮（含 ::before 与 hover）合并为一组规则
- [ ] 两套皮肤不新增任何共享颜色变量（令牌不混用）
- [ ] 浏览器对照 docs/design/style-guide.html 与原页面视觉一致

## Comments
