# POM 安全公告与升级路线补充调查

调查日期：2026-11-17。范围为 POM 中固定的 Playwright、Node、npm、springdoc，以及 Spring Boot 支持周期和 SQLite 原生库；完整 Maven 传递依赖扫描另由主审计记录。本文未修改 POM，也未执行升级后的兼容性测试。

## 结论

| 项目 | 当前版本 | 已核实的问题或状态 | 建议版本 |
| --- | --- | --- | --- |
| Spring Boot | 3.5.16 | 3.5.x 的 OSS 支持于 2026-06 结束；长期停留会遇到仅企业渠道提供的安全修复 | 长期迁移至 4.1.2，结合 Spring Framework、Hibernate、Jackson 等大版本做兼容验证 |
| Playwright Java | 1.49.0 | 上游驱动使用 Node 22.11.0，默认 Chromium 为 131.0.6778.33；此外存在 macOS 浏览器安装脚本证书校验漏洞 | 1.65.0；先验证 Windows 驱动裁剪和浏览器安装 |
| 前端构建 Node | 24.15.0 | 已落后于 2026-11 的官方安全版；该 Node 用于构建，并非 Java 服务端运行时 | 24.22.3 |
| npm | 11.14.1 | 针对 npm 包本身的 OSV 查询没有匹配，不能据此排除其内部依赖问题 | 若升级，优先同主版本 11.21.2；无需仅为追新跨至 12.2.2 |
| springdoc | 2.8.17 | 本次未确证该版本自身的可利用漏洞；存在兼容 Boot 3.5 的更新版本 | Boot 3.5 配 2.10.0；Boot 4.1 配 3.2.0 |
| sqlite-jdbc | 3.49.1.0 | 底层 SQLite 低于 CVE-2025-6965 修复版本；Java 坐标扫描可能漏掉原生库漏洞 | 最低 3.50.2.0，当前可选 3.54.1.0 |

表中的“建议版本”为查询日可获取的版本，不是对这些版本不存在其他漏洞的保证。Maven 元数据中的 Boot 最新值为 4.2.0-RC2，它是候选版；最新稳定版为 4.1.2。

## Playwright 的漏洞条件与两个 Node 运行时

