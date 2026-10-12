# 02：前端生成资源参与 Maven 测试与 JAR 打包

**What to build:** 开发者从干净工作目录执行 Maven 构建后，前端预览与原正式页面都进入同一个可执行 JAR。使用者只启动该 JAR 就能打开预览、读取本地博主并继续访问原页面，无需 Vite 或 Node.js 运行时。

**Blocked by:** 01，React 开发预览与真实博主查询。

**Status:** resolved

## 实施边界

由 Maven 准备固定版本的 Node.js 与 npm，执行锁文件安装和前端构建。
前端构建发生在 `generate-resources`，生成资源在 `process-resources` 纳入 classpath，先于 Java UI 测试读取资源。
生成的 HTML、JS、CSS 和素材进入 static 资源，二进制与打包文件保持生成文件属性，前端产物不写回源码目录。
现有资源与生成资源使用独立路径，原正式页面保持可用。前端资源复制关闭内容过滤。
保留现有 Spring Boot 可执行 JAR 和 7z 发布步骤，完整构建不静默跳过前端。
必要时调整现有测试服务的静态资源 MIME 处理，不改变现有接口替身与行为断言。

## Acceptance criteria

- [x] 从没有前端构建产物的干净状态执行 Maven 构建，能够自动安装依赖并构建预览，无需预先手动运行 Vite 构建。
- [x] 前端产物在需要 classpath 静态资源的 UI 测试之前生成并被收集，测试服务可加载两条预览入口及其资源。
- [x] 生成资源中的 JS、CSS、图片等具有浏览器可用的 MIME；原正式入口、脚本和素材保持可用。
- [x] 类型检查或前端构建失败时 Maven 构建失败，不生成被误认为成功的新发布产物。
- [x] 原两页 UI 定向回归通过，新预览在打包资源路径上的博主读取检查通过。
- [x] 独立启动构建后的 JAR，能够访问预览与原页面；预览经同源相对地址读取博主，无需额外前端进程。
- [x] 现有 7z 发布包包含更新后的可执行 JAR 和启动脚本；源码目录没有生成资源污染。

## 验证方法

运行干净构建，检查生成资源、classpath 与 JAR 内容。
复用本地 HTTP 测试替身验证页面及资源加载，运行相关 Java UI 测试。
在临时目录直接覆盖最终 SQLite URL，使用隔离数据库、不存在的 Credential 文件与空自动采集群号启动新 JAR，检查两条预览入口、两条正式入口、引用资源和博主查询。
现有配置不能完全关闭后台调度；缺少 Credential 时在请求构造阶段拒绝外部采集请求。不要声称关闭了全部调度，也不要为了冒烟新增生产配置开关。
记录实际构建、测试、资源响应与生产冒烟结果，不以 JAR 文件存在代替页面可用验证。

## 范围外

post 阅读业务、chat 业务、正式入口切换、后台服务行为调整、生产账号写入操作。

## 验收证据

日期：2026-10-12。实施分支：`codex/react-build`。实施使用 TDD，先增加 `ReactPreviewPageTest`，在 Maven 尚未生成资源时，classpath 预览找不到博主列表而失败；接入构建后同一检查通过。

- `frontend-maven-plugin` 固定为 2.0.2，在 `generate-resources` 顺序安装 Node.js 24.15.0、npm 11.14.1，执行锁文件安装和带类型检查的构建。首次自动下载工具链成功。`process-resources` 保留原 46 项资源，并将 7 项生成资源不经过滤复制到 classpath 的 static 目录。
- `mvn clean package -Dtest=PostPageTest,GroupChatPageTest,ReactPreviewPageTest` 通过：GroupChatPageTest 82 项、PostPageTest 37 项、新预览 1 项，共 120 项，零失败、错误或跳过。Java 测试使用既有 Chromium 缓存，设置 `PLAYWRIGHT_BROWSERS_PATH` 与 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`；未修改原两页的测试断言或浏览器启动方式。
- 临时在 TypeScript 文件追加字符串赋值给 number 的类型错误，再运行 `mvn clean package -DskipTests`，得到 TS2322、Maven 退出码 1，JAR 与 7z 均不存在。`finally` 还原源码后执行上述成功构建。没有提交错误探针。
- 检查可执行 JAR 的 `BOOT-INF/classes/static`，包含两条正式入口、两条预览入口和 hash assets；7 项生成资源字节与 Vite 原始输出全部一致。当前前端没有生成图片素材，因此新测试只需 HTML、JS、CSS MIME；生产冒烟另验证原 SVG favicon。
- 在唯一临时工作目录启动新 JAR，绑定 `127.0.0.1:13727`，直接覆盖最终 SQLite URL 与 `weibo.database-path`，Credential 文件不存在，自动采集群号为空。启动日志明确记录群列表同步因未登录失败，未声称关闭全部后台调度。直接向隔离 SQLite 插入一名测试博主，没有调用任何新增博主、采集、扫码或发送接口。
- 两条预览、两条正式入口均返回 200。根据 HTML 发现资源并检查，连同 favicon 共 14 条 URL 状态与 MIME 正确。真实 Chrome 加载两条 React 预览，没有控制台或运行异常，post 预览通过同源 `/post/bloggers` 显示隔离博主，无 Vite 进程参与。冒烟后停止测试 JAR。
- `7z t target/weibo-plus.7z` 通过；发布包仅含 `run.bat` 与本次可执行 JAR，解包 JAR 的 SHA-256 与构建产物一致。构建与依赖位于忽略目录，Git 没有源码生成资源污染。

后续复验可沿用 README 的隔离启动参数，先使用空数据库检查 `/post/bloggers`，需要非空 fixture 时直接对该临时 SQLite 插入数据。生产冒烟始终使用临时工作目录和不存在的 Credential，不使用 `run.bat` 的默认生产群号。

## 交付与下一步

构建集成、资源测试和运行说明构成一个可回退增量。
完成后更新 [阶段计划](../PLAN.md) 并报告，由用户决定是否开始任务 03。
共同约束见 [总纲](../PRD.md)。
