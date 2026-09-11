# 04 — shared：QR 扫码登录组件化，两页接入

**What to build:** 把群聊页与 post 页各自复制的二维码登录轮询逻辑抽成 shared 组件（拉起二维码、10s 轮询刷新、停止清理、防重入），两页以元素句柄接入。以群聊页版本为基准，post 页顺带补齐防重入与加载占位，失败文案不再挤占博主列表状态栏。

**Blocked by:** 03（shared 目录与 fetchJson 已就位）。

**Status:** resolved

- [x] shared 提供 QR 登录控制器：start（防重入 + 首次延迟拉取 + 轮询）与 stop（清定时器、复位 UI）
- [x] 群聊页接入后行为不变（含 qr-loading 占位与「扫码登录失败」反馈）
- [x] post 页接入后获得防重入与按钮 loading 态，失败提示有归属位置
- [x] 两页页内 QR 轮询副本删除

## Comments

- shared/qr-login.js 为工厂形态：`createQrLogin({button, image, loading?, idleText, loadingText, onSuccess, onError})`，内部自带防重入、3 秒首拉、10 秒轮询、按钮 loading 态，并自行绑定点击监听；对外附 `pending` getter（群聊页状态检查门控用它替换了 `state.loginPending`）。
- 顺手修正一处旧缺陷：首拉的 3 秒 setTimeout 现在纳入 stop 清理，请求快速失败时不会再有迟到的二维码刷新把 UI 弄脏。
- post 页 post.js 由经典脚本转为 `type="module"`（IIFE 结构保留，仅顶部加 import），才能引 shared 模块；post/index.html 新增 `#login-qr-state`（role=alert）作为失败提示归属位，替换原先对 `#bloggers-state` 的挤占。
- 群聊页行为完全保留（qr-loading 占位、失败文案进群聊状态栏 + 重试按钮）；commit 887e391。
