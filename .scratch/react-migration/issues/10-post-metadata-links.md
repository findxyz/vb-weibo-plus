# 10：React post 卡片元信息与跳转

**What to build:** 补齐博文的来源、地区、原文链接与头像主页跳转，保持旧卡片阅读结构。

**Blocked by:** 09，已完成。

**Status:** resolved

日期：2026-10-15。用户确认继续，开始本票。

## 范围与依据

读取已有 PostView.source／region／postUrl 和 Blogger.uid，不新增接口、数据库字段或依赖。依据旧 posts.js 的 createPostHeader／createPostActions／createAvatar、post.css 与 DESIGN.md。

保留作者、认证和时间，按旧顺序追加地区与来源。字段按 React 文本节点显示，缺少或为空时不展示相应字段与分隔符；非空地区前缀为“ · ”，来源前缀为“ · 来自 ”，不解释字段中的 HTML。沿用 12px 元信息字体及纸感颜色，地区采用 tabular-nums，长来源保持省略行为。

卡片尾部右对齐“查看原文”，原文来自接口 postUrl，只接受可解析的 HTTP／HTTPS；缺失、空或非法地址不生成操作行，不推测原文地址。链接默认无下划线，悬停为直线下划线，新窗口打开并使用 noopener；当前页面、日期和阅读位置不变。普通与纯转发都保留对应外层微博的原文入口。

普通卡片的头像在 UID 为有效正安全整数时，新窗口打开 https://weibo.com/u/{uid}，保留无图片／图片失败的名称首字占位及明确的链接名称。无有效 UID 时维持装饰头像，纯转发沿用无头像布局。侧栏头像仍作为博主选择按钮的一部分，不新增嵌套链接；作者名与转发原作者不新增跳转。

## Acceptance criteria

- [x] 普通／纯转发元信息与原文入口正确，空值不留下分隔符，HTML 按文字显示；字号、颜色、顺序及完整卡片几何与旧版同数据对照通过。
- [x] 原文链接和头像主页的鼠标／键盘跳转及 noopener 隔离通过；无效 URL／UID 不产生危险链接；默认与悬停样式、焦点环、阅读位置和导航状态保持。
- [x] 头像占位、认证、正文安全、图片查看器、视频、日期选择等原有检查通过，不增加业务请求、轮询或写接口。
- [x] 前端全套、类型／双入口构建、Maven 资源检查及独立 JAR 验证通过；审查、地图、提交与发布证据完整。

## 实施与验证

使用既有浏览器 UI／HTTP fixture 边界，先接元信息，再接两种跳转及异常字段。正常／纯转发完整卡片以相同数据和旧页对照；外部主页与原文页由浏览器 HTTP 拦截替身响应，避免实际访问微博。

独立 worktree 构建，定向执行 ReactPreviewPageTest。独立 JAR 使用隔离 SQLite、缺失 Credential、空采集群号及本机媒体上游，覆盖真实接口字段和跳转，不调用业务写接口。旧页与后端不修改，正式入口不切换。

## 范围外

点赞／评论／转发等互动操作、转发原作者跳转、博主名称过滤、搜索、博主管理、采集／登录、正式入口切换和共享素材整理。

## 实施与验收证据

日期：2026-10-15。元信息实施 d91614c，跳转与卡片对齐 aa31ed5，打包资源验证 a71eb15。

