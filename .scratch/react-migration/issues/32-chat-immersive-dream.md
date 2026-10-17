# 32：chat 沉浸阅读与盗梦空间

**What to build:** 标题栏提供沉浸阅读开关，隐藏群头与编辑器只留消息；悬停任意成员头像 3 秒，若存在该成员的梦境页则弹出「进入盗梦空间」入口，点击后在独立弹窗里游玩。

**Blocked by:** 30（31 已按用户决定移除）。

**Status:** resolved

日期：2026-10-18。用户要求继续。

## 实施边界

- 标题栏右侧新增沉浸阅读控件：切换 `.conversation.immersive`，隐藏群头与编辑器，按钮文案在「进入沉浸阅读／退出沉浸阅读」间切换，状态存入 `weibo-chat:immersive`，刷新后恢复。
- 悬停消息头像 3 秒后以 `GET /chat/dream/<uid>.html` 探测梦境页；存在才显示入口弹层，已确认的成员只探测一次；弹层在头像上方、可关闭，消息滚动时收起。
- 打开原生 dialog 显示 iframe 游戏：「进入盗梦空间」时带时间戳加载，关闭时把 iframe 置为 `about:blank` 停止游戏；标题栏关闭按钮与其它窗口一致。
- 弹窗内的头像（聊天记录、群聊分析）不触发彩蛋；不改变当前会话的滚动与轮询。
- Vite 代理补上 `/chat/dream`，资源仍由后端静态目录提供。

## 验收标准

- [ ] 沉浸开关切换后群头与编辑器隐藏、消息区独占，刷新后状态保持。
- [ ] 悬停有梦境页的成员头像 3 秒出现入口；无梦境页的成员不出现。
- [ ] 点击进入后弹窗打开、iframe 加载带时间戳的梦境页；关闭后弹窗关闭且 iframe 为 `about:blank`。
- [ ] 滚动消息收起入口；对话框内头像不触发；入口关闭按钮正常。
- [ ] 旧正式 chat 与 React post 回归、构建资源检查保持通过。

## 验证方法

- 先红后绿：先用现有实现的断言复现「没有沉浸开关、没有梦境入口」。
- 扩展 frontend/tests/chat.spec.ts：本地替身提供 `/chat/dream/101.html`，其余 404；断言开关持久化、弹层、iframe 地址与关闭清理。
- 运行 `npm run typecheck`、`npm test`、`mvn "-Dtest=PostPageTest,GroupChatPageTest" test "-Dskip.npm=true" "-Dskip.installnodenpm=true"`，使用本轮构建的生成资源。
- 证据写回本票并同步 [阶段计划](../PLAN.md)。

## 范围外

梦境页本身的游戏内容、移动端手势、悬停之外的手动入口、彩蛋音效。

## 实施与验证证据

日期：2026-10-18。

### 用户反馈修正（2026-10-18）

- 盗梦空间入口弹层缺标题与询问文案：补回「盗梦空间」标题与「是否进入盗梦空间？」说明，弹层宽度对齐旧页 300px。
- 消息头像丢失微博主页跳转：改回 `<a href="https://weibo.com/u/<uid>">`（新窗口、`noopener noreferrer`、`aria-label="查看…的微博主页"`），保留 `data-sender-id` 供悬停彩蛋；群头像与其它头像仍为纯展示。
- 用例补充弹层标题／文案与头像链接断言；原正文链接断言限定在 `.bubble` 内，避免与头像链接冲突。修正后前端 185 项与 Java 96 项通过。

### 实现

- `ChatPage.tsx`：标题栏加 `.window-control.immersive` 开关（`aria-pressed`、文案切换、`weibo-chat:immersive` 持久化），`.conversation.immersive` 隐藏群头与编辑器。
- `DreamLauncher.tsx`：文档级 `pointerover`／`pointerout` 监听，头像悬停 3 秒探测 `/chat/dream/<uid>.html`（确认后缓存），入口弹层固定在头像上方，滚动或关闭时收起；点击后原生 dialog 以带时间戳的 iframe 打开，关闭时置 `about:blank`；`dialog[open]` 内的头像忽略。
- `Avatar.tsx` 支持 `data-sender-id`（消息头像带成员 id），`MessageItem.tsx` 传入；CSS 补标题栏控件、沉浸布局与梦境弹层／弹窗，关闭按钮复用统一风格；Vite 代理补上 `/chat/dream`。

### 红绿

- 临时撤下实现后运行两项功能用例：沉浸开关、梦境入口全部失败（2 failed）；恢复后通过。无梦境页的成员不出现入口由反向用例覆盖。

### 验证

- 前端：`npm run typecheck` 通过；`npm run build` 通过；`npx playwright test` 184 项通过（chat 61、post 123）。
- Java：`mvn "-Dtest=PostPageTest,GroupChatPageTest" test "-Dskip.npm=true" "-Dskip.installnodenpm=true"` 96 项通过（GroupChatPageTest 78、PostPageTest 18）。
- 真实预览：`/chat/dream/1176117365.html` 经 Vite 代理返回 200（928482 字节）。
- 环境说明：本轮验证期间 `frontend/node_modules` 因被占用出现半删，已停掉预览进程后 `npm ci` 重装并重新启动预览，以上结果均为重装后的完整运行。

## 交付与下一步

形成可回退增量。完成后更新阶段计划的当前任务表、阶段 4 状态与本票记录；下一票建议为 chat 整页验收与正式入口切换。
