# 25：chat 图片与视频发送

**What to build:** 编辑器支持选择或粘贴图片／视频，发送前显示附件预览并可移除；按 Enter 发送附件，成功后清空并触发一次本地刷新，失败保留附件并提示。

**Blocked by:** 24，已完成。

**Status:** resolved

日期：2026-10-17。用户要求继续下一票。本票只做图片与视频附件发送，不做发送队列与重试。

## 实施边界

### 选择与校验

- 工具行增加「图片」「视频」按钮，分别打开 `accept="image/*"` 与 `accept="video/mp4"` 的文件选择；无选中群或发送中禁用。
- 图片必须是 `image/*`，上限 20MB；视频必须是 `video/mp4`，上限 100MB；不符合时保留当前输入并提示「仅支持图片文件。」「仅支持 MP4 视频文件。」「图片不能超过 20MB。」「视频不能超过 100MB。」。
- 编辑器内粘贴图片或视频文件时按同样规则进入附件流程。

### 附件预览与发送

- 选中后显示图片或静音视频预览，说明文字区隐藏、提示改为「按下 Enter 发送图片」或「按下 Enter 发送视频」；焦点移到附件区，可按 Enter 发送。
- 附件区提供「删除附件」按钮，移除后恢复文本输入与默认提示。
- 发送走 `POST /chat/messages/sendImage` 或 `/chat/messages/sendVideo`，`multipart/form-data` 含 `gid` 与 `file`；成功后清空附件并触发一次本地刷新，失败保留附件并提示服务端消息或「图片发送失败，请稍后重试。」／「视频发送失败，请稍后重试。」。
- 发送中禁用输入与附件操作；不做乐观插入，不直接写本地库（[ADR 0002](../../../docs/adr/0002-send-does-not-write-to-store-directly.md)）。

## 验收标准

- [x] 选择图片后显示预览、隐藏文本框、提示「按下 Enter 发送图片」，焦点在附件区。
- [x] Enter 发送图片，请求为 multipart 且含 `gid` 与文件名；成功后附件清空、文本框恢复并立即触发一次消息刷新。
- [x] 选择视频后显示静音视频预览，Enter 发送到 `sendVideo`。
- [x] 错误的类型或超限大小给出对应提示，且不进入附件状态。
- [x] 删除附件后恢复文本输入与默认提示。
- [x] 粘贴图片进入附件流程；无选中群时图片／视频按钮禁用。
- [x] 发送失败保留附件并提示；发送中禁用相关控件。
- [x] 旧正式 chat 与 React post 回归、构建资源检查保持通过。

## 验证方法

- 先红后绿：先用现有实现的断言复现「没有图片／视频入口、无法发送附件」。
- 扩展 frontend/tests/chat.spec.ts：用 `setInputFiles` 提供小型 PNG／MP4，断言预览、提示、multipart 请求、清空、失败保留、类型与大小校验、粘贴与无群禁用。
- 运行 `npm run typecheck`、`npm test`、`mvn "-Dtest=PostPageTest,GroupChatPageTest" test "-Dskip.npm=true" "-Dskip.installnodenpm=true"`，使用本轮构建的生成资源。
- 证据写回本票并同步 [阶段计划](../PLAN.md)。

## 范围外

发送队列与自动重试、断点续传、图片压缩、多附件、拖拽排序、撤回、历史记录与群聊分析入口。

## 实施与验证证据

日期：2026-10-17。

### 实现

- `Composer.tsx` 增加图片／视频选择、附件预览、删除与粘贴：类型与大小校验沿用旧页规则（图片 `image/*`、20MB；视频 `video/mp4`、100MB），选中后隐藏文本框、提示改为「按下 Enter 发送图片／视频」并把焦点移到附件区；Enter 发送附件，失败保留附件，发送中禁用相关控件。
- `api.ts` 增加 `sendImage`／`sendVideo`，以 `multipart/form-data` 提交 `gid` 与 `file`；Vite 代理补上 `/chat/messages/sendImage` 与 `/chat/messages/sendVideo`。
- 附件预览使用对象 URL，替换或卸载时释放；发送成功后清空附件并触发一次本地刷新，仍不做乐观插入（ADR 0002）。
- `chat.css` 增加附件区、120×60 预览、删除按钮与工具行图标样式，沿用旧页尺寸与配色。

### 红绿

- 临时撤下附件发送实现后运行六项新用例：图片发送、视频发送、删除附件、类型与大小校验、失败保留、粘贴进入附件流程全部失败（6 failed）；恢复后通过。

### 验证

- 前端：`npm run typecheck` 通过；`npm run build` 通过；`npx playwright test` 最终 157 项通过，其中 `chat.spec.ts` 34 项、post 既有 123 项。
- Java：`mvn "-Dtest=PostPageTest,GroupChatPageTest" test "-Dskip.npm=true" "-Dskip.installnodenpm=true"` 100 项通过（GroupChatPageTest 82、PostPageTest 18），使用本轮构建的生成资源。
- 覆盖：图片／视频预览与提示、焦点转移、multipart 请求与文件名、发送后清空与刷新、删除附件、类型与 20MB／MP4 校验、失败保留、粘贴、无群禁用。
- 全量前端曾出现与本次改动无关的 post 用例偶发失败（元数据几何、内联图片代理、900 宽组合工作流），单独复跑与最终全量复跑均通过，按偶发记录。

## 交付与下一步

形成可回退增量。完成后更新阶段计划的当前任务表、阶段 4 状态与本票记录；下一票建议为表态。
