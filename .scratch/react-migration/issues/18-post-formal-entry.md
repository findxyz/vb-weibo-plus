# 18：React post 正式入口切换与旧实现清理

**What to build:** 让 React 接管 `/post/index.html`，结束 post preview，清理 post 专属原生实现，保留旧 chat 与可回退产物。

**Blocked by:** 17，已完成。

**Status:** resolved

日期：2026-10-17。用户在任务 17 完成后授权继续；本票不迁移 chat 业务，不替换运行中的用户 JAR。

## 方案与边界

1. Vite 的 post HTML 移至 frontend/post/index.html，开发与生产均使用 /post/index.html；标题恢复“本地微博”，删除预览提示及自指向的旧版链接。旧 /preview/post/index.html 不再提供页面，不新增永久别名；chat preview 和正式旧 chat 保持现状。原生 chat 的切页按钮自然进入新的正式 post。
2. PostPreview 更名为 PostPage，post 专属 SVG 移到 frontend；共享 linkify.js／date.js 继续保持单一来源，因为旧 chat 仍消费这些工具。删除 static/post 的旧 HTML、JS、CSS 与素材，不新增后端、依赖、路由库或配置开关。
3. 迁移期间的旧／新实时几何对照改为固定的已批准旧版测量 fixture，不保留可执行旧 post。保留 React 行为和几何断言；旧 DOM 专属 Java 测试由现有 React 构建资源行为测试接管，正式类名改为 PostPageTest。将旧 37 项的行为覆盖映射记录在本票，避免靠删除测试隐藏行为遗漏。
4. 干净 Maven 构建只在 target 生成产物。同 JAR 保留 React 正式 post、旧正式 chat 和 chat preview；验证入口、MIME、刷新、两页互跳、全部业务行为及移除资源的 404。更新 README、路线图和回退说明。

## 成功标准

- [x] 先复现正式入口／标题未切换，再验证开发与构建资源中的正式入口、刷新、纸感及键盘导航；post preview 不再提供页面。
- [x] 所有旧 post 专属运行时代码与源码依赖移除，旧 chat、共享工具和 React 既有行为／几何检查通过；旧测试行为覆盖有映射。
- [x] 完整前端回归、类型／构建、干净 Maven verify、隔离最终 JAR 与模块 MIME／移除资源检查通过，独立 Standards／Spec 审查完成。
- [x] 发布包、哈希、切换前旧 JAR／提交和具体回退方法已记录，地图与开发文档同步；不部署或停止用户后端，不触发真实扫码／业务写。

## 验证隔离与回退基线

浏览器可见行为及 classpath／JAR 静态资源是已在 PRD 约定的验收边界。沿用真实浏览器、本地 HTTP 替身、隔离 SQLite、缺失 Credential 与空采集群号。所有 QR／添加／采集 POST 在本地拦截，不执行真实写操作。旧 JAR 为 target/react-migration-release/ticket-17/weibo-plus.jar，源码基线为 2cc6ef8；本票不更改数据库或后端配置格式。停止新版并以同一配置启动保存的旧 JAR 即可回退；配置与数据库应沿用部署前备份，不将回退解释为删除用户数据。

## 旧 Java 测试的行为覆盖映射

切换前 PostPageTest 的 37 项只在旧 HTML／DOM 上运行，本票由原 ReactPreviewPageTest 更名后的 PostPageTest 验证正式构建资源；完整 React 浏览器套件改为访问正式路径。迁移前对照全部通过后，将 15 组几何存为固定 fixture，未使用切换后的 React 输出重录。以下覆盖不是以测试数量等价替代，而是按用户行为逐组对应。

| 旧测试组与数量 | 正式 React 回归 |
| --- | --- |
| 默认全部／最新日期、读取边界、日期切换、博主切换、名称过滤、返回全部、月折叠、年分组，8 项 | default_reading、date_navigation、blogger_selection、blogger_name_filter 与 classpath_post 的日期／范围检查 |
| 长正文滚动与内容宽度，2 项 | long_feed_scrolls、minimum_desktop、post_visual_alignment、完整卡片几何与三尺寸 acceptance_combined |
| 加载失败后保留博主并重试，1 项 | list_retry_only、empty_scope_and_calendar_failure、旧响应隔离 |
| 失效登录与 QR 失败后恢复按钮，2 项 | post_login 的状态／失败／超时／重试与 classpath_post 的 401／QR 检查 |
| 头像大小、换行、行内表情、纯转发隐藏外层头像，4 项 | 头像／认证几何、rich_text、emoji、pure_retweet 与 classpath_post 的正文／头像检查 |
| 多图／转发查看、无灰底、加载前占位、键盘、普通／转发缩略图，7 项 | image_layout 固定旧版测量、post_images_use_thumbnail、single_post_image、image_viewer 全套、classpath_post 图片／查看器与最小桌面比例 |
| 视频播放按钮居中及转发视频，2 项 | video_layout 固定旧版测量、视频跳转／去重、失败占位与 classpath_post 视频检查 |
| 切换到 chat，1 项 | acceptance_chat_control 的鼠标／Enter／Space；正式 classpath 检查增加旧 chat → React post 返回 |
| 搜索默认日期、请求参数、摘要高亮、定位、无结果、上限、长列表、Escape、遮罩不关闭，9 项 | advanced_search、search_location 全套，含范围／上海边界、安全摘要／上限／长结果／取消，以及 classpath_post 搜索与定位 |
| 历史采集失败通报，1 项 | sync_history 的错误／401／超时／定时清理与 classpath_post 的历史采集 |

