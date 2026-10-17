# 21：chat 图片查看器与视频播放

**What to build:** 点击消息图片缩略图在原页面打开全屏查看器，读取原图并显示加载／失败状态；点击视频封面在原地替换为可播放的视频，不发生页面跳转。

**Blocked by:** 20，已完成。

**Status:** resolved

日期：2026-10-17。用户要求继续下一票。本票只做单张图片查看与视频播放，不做多图画廊与下载。

## 实施边界

### 图片查看器

- 点击缩略图打开 `<dialog>` 全屏查看器，图片地址优先 `originalUrl`，缺失时退回 `previewUrl`。
- 加载中隐藏图片并显示「正在加载原图…」；失败显示「原图加载失败，请关闭后重试。」，图片保持隐藏。
- Escape 与点击遮罩关闭；关闭后焦点回到触发的缩略图按钮。
- 查看器不加入消息窗口计量，打开与关闭不移动消息区滚动位置。

### 视频播放

- 带 `videoUrl` 的消息显示封面按钮与播放标识，点击后原地替换为 `<video controls preload="metadata">`，地址为 `videoUrl`。
- 自动播放被浏览器拒绝时保留控件与暂停状态，不重试、不跳转、不打开新窗口。

### 样式

- 查看器与媒体尺寸沿用旧页：遮罩 `rgb(0 0 0 / 76%)`、图片 `object-fit: contain`、缩略图 `min(320px, 70vw)` 与 240px 上限、视频封面播放标识 48px 圆形半透明底。

## 验收标准

- [x] 点击图片缩略图打开全屏查看器，`src` 为 `originalUrl`；加载完成后图片可见、状态文案为空。
- [x] 原图加载失败时图片保持隐藏并显示失败文案，关闭后仍可再次打开。
- [x] Escape 与点击遮罩都能关闭查看器，关闭后焦点回到触发按钮，消息区 `scrollTop` 不变。
- [x] 视频封面点击后原地出现带 `controls` 的 `<video>`，`src` 为 `videoUrl`，不产生新窗口、导航或页面错误。
- [x] 查看器打开期间消息节点数量不变，窗口、滚动与锚点用例保持通过。
- [x] 旧正式 chat 与 React post 回归保持通过，构建资源中的 chat 预览可加载。

## 验证方法

- 先红后绿：先用现有实现的断言复现「点击缩略图没有查看器、点击视频封面没有播放」。
- 扩展 frontend/tests/chat.spec.ts：本地替身区分 preview／original／video 变体，断言 `src`、加载与失败状态、Escape／遮罩关闭、焦点恢复、滚动位置与视频元素。
- 运行 `npm run typecheck`、`npm test`、`mvn "-Dtest=PostPageTest,GroupChatPageTest" test "-Dskip.npm=true" "-Dskip.installnodenpm=true"`，使用本轮构建的生成资源。
- 证据写回本票并同步 [阶段计划](../PLAN.md)。

## 范围外

多图画廊与左右切换、图片下载、视频全屏与自定义控件、表态、发送、轮询、历史、分析、回归庆祝、扫码登录、长会话内存裁剪。

## 实施与验证证据

日期：2026-10-17。

### 实现

- `ImageViewer.tsx` 用原生 `<dialog>` 承载全屏查看器：`showModal()` 打开、`close()`／Escape／遮罩点击关闭；图片按 `key=url` 重新挂载，加载中隐藏图片并显示「正在加载原图…」，失败显示失败文案；关闭事件统一交回父组件清空地址，焦点由原生 dialog 还给触发按钮。
- `MessageItem.tsx` 把图片缩略图改为按钮（`aria-label="查看原图"`），地址优先 `originalUrl`；视频封面带播放标识，点击后原地替换为 `<video controls preload="metadata" autoplay>`。
- `MessageList.tsx` 持有查看器地址，`<dialog>` 渲染在滚动容器之外，不参与消息窗口计量与占位高度。
- `chat.css` 按旧页尺寸补齐 `.media-preview`（`min(320px, 70vw)`、最小高 120px、240px 上限、深色底）、播放标识与 `.image-viewer` 遮罩、图片 contain、状态文字居中。

### 红绿

- 临时撤下查看器与视频实现后运行三项新用例：视频、图片查看器、查看器失败全部失败（3 failed）；恢复后通过。

### 验证

- 前端：`npm run typecheck` 通过；`npm run build` 通过；`npx playwright test` 140 项通过，其中 `chat.spec.ts` 17 项、post 既有 123 项。
- Java：`mvn "-Dtest=PostPageTest,GroupChatPageTest" test "-Dskip.npm=true" "-Dskip.installnodenpm=true"` 100 项通过（GroupChatPageTest 82、PostPageTest 18），使用本轮构建的生成资源。
- 覆盖：原图地址优先、加载完成与失败状态、Escape 与遮罩关闭、焦点回到触发按钮、打开前后 `scrollTop` 不变、视频原地替换与不导航、查看器不进入消息节点计数。
- 自动播放可能被浏览器策略拒绝，此时保留 `<video>` 控件与暂停状态；不外发请求、不重试。

## 交付与下一步

形成可回退增量。完成后更新阶段计划的当前任务表、阶段 4 状态与本票记录；下一票建议为 View Refresh 与 Catch-up。