- 元信息先因缺少地区节点失败，接入字段、纯文本与纸感样式后通过；跳转先因头像链接缺失失败，接入原文操作行与头像可选链接后通过。字段只来自既有接口，没有新增依赖、后端接口或业务写请求。
- 来源与地区按作者／时间／地区／来源顺序显示；空值省略对应节点和分隔符，HTML 字符串保持文字。地区与来源为 12px，地区采用等宽数字。长来源测试发现标题区域的 Grid 最小宽度会撑开卡片，在标题设置 min-width: 0 后，省略与卡片约束通过。
- 1280×900、1600×900 的普通／纯转发完整卡片与旧版同数据对照通过，包含元信息、操作行和完整卡片位置／尺寸、字体、颜色。Chrome 对非默认字体变体返回空 font 简写，因此使用字体子属性对照，等宽数字另行检查；未弱化布局断言。截图已人工查看。
- 原文只接受可解析的 HTTP／HTTPS；缺失、空、脚本、数据、本地文件、相对和格式错误地址不生成操作行。头像主页仅接受正安全整数 UID，未知博主及无效 UID 保留装饰占位。链接保留图片失败占位与认证，侧栏选择按钮内不嵌套链接，作者文字不新增跳转。
- 真实浏览器验证鼠标／Enter 新窗口跳转、noopener、默认无下划线／悬停直线、头像无下划线、焦点环、长正文滚动位置及博主／日期选择保持；普通与纯转发原文来自外层 postUrl。外部页面全部由 HTTP 拦截替身响应。
- npm ci、最终完整 64 项 Chrome 检查、类型检查及双入口构建通过；图片查看器、视频、正文安全、导航取消及热更新原检查保持通过。
- Maven 定向执行 ReactPreviewPageTest package，7 项构建资源检查通过，无失败、错误或跳过，JAR 与 7z 打包成功。本票未修改后端或旧页面，未重复全量后台及旧页测试。
- 独立 JAR 使用隔离 SQLite、缺失 Credential、空采集群号与 loopback 媒体服务；真实 API／浏览器检查来源／地区、头像主页、普通／纯转发外层原文及 noopener，图片查看器与视频共存通过。4 个新旧入口和 14 条资源 MIME 检查通过，上游共 19 次媒体读取，无业务写请求或非预期浏览器错误。测试进程树及本机服务由 finally 关闭。
- JAR 证据保留于 C:/Users/fixyz/AppData/Local/Temp/react-metadata-jar-762xhxfi。仓库外研究笔记目录保存 react-metadata-frontend.log、react-metadata-package.log、react-metadata-jar-smoke.log、react-metadata-jar-smoke.py／.mjs、react-metadata-release-hashes.json 及 react-metadata-1280.png／legacy-metadata-1280.png。
- 发布包保存于主工作目录 target/react-migration-release/ticket-10，JAR／7z 与验收产物 SHA-256 一致，7z 完整性检查通过。

### Standards

固定审查 ae0b278 到 a71eb15。0 项硬规范违例，0 项需处理的 smell。改动限于展示与跳转，测试命名及纸感令牌符合规范。

### Spec

同一固定范围独立审查，0 项发现。元信息、地址校验、外层原文、侧栏边界及阅读状态符合 ticket，无后端改动或范围扩张。

仍处于阶段 2，下一候选为博主名称过滤，任务 11 尚未发布。正式入口与运行中的后端保持现状；worktree 归档若返回 queued，仅表示请求排队。

集成提交 c8e4787。合入后在主工作目录的 Vite 服务再次验证普通／纯转发元信息、主页／原文键盘跳转及新窗隔离；所有业务读取均由浏览器本机替身拦截，未读取用户媒体。集成日志与截图为仓库外 react-metadata-integrated-smoke.log、react-metadata-integrated.png。

## 头像加载修正

2026-10-16，用户反馈真实头像仍显示名称首字，独立修复提交 37645e0。

- 原测试只用可成功直连的图片替身，未覆盖真实 CDN 拒绝浏览器直连。使用接口返回的真实头像复现：地址仍在有效期内，CDN 返回 403 HTML，Chrome 报 ERR_BLOCKED_BY_ORB，组件因此显示首字。默认策略、no-referrer 以及去掉查询参数均无法解决；同一地址经既有 /chat/image 代理得到 200 image/jpeg。
- 修正仅将 BloggerAvatar 的图片地址改为既有同源代理，URLSearchParams 完整编码原地址及查询参数；Vite 精确代理 /chat/image，避免拦截相似路径。没有新增后端接口或修改旧页面，主页链接、认证、lazy／async、安全校验及失败占位保留。
- 先将直连头像替身改为 403，浏览器测试因图片缺失失败；接入同源代理后通过。64 项前端回归、类型检查和双入口构建通过，包含侧栏／卡片头像、代理失败占位、查询参数编码及开发代理路径隔离。
- Maven 定向 ReactPreviewPageTest package 通过，8 项构建资源检查无失败、错误或跳过；新增检查在直连被拒时，侧栏／卡片仍使用同源代理显示头像，主页链接与按钮结构保持。
- 原复现脚本在修正后的 Vite 中得到 PASS，真实图片经同源代理返回 200 image/jpeg，侧栏和卡片均已人工查看。独立 JAR 使用隔离 SQLite、缺失 Credential 和空采集群号，取当前接口的头像地址作为测试输入，真实 CDN 头像代理加载与 4 个新旧入口通过；浏览器无直连 CDN 或写请求。测试进程树在 finally 关闭，用户数据库未改动，证据保留于 C:/Users/fixyz/AppData/Local/Temp/react-avatar-jar-96e_e5b6。
- 仓库外保存 react-avatar-frontend.log、react-avatar-package.log、react-avatar-real-smoke.log、react-avatar-real.png、react-avatar-jar-smoke.py／.mjs／.log 及 react-avatar-release-hashes.json。日志只记录状态、类型和尺寸，不输出头像签名查询串。
- Standards 与 Spec 分别审查 c6ee12d 到 37645e0，各 0 项问题。修正产物保存于主工作目录 target/react-migration-release/ticket-10-avatar-fix，JAR／7z 哈希与验收产物一致，7z 完整性检查通过。
