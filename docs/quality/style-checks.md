# Google Style 与 PMD Best Practices

在 `backend/java/` 目录运行以下命令。`.\mvnw.cmd clean test` 和 `.\mvnw.cmd clean package` 都会执行 Enforcer、Spotless、Checkstyle、PMD、SpotBugs 及测试。

本地快速自检可跳过前端构建和浏览器测试：

```powershell
.\mvnw.cmd -Pquick clean test
```

Spotless 和 Checkstyle 在 `validate` 阶段依次执行，发现违规会阻断构建。

构建时，PMD 直接生成可在浏览器打开的 `reports/pmd.xhtml`，门禁读取 `pmd.xml`。

同时生成两份报告、查看全部违规：

```powershell
.\mvnw.cmd -Pquick checkstyle:checkstyle pmd:pmd
```

此命令只生成报告，不作门禁。报告位于 `target/quick/checkstyle-result.xml`、`target/quick/reports/checkstyle.html`、`target/quick/pmd.xml` 和 `target/quick/reports/pmd.xhtml`。单独执行 PMD 门禁可运行 `.\mvnw.cmd pmd:check`。PMD 已绑定默认生命周期，无需 profile。PMD 类型解析使用编译类路径及已有的编译产物。完整编译和测试需先处理 Checkstyle 违规。

## 构建约束

构建通过 Maven Wrapper 固定 Maven 3.9.9。`maven-enforcer-plugin` 在 `validate` 阶段要求 JDK 21+、Maven 3.9+，并检查依赖版本收敛、插件版本显式和重复类。

## ArchUnit

Java 分层依赖检查随 Maven 测试运行，包含 `quick` 模式。规则会拦截控制器直接依赖 Repository、微博 API 适配层反向依赖 Service 等跨层依赖。控制器、Service 和微博 API 适配层可以使用 `xyz.fz.weibo.exception` 中的共用异常，该包不依赖其他受检层。

在 `backend/java/` 单独运行架构测试：

```powershell
.\mvnw.cmd -Pquick -Dtest=ArchitectureTest test
```

## Spotless

Spotless 格式化生产和测试 Java 源码。google-java-format 的 AOSP 模式使用 4 空格基础缩进和 8 空格续行缩进，按 100 字符的行宽排版。静态导入和普通导入各自按字母排序，静态导入在前，两组之间空一行。

先应用格式，再运行构建前置检查：

```powershell
.\mvnw.cmd spotless:apply validate
```

Checkstyle 仍会检查测试方法命名、注释和格式化后仍超长的行。修正这些违规后，可再次运行上述命令。

## Checkstyle

`config/checkstyle-google.xml` 基于 Checkstyle 14.4.0 官方 Google 配置，基础缩进 4 空格、续行缩进 8 空格。移除全部 Javadoc 约束和注释排版检查，不要求添加文档注释；同时通过 `IllegalTokenText` 禁止任何形式的后端注释（Javadoc、行注释、块注释）。`@Test` 等测试方法和 `@BeforeEach`/`@AfterEach`/`@BeforeAll`/`@AfterAll` 生命周期方法强制 snake_case，测试辅助方法保持 camelCase。

该配置是项目适配版，并非原样的 Google Java Style。所有构建统一使用此配置，违规级别设置为 error，确保检查实际阻断构建。

Swagger 的 `@Parameter` 禁止设置 `description`。请求参数的用法说明写在 `raws/` 下对应的 HTTP 示例中。

## PMD

使用 Maven PMD 插件 3.28.0（内置 PMD 7.17.0），引用官方分类 `category/java/bestpractices.xml`，仅排除 `UnitTestContainsTooManyAsserts`，允许同一测试验证多个结果，不启用其他分类。源码按 Java 21 解析。

`config/pmd.xml` 配置断言识别参数，识别 MockMvc 的 `andExpect`、`andExpectAll` 和 Mockito 验证方法。需要使用 Spring `HttpHeaders` 的具体声明通过局部 `@SuppressWarnings("PMD.LooseCoupling")` 处理，不设置全局类型例外。

WebSocket 的接收缓冲区需要跨分片保存数据，字段局部抑制 `AvoidStringBufferField`；完整消息无论解析成功或失败，都会在 `finally` 中更换缓冲区，让旧数组可以回收。

`LoginApi.qrLogin` 中供截图请求读取的登录状态赋值，以及浏览器测试启动方法中的回环地址，使用方法级、指定规则的抑制。注释已被 Checkstyle 禁止，空 catch 必须包含语句（例如 `return;`），不能靠注释内容通过 `EmptyCatchBlock`。

完整分类包含测试断言、异常处理、资源管理、字符集、未使用代码等检查。扫描告警需要结合框架和业务语义复核。

参考：[Google Java Style](https://google.github.io/styleguide/javaguide.html)、[Checkstyle 14.4.0 Google 配置](https://github.com/checkstyle/checkstyle/blob/checkstyle-14.4.0/src/main/resources/google_checks.xml)、[PMD 7.17.0 Best Practices](https://docs.pmd-code.org/pmd-doc-7.17.0/pmd_rules_java_bestpractices.html)。
