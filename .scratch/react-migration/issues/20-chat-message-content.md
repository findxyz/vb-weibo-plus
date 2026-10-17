# 20：chat 消息正文、链接、表情与附件内容

**What to build:** 消息正文按旧页语义渲染：URL 链接化（尾随标点剥离、新窗口无 opener）、已知表情短语换成共享贴图、文件消息显示下载链接、微博分享显示作者／摘要／原文链接；所有内容保持文本渲染，不解释 HTML。

**Blocked by:** 19，已完成。

**Status:** resolved

日期：2026-10-17。用户要求继续下一票。本票只做消息内容渲染，视频播放与图片查看器另立一票。

## 实施边界

### 正文与链接

- URL 识别与尾随标点剥离复用 `static/shared/linkify.js` 的 `URL_TEXT_RE` 与 `stripUrlTrailing`，不另写一份。
- 链接在新窗口打开，`rel="noopener noreferrer"`，文字就是地址本身；被剥掉的标点留在正文里。
- 正文保留换行；不解释 HTML，任何标签按字面显示。

### 表情

- `[短语]` 用 `static/chat/weibo-emoji.js` 的 `WEIBO_EMOJI_MAP` 换成贴图，`alt` 保留原文；`[/xxx.png]` 走 `https://img.t.sinajs.cn/t4/appstyle/expression/emimage` 基址；表里没有的短语保留原文。
- 贴图沿用旧页 1.3em 尺寸与 -0.25em 垂直对齐，懒加载。

### 文件与微博卡

- `fileUrl` 非空时渲染下载链接，`download` 用消息文本，文字为消息文本或「下载文件」；不再重复显示正文气泡。
- `mediaType === 14` 且第一个 urlObject 带 `status` 时渲染分享卡：作者、去标签后最多 100 字加省略号的摘要、原文链接；链接必须是 `http(s)`，否则省略。
- 卡片与文件都沿用气泡容器，只加对应修饰类。

## 验收标准

- [x] URL 渲染为链接：新窗口、`noopener noreferrer`、文字为地址；末尾中文句号、英文句号与括号按旧规则留在正文。
- [x] `[doge]` 等已知表情显示贴图（`alt` 为原文），未知短语保持文字，正文前后文字不受影响；`[/xxx.png]` 走 emimage 基址。
- [x] 文件消息显示可下载链接，`download` 为消息文本，正文不重复显示。
- [x] 微博分享卡显示作者、去标签后最多 100 字加省略号的摘要、原文链接；非 `http(s)` 链接不渲染。
- [x] 正文中的 `<script>`、`<img onerror>` 只作为文字出现，不执行、不产生页面错误。
- [x] 表情贴图只请求真实贴图地址，不产生业务写请求；窗口、滚动与锚点用例保持通过。
- [x] 旧正式 chat 与 React post 回归保持通过，构建资源中的 chat 预览可加载。

## 验证方法

- 先红后绿：先用现有实现的断言复现「URL 是纯文本、表情是原文、文件没有下载链接、分享卡是纯文本」。
- 扩展 frontend/tests/chat.spec.ts：拦截贴图域名，断言链接属性、表情 `src`／`alt`、文件 `download`、卡片摘要与安全链接、恶意文本不执行。
- 运行 `npm run typecheck`、`npm test`、`mvn "-Dtest=PostPageTest,GroupChatPageTest" test "-Dskip.npm=true" "-Dskip.installnodenpm=true"`，使用本轮构建的生成资源。
- 证据写回本票并同步 [阶段计划](../PLAN.md)。

## 范围外

视频播放与封面点击、图片查看器、表态、发送、轮询、历史、分析、回归庆祝、扫码登录、Markdown／@／话题高亮、长会话内存裁剪。

## 实施与验证证据

日期：2026-10-17。

### 实现

- `MessageText.tsx` 复用 `shared/linkify.js` 的 `URL_TEXT_RE` 与 `stripUrlTrailing`，先切链接段，再在其余文本段里替换表情短语；`emoji.ts` 直接引入 `static/chat/weibo-emoji.js` 的 `WEIBO_EMOJI_MAP`，并保留 `[/xxx.png]` 的 emimage 基址；`WeiboCard.tsx` 渲染作者、去标签并截断 100 字的摘要与安全原文链接；`MessageItem.tsx` 按「文件 → 微博卡 → 正文」分支，系统消息也走正文渲染。
- `chat.css` 增加 `--link`、气泡内 `.emoji`、`.file-download` 与 `.weibo-card*` 样式，尺寸与旧页一致；消息正文链接沿用旧页的默认链接样式，没有新增令牌。

### 红绿

- 临时撤下内容渲染后运行三项新用例：链接／表情与文件／卡片两项失败（2 failed），恢复后通过。恶意文本用例在纯文本渲染下本就通过，作为回归保护保留，不宣称为新增能力。
- 文件消息不再重复显示正文气泡；微博卡在缺少 `status` 时退回正文；非 `http(s)` 的原文链接不渲染。

### 验证

- 前端：`npm run typecheck` 通过；`npm run build` 通过；`npx playwright test` 138 项通过，其中 `chat.spec.ts` 15 项、post 既有 123 项。
- Java：`mvn "-Dtest=PostPageTest,GroupChatPageTest" test "-Dskip.npm=true" "-Dskip.installnodenpm=true"` 100 项通过（GroupChatPageTest 82、PostPageTest 18），使用本轮构建的生成资源。
- 构建产物：chat 入口包含贴图映射（48.59 kB），CSS 7.08 kB；`target/generated-resources` 已复制到 `target/classes/static`，未替换运行中的 JAR。
- 覆盖：URL 尾随标点、新窗口与 `noopener noreferrer`、已知／未知表情与 emimage 基址、文件 `download`、卡片作者与 100 字摘要、非法链接省略、恶意标签只作文本。

## 交付与下一步

形成可回退增量。完成后更新阶段计划的当前任务表、阶段 4 状态与本票记录；下一票建议为图片查看器与视频播放。
