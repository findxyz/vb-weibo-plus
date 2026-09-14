# 16 — 批次三：架构演进

设计依据：`.scratch/frontend-review/2026-09-14-design.md` 批次三（含 3.1-3.5 全部细节与取舍）。3.4 SSE 推送按设计跨端立项，不在本工单。

**What to build:** 消息数据上限、轮询退避、分析渲染节流、五项收尾清单。SSE（3.4）另立工单。

**Blocked by:** 15（退避与 SSE 回落共用 refresh 布尔语义；announcer 已就位）。

**Status:** resolved

- [x] sessions.js：MAX_MESSAGES=20000/TRIM_TO=18000，appendNewer 末尾裁最旧，同步清 heightByMid/平移窗口，裁剪后关 beforeCursor
- [x] chat.js：setInterval 改 setTimeout 退避链 3s×2^n 封顶 30s，成功归零；refresh/refreshGroups 返回布尔；401 后暂停业务轮询，onRelogin 复位
- [x] analysis.js：流式渲染 rAF 改 250ms setTimeout 尾帧节流，cancelOperation 同步清理
- [x] 删除孤儿 static/video-player.html
- [x] shared/storage-keys.js 集中五个 key，四处接入
- [x] celebration.js 尊重 prefers-reduced-motion：命中跳过表演（通报已就位）
- [x] post.css 同值字体令牌补注释；chat.css qr-loading 去 !important 改 :not([hidden]) 写法
- [x] 2 万条注入内存稳定；离线退避曲线正确；长文渲染无长任务

## Comments

- 提交 5e95fac。全量 mvn test 通过。退避语义：pollTick 单链（polling 守卫 + 单一定时器），事件触发打断等待立即执行；initializing/authExpired/hidden 期间空转不积失败。
- 「2 万条注入」「退避曲线」「长文渲染」三项为设计验收观察项，逻辑已就位，实际曲线待用户日常使用观察；SSE 立项见设计文档 3.4 两阶段方案。
