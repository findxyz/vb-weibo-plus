# React 迁移访谈记录

日期：2026-10-12。
当前阶段：用户已确认共同理解，迁移总纲、阶段计划和前三张任务票已形成，尚未开始实现。
工作分支：`codex/react-migration`。

## 技术方向

沿用此前讨论：React、TypeScript 和 Vite，一个前端工程、两个页面入口。
开发时使用 Vite，发布时由 Spring Boot 提供静态资源。
前端产物生成到 `target/`，通过 Maven 资源流程纳入同一个可执行 JAR。
先迁移 post，再迁移 chat。
现有后端接口、已实现功能和双皮肤作为迁移基线。

## 已确认决定

1. Q1，逐页切换。post 完成验收后切换正式入口，chat 暂时保持旧版。
2. Q2，迁移范围独立。阻碍迁移的问题单独记录并修复，其他缺陷和未完成需求另开票。
3. Q3，逐票由用户推进。当前票完成、验证并报告后停下，由用户决定开始下一票。

以上三项由用户回复三个 A 确认。

4. Q4，通过发布产物与 Git 回退。保留切换前的 JAR 和 Git 提交；迁移期间保留旧页面作参照，迁移完成后删除被替代的旧代码，不长期维护双版本入口。
5. Q5，保持视觉与交互一致。保留现有皮肤、布局、字号和交互，接受不影响整体观感的细微差异；不要求严格像素一致。

以上两项由用户回复 AA 确认。

## 范围汇总

本次目标是替换前端实现技术，保持已实现功能和现有业务语义。
post 和 chat 按页验收、按页切换，开发与发布路径同时验证。
任务按阶段细化，单次实现只推进用户指定的任务票。
每票完成后报告变更、验证结果和遗留问题，等待用户决定下一票。
范围外缺陷与未完成需求继续使用独立任务。

2026-10-12，用户回复“确认”，认可上述范围汇总，并授权形成规格与首阶段任务。

## 事实依据

- 领域术语与业务语义：[CONTEXT.md](../../CONTEXT.md)。
- 设计令牌与双皮肤：[DESIGN.md](../../docs/design/DESIGN.md)。
- 一次性落底规则：[ADR-0008](../../docs/adr/0008-scroll-to-bottom-is-one-shot.md)。
- 现有页面回归：[PostPageTest.java](../../src/test/java/xyz/fz/weibo/ui/PostPageTest.java) 和 [GroupChatPageTest.java](../../src/test/java/xyz/fz/weibo/ui/GroupChatPageTest.java)。
- post 的定时视图刷新和新帖提示仍有 `ready-for-agent` 任务：[旧任务 05](../weibo-post-page/issues/05-new-posts-banner-and-view-refresh.md)。该任务不自动并入技术迁移。

## 下一步

当前规格见 [PRD.md](PRD.md)，阶段与任务顺序见 [PLAN.md](PLAN.md)。
前三张票已发布，只有任务 01 没有前置阻塞；用户指定开始对应票后实施。
后续阶段先保留轮廓，进入对应阶段时再细化。
