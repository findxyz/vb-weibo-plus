# 05：React post 转发作者与正文阅读

**What to build:** 在 post 预览中阅读转发微博的原作者与正文。普通转发保留外层评论，纯转发直接阅读原文，正文继续使用既有富文本清洗和安全降级。

**Blocked by:** 04，博主与日期浏览导航，已完成。

**Status:** resolved

日期：2026-10-14。

## 范围与旧行为依据

复用 `/post/list` 已返回的 `retweeted` 字段，不新增请求、后端接口或数据库字段。`RetweetView` 的 `screenName` 与 `content` 是本票需要的原作者和原文；缺失或为 null 的 `retweeted` 表示没有转发块。

旧 `posts.js` 的 `createPostCard` 保留外层作者与时间，只在外层 `content` 非空时显示外层正文，再追加 `createRetweetBlock`。沿用该阅读顺序，不把原文作为另一条列表记录，不改变列表总数或卡片数量。
转发作者使用 React 文本节点显示 `@名称`，名称缺失或为空时显示 `@未知用户`，不解释 HTML，不新增作者链接或原文时间。
外层正文为空时省略空正文容器，保留转发者元信息和原文。原文为空或 null 时保留作者与转发区域，不编造「原帖已删除」等后端未提供的状态；没有转发字段的普通博文保持既有呈现。
头像及纯转发的头像布局将在头像迁移票中处理，本票不提前实现媒体相关的纯转发分类与去重规则。

内外正文复用同一清洗与文本变换逻辑，分别呈现并分别安全降级。保留换行、已有链接、裸 URL、尾随标点与 `@名称:`；清洗失败时直接显示 React 文本节点，避免再次解释 HTML。
转发区域使用 DESIGN.md 的纸感便签样式，采用 paper-tint、虚线描边、既有圆角与间距，原文使用 17px／1.55，不混用 chat 令牌。

## Acceptance criteria

- [x] 内容完整：普通转发显示外层评论、原作者与原文；纯转发无空外层正文；缺失作者、空原文和无转发字段符合旧语义；卡片数量、总数和当前日期保持不变。
- [x] 安全一致：内外正文保留换行和安全链接，原作者按文本显示；转发中的脚本、危险链接、事件属性不可执行；清洗失败时原文安全降级，不影响卡片与导航。
- [x] 两种运行路径通过：纸感样式和独立滚动保持；开发浏览器与构建资源覆盖转发路径；旧 post／chat、普通正文及博主／日期导航保持通过，独立 JAR 能阅读真实接口返回的转发内容。

## 实施与验证

沿用真实浏览器 UI 与本地 HTTP fixture 边界做 TDD。先完成普通转发与纯转发，再覆盖缺失信息、恶意内容与清洗失败。主要修改 PostFeed.tsx、queries.ts、post.css、frontend/tests/preview.spec.ts 和 ReactPreviewPageTest.java。允许既有正文组件接受展示样式参数，不新增清洗器、路由、状态库或第三方依赖。

frontend 中运行 npm ci、npm test、npm run typecheck 和 npm run build；已有 Chrome 时在 PowerShell 设置 `$env:PREVIEW_BROWSER_CHANNEL='chrome'`。
仓库根目录运行 `mvn -Dtest=PostPageTest,GroupChatPageTest,ReactPreviewPageTest package`，在构建资源上检查转发路径及原两页回归。
独立 JAR 冒烟使用临时 SQLite、不可用 Credential、空自动采集群号和 localhost，直接插入转发 fixture，经真实只读接口验证原作者、正文和安全呈现。未关闭所有后台调度，不调用采集、添加博主、登录或发送接口。
检查真实浏览器截图与运行错误，记录实际结果；目标 JAR 被运行中应用占用时使用独立 worktree，不停止用户服务，不预先重复全部后台测试。

## 范围外与交付

图片、视频、查看器、媒体去重、头像与认证、转发互动操作、原作者跳转、来源／地区／互动计数、搜索、管理、采集、扫码、自动刷新、共享工具搬迁及正式入口切换。
实现后保存提交与验收证据，更新 [演进地图](../PLAN.md)，由用户决定后续票。本票完成后仍处于阶段 2，post preview 继续保留。

共同约束：[PRD.md](../PRD.md)。旧行为：[posts.js](../../../src/main/resources/static/post/posts.js)。接口类型：[RetweetView.java](../../../src/main/java/xyz/fz/weibo/domain/RetweetView.java)。设计：[DESIGN.md](../../../docs/design/DESIGN.md)。

## 实施与验收证据

日期：2026-10-14。实施提交：2a9abfd，验证提交：e850a42。

- 普通转发先因缺少原文区域而失败，接入既有正文组件后通过；纯转发先因空外层正文容器未省略而失败，修正后通过。未新增依赖、查询接口或清洗器。
- 前端最终 29 项真实 Chrome 检查通过，新增普通／纯转发、缺失作者与空原文、恶意原文及作者文本、安全降级；原 25 项默认阅读、导航、取消与热更新检查保持通过。选择性故障注入曾被 DOMPurify 内部吞掉，已改为在浏览器 DOMParser 不可用时验证内外正文的文本降级，不依赖清洗器内部调用次数。
- npm ci、npm run typecheck、npm run build 通过。Maven 定向 package 通过：旧 post 37 项、chat 82 项、React 构建资源 3 项，共 122 项，零失败、错误或跳过。
- 查看真实浏览器截图，转发便签保留 paper-tint、虚线边框、8px 圆角及 17px／1.55 原文。作者使用文本节点，原文沿用同一链接与清洗逻辑；卡片数量与后端 total 不变。
- 独立 JAR 在临时 SQLite 中直接插入含 retweeted_json 的普通／纯转发 fixture，使用不可用 Credential、空采集群号和 localhost。真实 API、浏览器验证外层评论、原作者、原文、安全链接、恶意内容移除、纯转发省略空正文及博主／日期导航。4 个新旧 HTML 入口、14 条资源 MIME 检查通过，未出现浏览器错误或业务写请求；测试 Java 进程树已停止。
- 对固定差异 983b467 到 e850a42 进行 code-review，Standards 0 项，Spec 0 项。没有为本票重复上一批全部后台检查。
- 仓库外脚本为研究笔记目录的 react-retweet-jar-smoke.py 与 react-retweet-jar-smoke.mjs，构建日志为 react-retweet-package.log，冒烟证据保留在 C:/Users/fixyz/AppData/Local/Temp/react-retweet-jar-bizcfskd。生成文件不进入 Git。

本票完成后仍处于阶段 2，尚未切换正式入口。转发图片／视频、查看器和其他完整卡片能力继续由后续票迁移。