# 30：chat 群聊分析

**What to build:** 从编辑器工具行打开独立的「群聊分析」窗口：选择日期与提示词发起流式分析，实时渲染 Markdown 结果；同时可浏览历史分析列表、查看详情、复制提示词与下载 Markdown。

**Blocked by:** 29，已完成。

**Status:** resolved

日期：2026-10-18。用户要求继续。

## 实施边界

- 工具行增加「🤖 群聊分析」按钮（无群禁用），与聊天记录按钮一起靠右。
- 窗口标题为「群聊分析 - 群名」；打开时日期默认上海时区今天，提示词默认「请总结今天群聊的主要讨论话题和参与者」，并加载第 1 页历史列表（`size=20`）。
- 历史列表行显示日期、提示词摘要、条数与分析时间；分页显示「第 x / y 页，共 n 条」，边界按钮禁用；空列表提示「暂无历史分析记录。」。
- 点击历史行加载详情（`GET /chat/analyses/{id}`）：显示分析日期、条数、时间、提示词（可复制）与 Markdown 正文；「⬇️ 下载 Markdown」按旧页文件名与头部格式导出。
- 提交分析走 `POST /chat/analyses/stream`（表单 `gid`、`date`、`prompt`），解析 SSE 的 `delta`／`done`／`error`：分析中按钮禁用显示「分析中…」，正文随 delta 节流渲染，完成后展示元信息与下载；错误显示「分析失败：…」。
- Markdown 使用 `marked` + `DOMPurify` 惰性加载与净化后渲染；返回列表、关闭窗口或切群会中止流与迟到响应。
- 窗口只读本地历史，不改变当前会话的滚动与轮询。

## 验收标准

- [x] 按钮打开窗口，默认日期／提示词正确，历史列表与分页加载正确。
- [x] 历史行打开详情，元信息、Markdown 与复制提示词、下载可用。
- [x] 提交后按钮禁用、delta 实时渲染、done 后展示元信息与下载，请求参数正确。
- [x] 流错误显示「分析失败：…」并恢复按钮；空列表与失败文案正确。
- [x] 返回列表、关闭与切群会中止流且迟到响应不更新界面。
- [x] 旧正式 chat 与 React post 回归、构建资源检查保持通过。

## 验证方法

- 先红后绿：先用现有实现的断言复现「没有分析入口」。
- 扩展 frontend/tests/chat.spec.ts：本地替身支持历史列表、详情与 SSE（delta／done／error）；断言默认值、列表、详情、流式内容、错误与下载。
- 运行 `npm run typecheck`、`npm test`、`mvn "-Dtest=PostPageTest,GroupChatPageTest" test "-Dskip.npm=true" "-Dskip.installnodenpm=true"`，使用本轮构建的生成资源。
- 证据写回本票并同步 [阶段计划](../PLAN.md)。

## 范围外

重新分析历史项、流式重试、导出其他格式、提示词模板管理、并发多分析。

## 实施与验证证据

日期：2026-10-18。

### 用户反馈修正（2026-10-18）

- 详情页的长提示词会把整行与弹窗横向撑开，「提示词：」标签被挤成两行，并出现横向滚动条。
- 修正：标签改 `flex: none; white-space: nowrap`；提示词值 `min-width: 0` 并以省略号截断；提示词行与详情网格补 `min-width: 0` / `minmax(0, 1fr)`；正文增加 `overflow-wrap: break-word`，长链接不再撑宽。
- 用例：用长提示词与长引用断言元信息、正文、详情与弹窗均无横向溢出，标签保持单行。
- 修正后前端 179 项与 Java 100 项通过。

### 实现

- `AnalysisDialog.tsx` 独立窗口：日期默认上海今天、提示词默认「请总结今天群聊的主要讨论话题和参与者」；打开时加载第 1 页历史（`size=20`），列表行显示日期、提示词摘要、条数与时间，分页边界禁用，空列表提示「暂无历史分析记录。」。
- 详情调用 `GET /chat/analyses/{id}`，展示日期／条数／时间／提示词（复制按钮）与 Markdown 正文；下载按旧页头部与文件名导出 Markdown。
- 提交走 `POST /chat/analyses/stream`（表单 `gid`、`date`、`prompt`），解析 SSE 的 `delta`／`done`／`error`：`delta` 250ms 节流渲染，`done` 后展示元信息并启用下载，`error` 显示「分析失败：…」；按钮在分析中禁用。
- Markdown 使用 `marked` + `DOMPurify` 动态 `import()`，首次打开才加载，净化后再 `dangerouslySetInnerHTML`；加载失败回退纯文本且可下次重试。
- 版本号与 `AbortController` 隔离迟到响应；返回列表、关闭与切群都会中止流。
- `Composer.tsx` 增加「🤖 群聊分析」按钮，`ChatPage.tsx` 持有窗口开关并在切群时关闭；Vite 代理补上 `/chat/analyses`、`/chat/analyses/stream` 与 `/chat/analyses/{id}`；新增 `marked` 依赖。

### 红绿

- 临时撤下分析实现后运行五项新用例：默认值与历史、详情与 Markdown、流式完成、流错误、分页与空列表全部失败（5 failed）；恢复后通过。

### 验证

- 前端：`npm run typecheck` 通过；`npm run build` 通过；`npx playwright test` 179 项通过，其中 `chat.spec.ts` 56 项、post 既有 123 项。
- Java：`mvn "-Dtest=PostPageTest,GroupChatPageTest" test "-Dskip.npm=true" "-Dskip.installnodenpm=true"` 100 项通过（GroupChatPageTest 82、PostPageTest 18），使用本轮构建的生成资源。
- 覆盖：默认日期与提示词、历史参数与分页、详情元信息与 Markdown 渲染、下载与复制入口、SSE 参数与流式内容、done 后的元信息、流错误文案、空列表与分页边界。
- 首次 Java 全量运行出现一次与本票无关的旧版「新消息按钮」用例偶发失败，单独与复跑均通过。
- `.gitignore` 将 `.weibo_cookie.txt*` 一并忽略，避免登录凭证备份误入版本库。

## 交付与下一步

形成可回退增量。完成后更新阶段计划的当前任务表、阶段 4 状态与本票记录；下一票建议为回归庆祝与沉浸阅读。
