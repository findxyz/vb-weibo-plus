# Google Style 与 PMD Best Practices

后端检查统一走默认 lifecycle：`mvn clean test` 和 `mvn clean package` 都会执行 enforcer、Checkstyle、PMD、SpotBugs 及测试。

本地快速自检可跳过前端构建和浏览器测试：

```bash
mvn -Pquick clean test
```

发现违规会阻断构建。Checkstyle 在 `validate` 阶段失败时，不会继续执行 PMD 和测试。

同时生成两份报告、查看全部违规：

```bash
mvn -Pquick checkstyle:checkstyle pmd:pmd
```

此命令只生成报告，不作门禁。报告位于 `target/quick/checkstyle-result.xml`、`target/quick/reports/checkstyle.html`、`target/quick/pmd.xml` 和 `target/quick/reports/pmd.html`。单独执行 PMD 门禁可运行 `mvn pmd:check`；PMD 已绑定默认 lifecycle，无需 profile。PMD 类型解析使用编译类路径及已有的编译产物；完整编译和测试需先处理 Checkstyle 违规。

## 构建约束

构建通过 Maven Wrapper 固定 Maven 3.9.9。`maven-enforcer-plugin` 在 `validate` 阶段要求 JDK 21+、Maven 3.9+，并检查依赖版本收敛、插件版本显式和重复类。

## Checkstyle

`config/checkstyle-google.xml` 基于 Checkstyle 14.4.0 官方 Google 配置，基础缩进 4 空格、续行缩进 8 空格。移除全部 Javadoc 约束和注释排版检查，不要求添加文档注释；同时通过 `IllegalTokenText` 禁止任何形式的后端注释（Javadoc、行注释、块注释）。`@Test` 等测试方法和 `@BeforeEach`/`@AfterEach`/`@BeforeAll`/`@AfterAll` 生命周期方法强制 snake_case，测试辅助方法保持 camelCase。

该配置是项目适配版，并非原样的 Google Java Style。所有构建统一使用此配置，违规级别设置为 error，确保检查实际阻断构建。

## PMD

使用 Maven PMD 插件 3.28.0（内置 PMD 7.17.0），引用官方分类 `category/java/bestpractices.xml`，仅排除 `UnitTestContainsTooManyAsserts`，允许同一测试验证多个结果，不启用其他分类。源码按 Java 21 解析。

`config/pmd.xml` 配置断言识别参数，识别 MockMvc 的 `andExpect`、`andExpectAll` 和 Mockito 验证方法。需要使用 Spring `HttpHeaders` 的具体声明通过局部 `@SuppressWarnings("PMD.LooseCoupling")` 处理，不设置全局类型例外。

WebSocket 的接收缓冲区需要跨分片保存数据，字段局部抑制 `AvoidStringBufferField`；完整消息无论解析成功或失败，都会在 `finally` 中更换缓冲区，让旧数组可以回收。

`LoginApi.qrLogin` 中供截图请求读取的登录状态赋值，以及浏览器测试启动方法中的回环地址，使用方法级、指定规则的抑制。注释已被 Checkstyle 禁止，空 catch 必须包含语句（例如 `return;`），不能靠注释内容通过 `EmptyCatchBlock`。

完整分类包含测试断言、异常处理、资源管理、字符集、未使用代码等检查。扫描告警需要结合框架和业务语义复核。

参考：[Google Java Style](https://google.github.io/styleguide/javaguide.html)、[Checkstyle 14.4.0 Google 配置](https://github.com/checkstyle/checkstyle/blob/checkstyle-14.4.0/src/main/resources/google_checks.xml)、[PMD 7.17.0 Best Practices](https://docs.pmd-code.org/pmd-doc-7.17.0/pmd_rules_java_bestpractices.html)。