上游 Playwright 1.49.0 的构建脚本明确使用 `NODE_VERSION="22.11.0"`，浏览器清单明确默认 Chromium 为 131.0.6778.33。这说明仅修改 POM 的 `frontend.node.version` 无法更新 Playwright 驱动携带的 Node，也无法更新其默认下载的浏览器。[构建脚本](https://raw.githubusercontent.com/microsoft/playwright/v1.49.0/utils/build/build-playwright-driver.sh)、[浏览器清单](https://raw.githubusercontent.com/microsoft/playwright/v1.49.0/packages/playwright-core/browsers.json)。实际启动浏览器仍取决于应用的 channel 或 executablePath 配置，不应把清单等同于每次运行的实测浏览器版本。

CVE-2025-59288／GHSA-7mvr-c777-76hp 指向 macOS 的 Chrome、Edge 重装脚本使用 `curl -k`，攻击者在安装时实施中间人攻击可以替换安装文件。OSV 的 npm `playwright@1.49.0` 查询返回该公告，结构化修复下限为 1.55.1；公告正文还引用 1.56.0。[公告](https://github.com/advisories/GHSA-7mvr-c777-76hp)、[Microsoft 修复提交](https://github.com/microsoft/playwright/commit/72c62d840247d9defd87c6beb0344d456794b570)。

直接核对 Microsoft 的 [1.49.0 脚本](https://raw.githubusercontent.com/microsoft/playwright/v1.49.0/packages/playwright-core/bin/reinstall_chrome_stable_mac.sh) 与 [1.56.0 脚本](https://raw.githubusercontent.com/microsoft/playwright/v1.56.0/packages/playwright-core/bin/reinstall_chrome_stable_mac.sh)，能够确认 `-k` 已被移除。该条件不等同于 Windows 默认 Chromium 安装存在同样漏洞。项目打包目前只保留 Windows 驱动，不能把此 CVE 直接报告为 Windows 生产环境已可利用。

OSV 针对 Maven `com.microsoft.playwright:playwright@1.49.0` 查询为空，而 npm 坐标有结果，说明只扫 Maven 坐标会漏掉驱动内部的 JavaScript 和原生组件。当前 [Maven 官方仓库元数据](https://repo.maven.apache.org/maven2/com/microsoft/playwright/playwright/maven-metadata.xml)提供 1.65.0。升级后需要验证二维码登录、持久化浏览器状态、下载行为，以及 `trim-playwright-driver` 生成的 Windows JAR。

## Node 与 npm

[Node 官方发布索引](https://nodejs.org/dist/index.json)将 24.22.3 标记为安全发布；[24.22.3 发布说明](https://nodejs.org/en/blog/release/v24.22.3)与 [2026-11 安全公告](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases)列出 HTTP/2、TLS、代理凭证和权限模型等修复。POM 的 Node 24.15.0 低于此版本。这里建议直接使用当前安全补丁版，而不是声称公告中每个 CVE 都能通过本项目的前端构建触发；多个问题需要 Node 作为服务器或启用特定功能。

[npm 官方 registry](https://registry.npmjs.org/npm)提供 11.21.2 和 12.2.2。OSV 对 `npm@11.14.1` 的查询为空，仅表示该坐标未匹配，并非完整审计 npm 自带依赖，也不是 `frontend/package-lock.json` 的审计结果。应在选定 Node、npm 后执行 `npm ci`、构建和锁文件依赖审计，评估实际构建链风险。

## Spring Boot 支持周期与 springdoc 配套版本

[Spring Boot 官方项目数据](https://spring.io/page-data/projects/spring-boot/page-data.json)中的 `support.generations` 给出以下周期：

| 分支 | OSS 支持结束 | 企业支持结束 |
| --- | --- | --- |
| 3.5.x | 2026-06 | 2032-06 |
| 4.0.x | 2026-12 | 2027-12 |
| 4.1.x | 2027-07 | 2028-07 |

因此，4.0.x 可作为迁移中间步骤，但从调查日看，它的 OSS 支持即将结束；长期升级目标优先考虑 4.1.x。[Boot Maven 元数据](https://repo.maven.apache.org/maven2/org/springframework/boot/spring-boot-starter-parent/maven-metadata.xml)列出的稳定版本包括 3.5.16、4.0.9、4.1.2，而 4.2.0-RC2 不应作为常规安全补丁方案。

[springdoc v2 官方兼容矩阵](https://springdoc.org/v2/)明确 Boot 3.5.x 对应 springdoc 2.8.x 至 2.10.x；[当前官方矩阵](https://springdoc.org/)明确 Boot 4.1.x 对应 springdoc 3.1.x 至 3.2.x。因此不应单独把当前 Boot 3.5 项目的 springdoc 升至 3.x。

springdoc 2.8.17 的[发布 POM](https://repo.maven.apache.org/maven2/org/springdoc/springdoc-openapi/2.8.17/springdoc-openapi-2.8.17.pom)声明 Swagger UI 5.32.2；[2.10.0 的 POM](https://repo.maven.apache.org/maven2/org/springdoc/springdoc-openapi/2.10.0/springdoc-openapi-2.10.0.pom)和 [3.2.0 的 POM](https://repo.maven.apache.org/maven2/org/springdoc/springdoc-openapi/3.2.0/springdoc-openapi-3.2.0.pom)声明 5.34.0。没有确认适用公告前，不把版本更新本身写成已证实安全修复。升级验证应覆盖 `/v3/api-docs` 和 Swagger UI。

## SQLite 原生库补充

[CVE-2025-6965 的 Google CNA 记录](https://cveawg.mitre.org/api/cve/CVE-2025-6965)明确 SQLite 低于 3.50.2 时，查询中的聚合项数量超过可用列数可能造成内存破坏；建议 3.50.2 及以上。SQLite 的 [3.50.2 官方发行说明](https://sqlite.org/releaselog/3_50_2.html)包含提前拒绝过量聚合项的对应修复。

当前 sqlite-jdbc 3.49.1.0 包含的 SQLite 版本落在范围内，最低可选修复 JDBC 版本为 3.50.2.0；[Xerial 发布元数据](https://repo.maven.apache.org/maven2/org/xerial/sqlite-jdbc/maven-metadata.xml)当前提供 3.54.1.0。代码存在固定 SQL 的参数化仓储查询，本次未证明外部输入可以控制完整 SQL 并触发该漏洞。升级仍应覆盖已有数据库打开、分页查询、日期查询、写入和 Hibernate community dialect 的兼容性。

## 调查局限

- 只查询和阅读公开公告、发布元数据及上游代码，没有进行漏洞利用验证。
- GitHub REST 公告接口受到匿名速率限制，改用 OSV 数据、上游仓库原始文件和官方发布站核对。
- 未将 npm 包名公告直接等同为 Maven Java 包可利用；也未把版本陈旧等同于所有公告条件均成立。
- 工具链插件依赖、前端锁文件和原生可执行文件仍需单独扫描；本报告不能替代完整 SBOM 审计。
