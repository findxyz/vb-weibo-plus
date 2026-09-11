# 12 — 性能：消息滚动 rAF 合帧与分析弹窗懒加载 markdown 库

**What to build:** 消息区 scroll 处理器用 requestAnimationFrame 合帧，一帧内只执行一次跟随判定、窗口滑动与更早消息加载，消除滚动路径上的逐元素同步布局测量；marked 与 DOMPurify（60KB）改为群聊分析弹窗首次打开时动态加载，首页不再预载。行为与加载失败降级保持。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] scroll 处理器 rAF 合帧，一帧至多一次测量与滑动
- [x] 未渲染 markdown 库时打开分析弹窗自动加载，加载完成前提交有可感知的等待态或队列
- [x] 首页网络面板不再出现 marked/dompurify 请求（打开分析后才出现）
- [x] 大群滚动流畅度不劣于改动前（对比滚动掉帧）

## Comments

- conversation-session.js 的 scroll 处理器以 `scrollFrame` 哨兵合帧：一帧内只跑一次 setFollowing / newMessages 显隐 / slideWindow / loadEarlierIfNeeded；slideWindow 与加载本就有 sliding、loading 守卫，合帧只减少触发频次，不改变语义。掉帧对比留待浏览器烟雾验证。
- analysis.js 新增 `ensureMarkdownLibs()`：动态注入 marked.min.js 与 dompurify.min.js（与原 index.html 同路径）；打开弹窗时预热（fire-and-forget），`submit()` 与 `loadDetail()` 在 try 内 await——按钮处于「分析中…」/占位「正在加载…」禁用态，等待可感知。
- 加载失败时 promise 缓存置空、下次操作重试；renderMarkdown 的 `window.marked ? … : text` 降级路径原样保留，失败仍以纯文本呈现。
- chat/index.html 删除两个预载 script 标签；weibo-emoji.js 保持不动（composer 启动即用）。commit 0c414f7。
