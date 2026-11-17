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

使用 Maven PMD 插件 3.28.0（内置 PMD 7.17.0），直接引用官方完整分类 `category/java/bestpractices.xml`，不筛选、不排除其中规则，不启用其他分类。源码按 Java 21 解析。

完整分类包含测试断言、异常处理、资源管理、字符集、未使用代码等检查。扫描告警需要结合框架和业务语义复核，当前历史违规尚未批量整改。

参考：[Google Java Style](https://google.github.io/styleguide/javaguide.html)、[Checkstyle 14.4.0 Google 配置](https://github.com/checkstyle/checkstyle/blob/checkstyle-14.4.0/src/main/resources/google_checks.xml)、[PMD 7.17.0 Best Practices](https://docs.pmd-code.org/pmd-doc-7.17.0/pmd_rules_java_bestpractices.html)。
