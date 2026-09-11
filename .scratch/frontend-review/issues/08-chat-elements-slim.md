# 08 — chat 页 elements 依赖裁剪

**What to build:** chat 页引导代码收集的约 80 个 DOM 引用改为按模块裁剪注入：每个工厂只接收自己实际使用的元素句柄，模块依赖一目了然。纯接线改动，不改任何行为。

**Blocked by:** 05（弹层接入同样改 chat 页接线，避免冲突）。

**Status:** ready-for-agent

- [ ] 各工厂函数签名只含其使用的元素/依赖，页内 elements 映射相应瘦身
- [ ] 所有按钮、弹窗、面板行为与改动前一致
- [ ] 页内不再有整包 elements 透传

## Comments
