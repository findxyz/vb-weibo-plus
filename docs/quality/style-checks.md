# Google Style 与 PMD Best Practices

后端检查统一执行 Google 风格检查、PMD、SpotBugs 和后端测试，跳过前端构建及浏览器测试。

```bash
mvn -Pbackend-check clean test
```

发现违规会阻断构建。Checkstyle 在 `validate` 阶段失败时，不会继续执行 PMD 和测试。

同时生成两份报告、查看全部违规：

```bash
mvn -Pbackend-check checkstyle:checkstyle pmd:pmd
```

此命令只生成报告，不作门禁。报告位于 `target/backend-check/checkstyle-result.xml`、`target/backend-check/reports/checkstyle.html`、`target/backend-check/pmd.xml` 和 `target/backend-check/reports/pmd.html`。单独执行 PMD 门禁可运行 `mvn -Pbackend-check pmd:check`。PMD 类型解析使用编译类路径及已有的编译产物；完整编译和测试需先处理 Checkstyle 违规。

## Checkstyle

`config/checkstyle-google.xml` 基于 Checkstyle 14.4.0 官方 Google 配置，基础缩进 4 空格、续行缩进 8 空格，保留项目规定的 `@Test` 方法 snake_case 命名。移除全部 Javadoc 约束和注释排版检查，不要求添加文档注释，也不禁止已有注释。

该配置是项目适配版，并非原样的 Google Java Style。所有构建统一使用此配置，违规级别设置为 error，确保检查实际阻断构建。

## PMD

使用 Maven PMD 插件 3.28.0（内置 PMD 7.17.0），引用官方分类 `category/java/bestpractices.xml`，仅排除 `UnitTestContainsTooManyAsserts`，允许同一测试验证多个结果，不启用其他分类。源码按 Java 21 解析。

`config/pmd.xml` 配置断言识别参数，识别 MockMvc 的 `andExpect`、`andExpectAll` 和 Mockito 验证方法。需要使用 Spring `HttpHeaders` 的具体声明通过局部 `@SuppressWarnings("PMD.LooseCoupling")` 处理，不设置全局类型例外。

WebSocket 的接收缓冲区需要跨分片保存数据，字段局部抑制 `AvoidStringBufferField`；完整消息无论解析成功或失败，都会在 `finally` 中更换缓冲区，让旧数组可以回收。

`LoginApi.qrLogin` 中供截图请求读取的登录状态赋值，以及浏览器测试启动方法中的回环地址，使用方法级、指定规则的抑制。Checkstyle 接受空 catch 中已有的非空中文说明，不要求补写英文注释。

完整分类包含测试断言、异常处理、资源管理、字符集、未使用代码等检查。扫描告警需要结合框架和业务语义复核。

参考：[Google Java Style](https://google.github.io/styleguide/javaguide.html)、[Checkstyle 14.4.0 Google 配置](https://github.com/checkstyle/checkstyle/blob/checkstyle-14.4.0/src/main/resources/google_checks.xml)、[PMD 7.17.0 Best Practices](https://docs.pmd-code.org/pmd-doc-7.17.0/pmd_rules_java_bestpractices.html)。
