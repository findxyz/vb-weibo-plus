# 05 — 取消群视频 HTTP Range

**What to build:** 不实施群视频 HTTP Range；保留完整视频的流式响应，并移除会误导调用方的范围能力声明和测试示例。

**Blocked by:** 04 — 通过本地代理打开群视频。

**Status:** wontfix

- [x] 用户侧 HTTP Range 行为未保留在当前实现中。
- [x] 视频响应不返回 `Accept-Ranges`，避免声明未支持的能力。
- [x] `API.http` 不包含 HTTP Range 测试示例，完整视频请求示例保持可用。
- [x] 完整视频继续以 `200 OK` 流式返回，既有图片媒体行为保持不变。

## Comments

- 2026-07-23：用户测试后明确要求删除 HTTP Range 功能，因此该工单不再实施，并以 `wontfix` 记录决策。
