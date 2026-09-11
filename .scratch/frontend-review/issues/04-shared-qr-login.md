# 04 — shared：QR 扫码登录组件化，两页接入

**What to build:** 把群聊页与 post 页各自复制的二维码登录轮询逻辑抽成 shared 组件（拉起二维码、10s 轮询刷新、停止清理、防重入），两页以元素句柄接入。以群聊页版本为基准，post 页顺带补齐防重入与加载占位，失败文案不再挤占博主列表状态栏。

**Blocked by:** 03（shared 目录与 fetchJson 已就位）。

**Status:** ready-for-agent

- [ ] shared 提供 QR 登录控制器：start（防重入 + 首次延迟拉取 + 轮询）与 stop（清定时器、复位 UI）
- [ ] 群聊页接入后行为不变（含 qr-loading 占位与「扫码登录失败」反馈）
- [ ] post 页接入后获得防重入与按钮 loading 态，失败提示有归属位置
- [ ] 两页页内 QR 轮询副本删除

## Comments
