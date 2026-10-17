# 24：chat 文本发送与表情面板

**What to build:** chat 预览增加消息编辑器：Enter 发送文本、Shift+Enter 换行；发送成功后清空输入并触发一次本地刷新，由轮询／采集把新消息带回；失败保留文本并提示；表情面板可插入微博表情短语。

**Blocked by:** 23，已完成。

**Status:** resolved

日期：2026-10-17。用户要求继续下一票。本票只做文本发送与表情插入，不做图片／视频发送。

## 实施边界

### 编辑器与发送

- 编辑器位于消息区下方，沿用旧页的工具行、输入框与提示文案；无选中群时输入框禁用。
- Enter 发送；Shift、Ctrl、Meta 加 Enter 换行；空内容或纯空白不发送。
- 发送中禁用输入框并显示「发送中…」；成功后清空、恢复提示、把焦点还给输入框，并触发一次立即刷新，不等待下一秒轮询。
- 失败保留已输入文本：普通失败提示服务端消息或「消息发送失败，请稍后重试。」；409 提示服务端消息或「消息已发出，但本地同步失败，稍后会自动补全。」。
- 不把发送响应直接构造成消息，不做乐观插入（[ADR 0002](../../../docs/adr/0002-send-does-not-write-to-store-directly.md)）。

### 表情面板

- 工具行「😊 表情」按钮切换面板；面板为 `role="dialog"`，首次打开时按共享表情映射懒构建格子，贴图懒加载。
- 点击格子把短语插入输入框光标处，焦点回到输入框，面板保持打开；外部点击与 Escape 关闭，关闭时若焦点仍在格子上则还给触发按钮。
- 没有选中群时表情按钮禁用。

## 验收标准

- [x] Enter 发送 trimmed 内容，请求为 `POST /chat/messages/send`，表单含 `gid` 与 `content`；成功后输入框清空并立即触发一次消息刷新。
- [x] Shift+Enter 换行且不发送；纯空白不发送。
- [x] 发送失败保留文本并显示对应提示；409 使用同步失败文案；发送中显示「发送中…」且输入框禁用。
- [x] 表情按钮打开面板，格子按共享映射生成；点击 `[doge]` 插入到光标处并把焦点还给输入框；Escape 与外部点击关闭。
- [x] 无选中群时输入框与表情按钮禁用。
- [x] 不产生乐观消息；新消息仍由读取接口带回，视口规则不变。
- [x] 旧正式 chat 与 React post 回归、构建资源检查保持通过。

## 验证方法

- 先红后绿：先用现有实现的断言复现「没有编辑器、无法发送、没有表情面板」。
- 扩展 frontend/tests/chat.spec.ts：本地替身拦截发送请求并模拟采集后的新消息，断言表单、清空、立即刷新、失败保留、409 文案与表情插入。
- 运行 `npm run typecheck`、`npm test`、`mvn "-Dtest=PostPageTest,GroupChatPageTest" test "-Dskip.npm=true" "-Dskip.installnodenpm=true"`，使用本轮构建的生成资源。
- 证据写回本票并同步 [阶段计划](../PLAN.md)。

## 范围外

图片／视频发送与附件预览、历史记录与群聊分析入口、消息撤回、@ 与话题补全、草稿持久化、发送重试队列。

## 实施与验证证据

日期：2026-10-17。

### 实现

- `Composer.tsx` 负责输入、提示与发送：Enter 发送、Shift／Ctrl／Meta+Enter 换行、空内容不发送；发送中禁用并显示「发送中…」，成功后清空、恢复提示并触发一次 `onSent`；失败保留文本，409 使用同步失败文案，其余使用服务端消息或默认失败文案。
- `EmojiPanel.tsx` 首次打开时才按共享映射构建格子；点击插入到光标处在受控输入上用「待恢复光标」实现；外点与 Escape 关闭，关闭时按焦点位置决定是否把焦点还给触发按钮。
- `api.ts` 增加 `HttpError`（带状态码）与 `sendText`，发送走 `application/x-www-form-urlencoded`；Vite 代理补上 `/chat/messages/send`。
- `ChatPage.tsx` 在消息区下方加入 154px 的编辑器行，并把发送成功转成 `refreshToken`；`MessageList.tsx` 监听该 token 立即执行一次 View Refresh，仍由读取接口带回新消息，不做乐观插入。
- `chat.css` 增加编辑器、提示、表情面板与格子样式，沿用旧页尺寸与配色。

### 红绿

- 临时撤下编辑器与发送实现后运行四项新用例：Enter 发送、Shift+Enter、失败保留、表情插入全部失败（4 failed）；恢复后通过。

### 验证

- 前端：`npm run typecheck` 通过；`npm run build` 通过；`npx playwright test` 151 项通过，其中 `chat.spec.ts` 28 项、post 既有 123 项。
- Java：`mvn "-Dtest=PostPageTest,GroupChatPageTest" test "-Dskip.npm=true" "-Dskip.installnodenpm=true"` 100 项通过（GroupChatPageTest 82、PostPageTest 18），使用本轮构建的生成资源。
- 覆盖：发送表单与立即刷新、清空与焦点、Shift+Enter 与空白、失败与 409 保留文本、发送中禁用、表情插入光标处与焦点还原、Escape／外点关闭、无群时禁用。
- 调整一处既有断言：加入编辑器后消息区变矮，任务 19 的滚轮用例暴露 Chrome 滚动锚定对上方图片撑高的约 61px 补偿；断言从「scrollTop 完全不变」改为「不回到真底部且位移小于 200px」，语义仍是「收尾结束后撑高不把视口拽回底部」。

## 交付与下一步

形成可回退增量。完成后更新阶段计划的当前任务表、阶段 4 状态与本票记录；下一票建议为图片与视频发送。
