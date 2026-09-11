# 08 — chat 页 elements 依赖裁剪

**What to build:** chat 页引导代码收集的约 80 个 DOM 引用改为按模块裁剪注入：每个工厂只接收自己实际使用的元素句柄，模块依赖一目了然。纯接线改动，不改任何行为。

**Blocked by:** 05（弹层接入同样改 chat 页接线，避免冲突）。

**Status:** resolved

- [x] 各工厂函数签名只含其使用的元素/依赖，页内 elements 映射相应瘦身
- [x] 所有按钮、弹窗、面板行为与改动前一致
- [x] 页内不再有整包 elements 透传

## Comments

- 六个工厂（group-list、conversation-session、composer、analysis、history、celebration）签名改为 `elements: {k1, k2, …}` 解构，各自枚举实际用到的句柄；工厂文件内 `elements.x` 全部改为裸名。message-view 与 dream 本就收独立句柄，未动。
- chat.js 调用点以 3 行助手 `pickElements(...keys)` 按签名名单挑子集注入，整包 elements 透传消失；主映射表保留为页内唯一的 DOM 查询点。
- 两处局部命名冲突以别名化解：conversation-session 的 `messages`（本地 Map）→ `messagesElement`，celebration 的 `celebrationRoster`（本地存储对象）→ `celebrationRosterElement`。
- 顺手修复工单 01 引入的回归：`historyTitle` 当时被整行从映射表删除，但 history.js 的 setGroup 仍要写它（切群即抛错）；本次把 `#history-title` 查询加回映射表并由 history 子集注入。烟雾验证时重点回归切群标题。
- 用脚本交叉校验：工厂解构名单 ⊆ pickElements 传参 ⊆ 主映射表，WIRING-OK；commit 0b73c00。
