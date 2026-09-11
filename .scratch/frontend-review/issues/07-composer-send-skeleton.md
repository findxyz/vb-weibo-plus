# 07 — composer 发送骨架统一与提示常量化

**What to build:** composer 的文本发送与附件发送合并为公共骨架（禁用 UI、提示、错误处理、finally 复位），提示文案收成常量，发送状态用变量管理而不是从 DOM 文本反读。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 文本与附件发送共用一个 send 骨架，409 特判与错误回退保留
- [ ] 「按下 Enter 发送内容 / Shift+Enter 换行」等文案为单一常量来源（页面初始 hint 同源或保持一致）
- [ ] input 事件依据状态变量恢复提示，不再 textContent 字符串比较
- [ ] 发送中/失败/成功提示行为与现在一致

## Comments
