# 01 — P0 热修：高度缓存泄漏、void(0) 链接与重复写标题

**What to build:** 修复评审确认的三个正确性/资源问题，并清理一批一行级冗余。完成后：长时间切换群聊不再累积内存；转发微博图片格子在浏览器右键可正常打开原图；聊天记录弹窗标题只由聊天记录模块自己维护。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] 会话模块切换群聊时清空消息高度缓存（open 流程中与 messages 清理同处）
- [x] post 页转发图片格子不再使用 javascript:void(0)，href 指向原图或缩略图地址
- [x] 聊天记录弹窗标题只在 history 模块的 setGroup 中设置，chat 页引导代码不再双写
- [x] chat 页 onInitialMessages/onEarlierMessages/onNewMessages 三个相同回调合并为一个具名函数
- [x] 删除会话工厂内冗余 "use strict"；沉浸开关的 localStorage 判断只读一次
- [x] 主群头像 replaceWith 后直接持有新元素引用，不再重查 DOM

## Comments

- 已完成：conversation-session 的 open 中补 heightByMid.clear()；post 转发格子 href 改原图；chat 页去掉 historyTitle 双写（含 elements 表项）；三个回调合并为 seedCelebrationAndAttitudes；use strict/沉浸开关/头像引用清理。node --check 通过。
