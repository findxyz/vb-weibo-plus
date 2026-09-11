# 12 — 性能：消息滚动 rAF 合帧与分析弹窗懒加载 markdown 库

**What to build:** 消息区 scroll 处理器用 requestAnimationFrame 合帧，一帧内只执行一次跟随判定、窗口滑动与更早消息加载，消除滚动路径上的逐元素同步布局测量；marked 与 DOMPurify（60KB）改为群聊分析弹窗首次打开时动态加载，首页不再预载。行为与加载失败降级保持。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] scroll 处理器 rAF 合帧，一帧至多一次测量与滑动
- [ ] 未渲染 markdown 库时打开分析弹窗自动加载，加载完成前提交有可感知的等待态或队列
- [ ] 首页网络面板不再出现 marked/dompurify 请求（打开分析后才出现）
- [ ] 大群滚动流畅度不劣于改动前（对比滚动掉帧）

## Comments
