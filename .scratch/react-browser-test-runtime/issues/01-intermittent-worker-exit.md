# 浏览器测试进程偶发原生退出

**Status:** needs-triage

日期：2026-10-17。独立于 React 业务迁移的测试运行问题，未阻断已通过的逐项行为验收。

Windows、Node v24.15.0、Chrome channel、Playwright 单 worker。任务 14、15 的长套件运行中，worker 偶发退出，code=3221226505（0xC0000409），没有 JS 断言栈。各次落在不同的旧测试上，尚未确定根因，不据此认定产品或某个依赖有缺陷。

任务 14 首轮两项退出，完整重跑 95 项通过。任务 15 首轮 103 项通过、两项退出，定向包含这两项的 13 项通过；审查修正后完整运行 106 项通过、另两项退出，最后两项单独重跑通过，类型与构建通过。不能将这些结果表述为单次完整套件全绿。

证据位于仓库外研究笔记：react-post-login-frontend.log、react-post-login-final-frontend.log、react-add-blogger-frontend.log、react-add-blogger-review-fixed.log、react-add-blogger-final-frontend.log、react-add-blogger-runtime-rerun.log。没有改变依赖、测试断言或增加自动重试来隐藏退出。

任务 17 整页验收时进一步核查运行环境、原生退出信息及单次全套稳定性；必要时另行修复测试运行环境，不混入普通功能票。

任务 16 最终完整 118 项 Chrome 回归一次通过，日志 react-sync-history-frontend.log。本问题保留 needs-triage，间歇性退出的根因尚未确定，任务 17 仍需复查稳定性。
