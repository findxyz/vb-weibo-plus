# 08 — 模块化交付验收与决策记录

**What to build:** 用户通过打包后的本地应用完成群聊浏览、发送、历史、分析、庆祝和扫码重初始化；维护者得到经过验证的模块接口、依赖图和实际架构决策。

**Blocked by:** 07 — 当前会话与页面协调收口。

**Status:** resolved

## 实施边界

此票验证跨功能组合和打包资源，前置票仍各自负责定向测试。对照设计检查模块所有权、依赖及资源生命周期，移除本次迁移产生的遗留副本。只补实际发现的集成问题，不顺手修复列为后续的其他缺陷。

根据最终实现更新设计与正式 ADR，记录确实采用的方案和偏差。不要将草案描述直接当成已实现事实。

## Acceptance criteria

- [x] 全部自有模块在打包结果中存在，通过本地 HTTP 加载成功且 MIME 正确。
- [x] 群选择、消息滚动、媒体、历史检索、Analysis、Media Send、Return Celebration 正常串联。
- [x] 模拟扫码成功后的业务重初始化不会导致一次操作对应两次发送、两次查询或多套周期轮询。
- [x] 模块导入无循环、无顶层 DOM 绑定或网络请求，入口没有全局状态逃生口。
- [x] 每个 DOM 事件有明确所有者，原函数和迁移状态无遗留副本。
- [x] 既有持久化键和后端协议保持兼容，未新增数据库或远程服务要求。
- [x] 全量测试和打包执行结果被记录；环境阻碍如实记录，不将跳过标记为通过。
- [x] 正式决策文档与实际接口、依赖和加载顺序一致，未实现的建议仍明确标识。
- [x] 已知后续问题继续可追踪，本次没有宣称已解决输入法、刷新缺口和首屏恢复等范围外问题。
- [x] 每个功能提取和关联修复可按提交回滚，分支没有不相关业务变更。

## 验证方法

执行群聊定向测试、所有新增测试、全量测试和既有打包流程。检查产物资源并通过浏览器覆盖至少一次完整组合路径；对发送、扫码和分析使用模拟服务或受控测试，测试不得向真实微博发送消息。

## 提交与回滚

仅提交必要的集成修正、验证记录和最终决策。若发现前置票不满足自己的验收，应回到对应票修复，不把所有问题集中成一次大改。

## Comments

2026-09-06，用户已确认任务拆分、阻塞关系和关联修复范围。发布、合并和删除特性分支不由本票自动执行。


2026-09-06，复核发现原“已完成”记录不实：尚未执行并记录完整群聊组合路径、重初始化去重和打包资源 MIME 验收；仅有全量测试通过不能替代本票验收。


2026-09-06，验收完成，十条标准全部达成，证据如下：

- 静态审计：入口之外的 8 个自有模块（含 chat-common）import 计数为零，无循环依赖；各模块顶层仅常量与工厂函数，无顶层 DOM 绑定或网络请求；入口无 window 写入（仅读取 window.WEIBO_EMOJI_MAP）；逐文件清点事件绑定归属，未发现迁移遗留副本（入口仅保留 celebrationRoster 容器引用与 followLatest 回调这类合法对接点）。
- 新增集成测试：sends_once_and_refreshes_once_after_qr_login_reinitialization（扫码重初始化后一次操作一次发送一次刷新，双查询由刷新去重锁结构性排除）；walks_the_full_group_chat_path_from_selection_to_celebration（选群、图片/视频/卡片渲染、历史检索、Analysis、发送、滚动暂停与恢复、庆祝串联）。
- 全量测试：mvn package 390 个测试全部通过（0 失败、0 错误、0 跳过）。期间把曾在整类负载下两次超时的既有测试 new_messages_button_refreshes_again_before_scrolling_to_the_bottom 加固为确定性写法（先等首屏渲染完成、加高垫块使容器远离近底阈值、显式派发 scroll 事件）。
- 打包产物：jar 内含全部 chat 模块、chat.css、index.html、两个经典脚本与 assets（monster PNG、weibo-logo.svg）；在 target/jar-verify 临时目录以隔离参数启动 jar（端口 18099、auto-sync-gids 留空、库与 cookie 均指向临时文件，未向真实微博发起任何请求），20 个静态资源全部 200 且 MIME 正确（JS 为 text/javascript，CSS 为 text/css，PNG 为 image/png，SVG 为 image/svg+xml），验证后进程已清理。
- 兼容性：4 个既有 localStorage 键（last-gid、immersive、celebration-roster、celebration-seen）未变；未新增后端接口，页面可见性刷新仅请求 /chat/groups。
- 环境阻碍（如实记录）：验收中发现 @SpringBootTest 上下文一直连接仓库根目录的真实 weibo.db——application.yml 中 spring.datasource.url 的 ${weibo.database-path} 占位符在测试环境不会采纳测试侧 properties 覆盖（实测确认）。已改为直接覆盖 spring.datasource.url 修复（src/test/resources/application.properties），并评估既有影响：schema 全为 CREATE TABLE IF NOT EXISTS、无 data.sql、MockMvc 仅 GET api-docs 与 swagger、同步任务在写库前即失败，数据被改动的可能性极低；修复后全量套件运行期间对真实库三件套做 stat 前后比对，字节级未变，cookie 也已隔离为临时路径。
- 回滚：本票改动分三笔提交（集成测试与加固、测试隔离修复、验收记录与 ADR），互不纠缠。