旧版 DOM 标识和全局变量断言随旧实现退休；保留实际的参数、可见行为、布局与交互断言。任务 17 的 124 项完整通过记录和旧 Java 文件同时保存在仓库外证据目录，便于审查覆盖。

## 审查修正

首次 Standards 为 0 项。Spec 指出两项 P3：遗漏正式页 favicon，旧测试映射缺少滚动高度稳定和搜索遮罩不关闭断言。已补齐两项断言；图标复用 shared static 中的唯一 SVG 来源，由 React 的 link 元数据标签放入 head，并经 Vite 输出为构建资源，避免新增副本或依赖开发后端的图标请求。开发与 classpath 检查实际解码图标。

首次 Maven 全量 411 项中 410 项通过，新增旧 chat 返回测试过早在 HTML 标题出现后按 Enter，模块尚未初始化；等待页面加载及实际空群列表后再交互，定向测试通过。未改旧 chat 运行时代码。最初完整前端测试的热更新用例仍替换旧预览标题，123 项通过、该用例失败；修正过期测试后完整 124 项通过。失败日志保留，最终验证另行记录。

## Answer

2026-10-17，正式入口切换完成。实施 45b0e55，审查修正 a79b064，内容高度回归 48f9154。React 正式页为 /post/index.html，post preview 和旧 post 专属 HTML／JS／CSS 已移除，旧 chat 与 chat preview 保留。共享日期、链接工具和 favicon 维持单一来源，post 专属 logo 已归 frontend。

- 正式入口在开发环境先复现 404，再修正；17 项入口／原版几何／代理检查通过。原始 15 项实时旧版对照全部通过后冻结测量，不维护第二份可执行旧 post。
- 图标修正后完整 124 项 Chrome 回归一次通过；内容高度复核进一步使用旧测试的 24 条长微博，滚至底部并验证 scrollHeight 漂移不超过 1px，定向通过。头像 18px 行高与行内表情 1.3em 尺寸也明确补入行为覆盖。类型检查和生产构建通过。本次未出现已留档的 worker 原生退出，独立问题继续保留，不认定已修复。
- 最终 mvn clean verify：411 项，失败、错误、跳过均为 0。包含旧 chat 的 82 项及正式 React PostPageTest 的 18 项；Java 总数变化来自退休 37 项旧 DOM 测试并新增 1 项正式入口／移除资源检查，原 React 17 项已接管正式路径，行为覆盖见上表。
- 最终 JAR 使用临时 SQLite、本机图片上游、缺失 Credential、空采集群号。3 个保留入口、10 条直接资源及浏览器实际加载的生产模块／图标 MIME 通过；JAR 清单确认无旧 post 专属文件与 preview。三个尺寸 900×560、1280×800、1600×900 的真实读取／搜索定位／查看器、替身 QR／添加／采集、阅读保持、正式页往返与刷新通过；9 条退休 URL 全为 404。
- 每个尺寸的 3 次业务 POST 全部本地拦截，临时数据库最终仍为种子的 3 位博主、5 条博文；无用户数据库写入或真实扫码／采集。正式 JAR 冒烟最初同样过早操作旧 chat，保留日志后改为等待可见的空群列表，重跑通过；无应用代码改动或自动重试。测试进程树与图片上游已关闭。
- JAR 证据 C:/Users/fixyz/AppData/Local/Temp/react-post-cutover-jar-a1oh6ewq，含三尺寸媒体／完成截图、acceptance.json 和上游图片记录；900 媒体截图人工检查通过。测试头像为空时按既有规则回退文字，真实头像代理由原行为检查覆盖。
- 仓库外证据目录 C:/Users/fixyz/.codex/visualizations/2026/10/11/01a12b52-9038-7f91-870b-e108c8ddf003，保留 react-post-cutover-final-frontend.log、final-verify.log、jar-smoke.log、scroll-height.log、coverage.log、红／绿与失败日志、冒烟脚本及 release-hashes.json。失败日志包括 frontend-stale-title.log、verify-chat-fixture-failure.log、jar-smoke-chat-readiness.log。
- 新包 target/react-migration-release/ticket-18/weibo-plus.jar 与 weibo-plus.7z 已保存，SHA-256 与验收产物一致，7z 完整性通过。切换前 ticket-17 JAR 的哈希与旧 post／chat／preview 资源已复核，记录于 react-post-cutover-rollback.json。README 已写明开发入口、干净构建和回退方法；没有替换用户运行服务或修改后端／数据库格式。

### Standards

2cc6ef8...45b0e55 独立审查为 0 项硬规范违例、0 项需处理的 smell；45b0e55...a79b064 复核无新增问题。

### Spec

首次两项 P3 已解决。复核要求进一步保留内容总高度断言，48f9154 补齐后复核通过，无剩余发现。

post 的 01 至 18 主票全部完成；下一阶段为 chat 业务迁移，尚未发布新实施票。
