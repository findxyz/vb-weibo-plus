# 验收缺陷 01：React post 缺少切换到旧 chat 的窗控

**Status:** resolved

日期：2026-10-17。任务 17 整页对照发现。

旧 post.js 的 windowToggle 导航到 /chat/index.html，PostPageTest 已有回归；React PostPreview 只有旧 post 对照链接，缺少此功能。

修复边界：补齐纸感窗控、可访问名称、鼠标／键盘跳转。开发目标为配置的 Spring Boot 后端，生产同源；保留旧 chat，不跳到 preview/chat 骨架。先写失败测试，再最小修改。

## Answer

819bdb6 修复。鼠标、Enter、Space 及旧版纸感几何对照通过，Java 构建资源测试和最终 JAR 的实际旧 chat 导航通过。红／绿日志为 react-post-acceptance-nav-red.log、nav-fixed.log；完整验证见任务 17。
