# POM 安全审计与升级建议

审计日期：2026-11-17。以下记录升级前的审计结果；后续修复进展见“第一阶段修复记录”。

## 结论

当前不是“只升级 Spring Boot 就够了”：Boot 3.5.16 已是 3.5 分支末版，3.5 的开源支持已于 2026-06 结束。建议先在现有架构上修补独立组件，再单独迁移到 Boot 4.1.2。不要选择 Maven 元数据中的 RC、alpha 或 beta 作为生产升级目标。

实际依赖树共解析 111 个 Maven 制品，OSV 匹配 9 个制品、25 条不同公告。另有 SQLite 原生库和 Playwright 内嵌运行时风险，不能通过 Java 坐标扫描完整发现。匹配公告不等于本应用已可利用，下面按代码使用条件区分。

## 第一阶段修复记录

2026-11-17 已按小改动方案修改 POM：保留 Boot 3.5.16，应用下文列出的 HttpComponents、Jackson、Tomcat、Commons Lang、Log4j、SQLite JDBC、Playwright、springdoc 和构建 Node 版本。新版 Playwright 与 springdoc 的 jspecify 传递版本不同，额外通过 dependencyManagement 统一为 1.0.1，使现有依赖收敛门禁通过。未修改业务代码。

验证结果：

- `.\mvnw.cmd -Pquick test`：335 个后端测试全部通过，Enforcer、Checkstyle、PMD、SpotBugs 均通过。
- 新版 Node 完成前端构建，npm 安装审计返回 0 个漏洞。
- 官方安装器安装 Playwright 1.65.0 配套的 Chromium、Headless Shell、FFmpeg 和 Winldd。远程下载器较慢，改用系统工具从相同官方地址下载，再通过临时本地缓存交给官方安装器；缓存服务已停止，不进入项目配置。
- 设置仅限验证进程的 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` 后，运行 `.\mvnw.cmd verify '-Dtest=GroupChatPageTest,PostPageTest'`，5 个 UI 测试全部通过；随后默认目录打包因现有程序占用 target/weibo-plus.jar 而无法重命名。
- 未停止现有程序。用临时 POM 将打包输出隔离到 target/security-package，并复用已验证的 target/classes，执行 jar:jar、spring-boot:repackage、两个既有 antrun 打包目标，全部成功。临时 POM 已删除。
- target/security-package/weibo-plus.jar 包含两页前端资源，以及同为 1.65.0 的 playwright、driver、driver-bundle。裁剪后的 bundle 包含 Windows Node，不含 macOS 或 Linux 驱动；直接通过该可执行 JAR 加载 Playwright CLI，成功输出 Version 1.65.0。7z 分发包同时生成。
- 最终 111 个 Maven 制品重新查询 OSV，25 条公告匹配降为 2 条，仅剩 spring-webmvc 6.2.19 的 GHSA-j9f9-w8pj-32f8 与 GHSA-pc63-qcmh-9cmg。条件和长期升级方案见下文，未声称漏洞全部清零。

未进行真实账号扫码或真实媒体发送；浏览器验证使用现有本地 UI 测试。运行中的旧进程不会因 POM 修改自动升级，后续需停止旧实例并使用新构建的可执行 JAR 启动。

## IDE 告警补充核对

用户后续提供的 Mend.io 截图在 springdoc 顶层依赖标出了 4 条传递依赖公告。核对官方 CNA 记录与 Spring 公告后，确认它们均涉及当前传递引入的 Spring Framework 6.2.19，不能通过继续升级 springdoc 2.x 消除。此前“剩余 2 条”仅是 OSV 查询结果，不能作为所有漏洞库的完整计数，也不能据此将截图中另外两条判为缓存或误报。

| 公告 | 官方触发条件 | 本项目代码核对 |
| --- | --- | --- |
| CVE-2026-47884 | XsltView、特定兜底视图映射及未显式指定视图名 | 未发现 XsltView |
| CVE-2026-47890 | SSE 事件中的视图片段渲染 | 未发现 FragmentsRendering；当前发送数据事件 |
| CVE-2026-59313 | MVC 函数式 RouterFunction／ServerResponse.sse，向其他用户发送攻击者可控的非结构化文本 | 未发现该函数式 API；AnalysisController 使用注解控制器和 SseEmitter |
| CVE-2026-47887 | UrlFileNameViewController 使用末端路径匹配且没有配置前缀 | 未发现 UrlFileNameViewController |

这 4 条在依赖版本上仍然命中；基于当前代码未发现官方所述触发路径，不等于对应库已经修复。官方均列出 Framework 7.0.9 为开源修复版本、6.2.20 为仅企业支持版本。若要求消除这组依赖版本告警，应安排 Boot 4.1.2 与 springdoc 3.2.0 的兼容迁移，或使用有权获取的企业修复版。不能将 Framework 7 单独覆盖到 Boot 3.5 上，也不能通过禁用 Swagger UI 解决 Spring MVC 本身的版本告警。本轮补充只更新审计记录，没有扩大已完成的小改动修复范围。

来源：[函数式 SSE 官方公告](https://spring.io/security/cve-2026-59313)、[重定向官方公告](https://spring.io/security/cve-2026-47887)、[CVE-2026-59313 CNA 记录](https://cveawg.mitre.org/api/cve/CVE-2026-59313)、[CVE-2026-47887 CNA 记录](https://cveawg.mitre.org/api/cve/CVE-2026-47887)。另外两条官方链接见下文来源。

## 升级前的具体问题

| 组件与实际版本 | 问题与本项目相关性 | 建议目标 |
| --- | --- | --- |
| HttpClient 5.5.2 | CVE-2026-64607：classic 同步客户端处理非法或不支持的 Content-Encoding 时，连接不能正确归还。WeiboConfig 的两个客户端均使用这个模型，存在连接池耗尽风险；恶意响应是否可到达取决于远端服务或代理 | 5.6.5，公告最低修复版本为 5.6.3 |
| HttpCore 5.3.6 | CVE-2026-54399：HTTP/1.1 头数量或长度导致内存耗尽。项目的同步 HTTP 请求使用此解析层。CVE-2026-54428 则涉及 HTTP/2 HPACK，目前未找到异步 HTTP/2 使用路径 | httpcore5 与 httpcore5-h2 一起升到 5.4.4，最低修复版本为 5.4.3 |
| Jackson core/databind 2.21.4 | 11 条公告，涉及特殊类型反序列化、权限注解绕过、正向引用与解析资源消耗等；不能统称远程代码执行。当前没有发现 JsonView、JsonUnwrapped、JsonIdentityInfo、JsonTypeInfo 或默认多态配置。普通 JSON 解析仍需按各入口检查，不宣称所有条目均可利用 | 通过 Jackson BOM 整组升到 2.21.8；本次命中条目的修复版本最高需要 2.21.7 |
| Tomcat 10.1.55 | 7 条公告，涉及 DIGEST、FORM、安全约束、RewriteValve 和 HTTP/2 SNI 等。当前没有找到相应容器认证、重写或 HTTPS/HTTP2 配置，因此不把数据库中的 CRITICAL 标签直接当成本项目严重性 | 同一 10.1 分支升到 10.1.62，本次条目至少需要 10.1.59 |
| Spring MVC 6.2.19 | CVE-2026-47884 要求 XsltView 与特定视图映射；CVE-2026-47890 要求 SSE 视图片段。当前无 XsltView，AnalysisController 使用普通 SseEmitter 数据事件，未找到片段渲染。官方列出的 6.2.20 修复仅商业支持可用 | 长期随 Boot 4.1.2 升到其 BOM 管理的 Framework 7.0.10；不要仅凭版本号假设可以从 Central 获取 6.2.20 |
| Commons Lang 3.17.0 | CVE-2025-48924：ClassUtils.getClass 处理很长的输入可导致 StackOverflowError。通过 springdoc → swagger-core 进入，但最终版本由 Boot BOM 决定；未找到业务直接调用 | 3.22.0，最低修复版本为 3.18.0 |
| Log4j API 2.24.3 | CVE-2026-49844：MapMessage 的非有限浮点值 JSON 编码问题。项目使用 Logback 和 Log4j 到 SLF4J 的桥接，未找到 MapMessage JSON 用法。这不是 Log4Shell | Log4j BOM 整组升到 2.26.1；2.25 分支最低修复版本为 2.25.5 |
| sqlite-jdbc 3.49.1.0 | 内含旧 SQLite。CVE-2025-6965 影响 SQLite 3.50.2 之前的版本，特殊聚合 SQL 可导致内存破坏。没有证明攻击者能提交任意 SQL，不能直接等同于远程攻击成立 | sqlite-jdbc 3.54.1.0，最低修复版本为 3.50.2.0；验证 SQLiteDialect 与现有数据库 |
| Playwright 1.49.0 | 生产扫码登录会启动其配套 Chromium 131；驱动还包含 Node 22.11.0。两者不会因为升级 frontend.node.version 而更新。CVE-2025-59288 的具体脚本问题发生在 macOS 浏览器重装流程，不能据此声称 Windows 默认 Chromium 下载流程可被利用 | Java SDK 与 driver、driver-bundle 一起升到 1.65.0，并重新安装对应 Chromium |
| 前端构建 Node 24.15.0 | 已落后于官方 24 分支安全更新，只影响 Maven 前端构建工具链，与 Playwright 内嵌 Node 是两套运行时 | v24.22.3；npm 单独核对其公告与锁文件，不机械追最新版 |

Springdoc 2.8.17 本次未命中 Maven 公告，实际携带 Swagger UI 5.32.2。默认配置关闭文档，dev 配置开启。Boot 3.5 可使用 springdoc 2.10.0；升级它不会自动消除 Boot BOM 固定的 Commons Lang 3.17.0。Boot 4.1 需要配套 springdoc 3.2.0，不能保留 2.x。

## 升级顺序

### 第一阶段：保持 Boot 3.5，缩小现有依赖风险

优先处理 HttpComponents、Jackson、SQLite 和 Playwright，再更新 Tomcat、Commons Lang、Log4j 与构建 Node。使用 Boot 3.5.16 父 POM 支持的属性控制成组依赖，不分别给每个传递依赖写 version。

以下为建议值，不是已经应用或验证兼容的修改：

```xml
<httpclient5.version>5.6.5</httpclient5.version>
<httpcore5.version>5.4.4</httpcore5.version>
<jackson-bom.version>2.21.8</jackson-bom.version>
<tomcat.version>10.1.62</tomcat.version>
<commons-lang3.version>3.22.0</commons-lang3.version>
<log4j2.version>2.26.1</log4j2.version>
<sqlite-jdbc.version>3.54.1.0</sqlite-jdbc.version>
<playwright.version>1.65.0</playwright.version>
<springdoc.version>2.10.0</springdoc.version>
<frontend.node.version>v24.22.3</frontend.node.version>
```

本次对前 8 个受影响 Java 制品的候选版本重新查询 OSV，未返回匹配。此结果仅说明当前数据库未命中，不保证没有未知漏洞，也不代表升级兼容性已经通过测试。

Playwright 升级后执行：

```powershell
.\mvnw.cmd exec:java '-Dexec.mainClass=com.microsoft.playwright.CLI' '-Dexec.args=install chromium'
```

再检查 package 阶段的 trim-playwright-driver：产物必须保留新版 Windows 驱动所需文件，并只包含正确版本的 driver-bundle。验证扫码、二维码截图、Credential 获取以及 UI 测试；不能仅靠后端单元测试证明浏览器升级成功。

### 第二阶段：迁移到仍受支持的 Boot 4.1

目标为 Boot 4.1.2、springdoc 3.2.0。官方当前支持数据列出 Boot 4.1 的开源支持到 2027-07；4.0 到 2026-12，不适合作为长期落点。

Boot 4.1.2 BOM 管理 Framework 7.0.10、Tomcat 11.0.27、Hibernate 7.4.13.Final、HttpClient 5.6.5、HttpCore 5.4.4、Commons Lang 3.20.0、Log4j 2.25.5、SQLite JDBC 3.53.4.0。应重新评估并删除不再需要的临时覆盖，不把第一阶段的所有属性照搬过去。

这一步不是只改 parent：需要检查 Boot 4 的 starter 与测试模块变化、Jackson 3 默认集成和现有 com.fasterxml.jackson 导入及自定义 ObjectMapper、Hibernate 7 与 SQLiteDialect、Tomcat 11 的 Servlet 兼容性。Boot 4.1.2 同时管理 Jackson 2 BOM 2.21.7 与 Jackson 3 BOM 3.1.7，必须明确现有代码采用哪条兼容路径，避免混用。Java 21 可以保留。

建议每阶段分别验证：

1. dependency:tree 与 effective-pom，确认依赖组版本一致，重新扫描运行时依赖。
2. 现有后端检查命令：`.\mvnw.cmd -Pquick test`。该配置排除 UI 测试，不能替代浏览器验证。
3. `.\mvnw.cmd verify`，验证前端构建、UI 测试、可执行 JAR、Windows 驱动裁剪及 7z 分发。
4. 使用数据库副本验证启动、历史内容查询、数据库读写；人工验证扫码登录、媒体代理、发送和分析流。

## 配置与覆盖范围

ADR-0001 规定单用户本地工具、控制器无认证，但 application.yml 只配置端口，没有设置 server.address。Spring Boot 未指定地址时通常监听所有本机地址；这与“仅供本地使用”的假设存在差距。建议确认运行配置是否覆盖，并按本地用途绑定 127.0.0.1。这是配置暴露风险，不能通过 POM 升级解决，也不能声称已通过外部网络验证可达。

初次审计执行了 Maven 依赖解析、OSV 全依赖查询、候选版本查询、相关代码检索和官方资料核对，没有进行漏洞利用测试；后续构建和兼容性验证见“第一阶段修复记录”。插件版本声明已查看，但没有解析插件全部传递依赖；npm 锁文件、7z.exe、FFmpeg、实际安装的 Chromium 及分发 JRE 未做完整二进制安全扫描。Checkstyle、PMD、SpotBugs 和 Enforcer 不能替代依赖 CVE 扫描。

审计期间观察到其他工作修改构建插件配置；报告的运行时版本以本次 dependency:tree 快照为准，未覆盖那些改动。原始树与查询结果保存于 target/security-dependency-tree.txt、target/security-osv-results.json、target/security-osv-advisories.json、target/security-osv-candidates.json，target 目录会被清理且不纳入 Git。

## 来源

- [HttpClient 官方修复](https://github.com/apache/httpcomponents-client/releases/tag/rel/v5.6.3) 与 [Core 官方 HTTP/1.1 修复](https://github.com/apache/httpcomponents-core/commit/d96a00fec9b2e19f8005e35681df5f6cd6e21a9e)。
- [Tomcat 官方安全公告](https://tomcat.apache.org/security-10.html)。
- [Spring XSLT 公告](https://spring.io/security/cve-2026-47884) 与 [SSE 片段公告](https://spring.io/security/cve-2026-47890)：漏洞条件及开源／商业修复版本。
- [Jackson core 解析资源消耗公告](https://github.com/FasterXML/jackson-core/security/advisories/GHSA-7hhh-6rmp-j9qf)、[数字解析公告](https://github.com/FasterXML/jackson-core/security/advisories/GHSA-p6pp-m3f8-5c89)、[databind 正向引用公告](https://github.com/FasterXML/jackson-databind/security/advisories/GHSA-cxp5-3px4-pw24)、[多态缓存公告](https://github.com/FasterXML/jackson-databind/security/advisories/GHSA-wv8q-qhhj-9h54)。
- [Commons Lang 官方修复](https://github.com/apache/commons-lang/commit/b424803abdb2bec818e4fbcb251ce031c22aca53) 与 [Log4j 官方安全公告](https://logging.apache.org/security.html#CVE-2026-49844)。
- [SQLite CVE 的 CNA 记录](https://cveawg.mitre.org/api/cve/CVE-2025-6965) 与 [SQLite 3.50.2 官方发行说明](https://sqlite.org/releaselog/3_50_2.html)。
- [Boot 官方支持数据](https://spring.io/page-data/projects/spring-boot/page-data.json)、[Boot 4.1.2 BOM](https://repo.maven.apache.org/maven2/org/springframework/boot/spring-boot-dependencies/4.1.2/spring-boot-dependencies-4.1.2.pom)。
- Playwright、springdoc、Node 的官方依据与进一步细节见同目录 [补充调查](pom-security-advisories.md)。

## Maven 命中公告明细

下表由本次 OSV 结果整理，包含同一组件的条件性漏洞，不额外推导可利用性。

| 组件 | 公告 | 数据库标题 |
| --- | --- | --- |
| `org.apache.logging.log4j:log4j-api` | [CVE-2026-49844](https://osv.dev/vulnerability/GHSA-qv9r-c865-cp47) | Apache Log4j API: Improper encoding of non-finite floating-point values during MapMessage JSON serialization |
| `com.fasterxml.jackson.core:jackson-databind` | [CVE-2026-59889](https://osv.dev/vulnerability/GHSA-5gvw-p9qm-jgwh) | jackson-databind: @JsonView bypassed for @JsonUnwrapped container properties on deserialization |
| `com.fasterxml.jackson.core:jackson-databind` | [CVE-2026-54515](https://osv.dev/vulnerability/GHSA-5jmj-h7xm-6q6v) | jackson-databind has case-insensitive deserialization bypasses per-property @JsonIgnoreProperties |
| `com.fasterxml.jackson.core:jackson-databind` | [CVE-2026-91777](https://osv.dev/vulnerability/GHSA-cxp5-3px4-pw24) | jackson-databind quadratic forward-reference completion  |
| `com.fasterxml.jackson.core:jackson-databind` | [CVE-2026-83557](https://osv.dev/vulnerability/GHSA-gx83-3vf8-gh7j) | jackson-databind: Comparable missing from DefaultBaseTypeLimitingValidator's unsafe base types (incomplete PolymorphicTypeValidator denylist) |
| `com.fasterxml.jackson.core:jackson-databind` | [GHSA-mhm7-754m-9p8w](https://osv.dev/vulnerability/GHSA-mhm7-754m-9p8w) | jackson-databind: `@JsonView` bypass for creator properties with `@JsonTypeInfo(include=As.EXTERNAL_PROPERTY)` |
| `com.fasterxml.jackson.core:jackson-databind` | [CVE-2026-68497](https://osv.dev/vulnerability/GHSA-q4xh-88c3-wmh7) | jackson-databind: Duration XMLGregorianCalendar Unbounded Number Parse DoS |
| `com.fasterxml.jackson.core:jackson-databind` | [CVE-2026-77310](https://osv.dev/vulnerability/GHSA-vvgp-rfg2-7rr6) | jackson-databind: Incomplete fix for CVE-2026-54514: eager DNS resolution (SSRF) still present in InetAddress deserialization |
| `com.fasterxml.jackson.core:jackson-databind` | [CVE-2026-19032](https://osv.dev/vulnerability/GHSA-wjgm-6hv5-3cvf) | jackson-databind: Path Deserialization Missing Scheme Allowlist for FileSystemProvider Resolution |
| `com.fasterxml.jackson.core:jackson-databind` | [CVE-2026-91776](https://osv.dev/vulnerability/GHSA-wv8q-qhhj-9h54) | jackson-databind retains every unknown raw type ID  |
| `com.fasterxml.jackson.core:jackson-core` | [CVE-2026-89425](https://osv.dev/vulnerability/GHSA-7hhh-6rmp-j9qf) | jackson-core: UTF8DataInputJsonParser._reportInvalidToken() missing maxErrorTokenLength limit -> unbounded StringBuilder growth (DoS) |
| `com.fasterxml.jackson.core:jackson-core` | [CVE-2026-89407](https://osv.dev/vulnerability/GHSA-p6pp-m3f8-5c89) |  jackson-core: ReDoS: quadratic backtracking in NumberInput.PATTERN_FLOAT via looksLikeValidNumber() |
| `org.apache.tomcat.embed:tomcat-embed-core` | [CVE-2026-55956](https://osv.dev/vulnerability/GHSA-5v3h-fjv2-54fg) | Apache Tomcat has an Improper Authorization vulnerability |
| `org.apache.tomcat.embed:tomcat-embed-core` | [CVE-2026-65905](https://osv.dev/vulnerability/GHSA-9xv2-5v5q-p794) | Apache Tomcat's DIGEST authenticator has an Authentication Bypass by Capture-replay vulnerability |
| `org.apache.tomcat.embed:tomcat-embed-core` | [CVE-2026-65637](https://osv.dev/vulnerability/GHSA-f525-44xv-f2qj) | Apache Tomcat - HTTP/2 no-authority bypass of strict SNI validation |
| `org.apache.tomcat.embed:tomcat-embed-core` | [CVE-2026-65182](https://osv.dev/vulnerability/GHSA-gcx9-497g-6cp6) | Apache Tomcat has an Improper Access Control, Incorrect Authorization vulnerability |
| `org.apache.tomcat.embed:tomcat-embed-core` | [CVE-2026-68525](https://osv.dev/vulnerability/GHSA-h3x4-894j-xpx5) | Apache Tomcat's FORM authentication process has an Incorrect Authorization vulnerability |
| `org.apache.tomcat.embed:tomcat-embed-core` | [CVE-2026-53404](https://osv.dev/vulnerability/GHSA-h792-v28v-ppgr) | Apache Tomcat's rewrite valve has an Always-Incorrect Control Flow Implementation vulnerability |
| `org.apache.tomcat.embed:tomcat-embed-core` | [CVE-2026-55276](https://osv.dev/vulnerability/GHSA-mqg3-r7h5-24x4) | Apache Tomcat has an Always-Incorrect Control Flow Implementation vulnerability |
| `org.springframework:spring-webmvc` | [CVE-2026-47890](https://osv.dev/vulnerability/GHSA-j9f9-w8pj-32f8) | Spring Framework Server Sent Event stream corruption while rendering fragments |
| `org.springframework:spring-webmvc` | [CVE-2026-47884](https://osv.dev/vulnerability/GHSA-pc63-qcmh-9cmg) | Spring Framework Improper Path Limitation in XsltView |
| `org.apache.commons:commons-lang3` | [CVE-2025-48924](https://osv.dev/vulnerability/GHSA-j288-q9x7-2f5v) | Apache Commons Lang is vulnerable to Uncontrolled Recursion when processing long inputs |
| `org.apache.httpcomponents.client5:httpclient5` | [CVE-2026-64607](https://osv.dev/vulnerability/GHSA-hjcp-jmpx-g3qm) | Apache HttpComponents Client: Connection Leak on Content-Encoding Decode Error Leads to Pool Exhaustion DoS |
| `org.apache.httpcomponents.core5:httpcore5` | [CVE-2026-54399](https://osv.dev/vulnerability/GHSA-hf6x-8p5f-cgmf) | Apache HttpComponents Core HTTP/1 header parsing can cause memory-exhaustion denial of service |
| `org.apache.httpcomponents.core5:httpcore5-h2` | [CVE-2026-54428](https://osv.dev/vulnerability/GHSA-v3jc-474w-2wm6) | Apache HttpComponents Core: HPackDecoder Unlimited Header List Size Before SETTINGS ACK |
