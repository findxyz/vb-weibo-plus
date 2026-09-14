# 14 — 批次一：可访问性快赢

设计依据：`.scratch/frontend-review/2026-09-14-design.md` 批次一（含 1.1-1.6 全部细节与取舍）。

**What to build:** 纯前端零接口变更的可访问性修复六项：aria-live 策略重构、日期折叠头按钮化、表情面板键盘化、焦点框还原、reduced-motion 补全、庆祝 SR 通报。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] shared/announcer.js：懒创建 visually-hidden live region，1 秒去重，清空后延迟写入
- [ ] 两页 index.html 摘掉 5 个大列表容器的 aria-live（chat：groups-list/messages；post：bloggers-list/dates-list/posts）
- [ ] chat.js 新消息、posts.js 列表加载、search.js 搜索完成接入 announcer
- [ ] dates.js 年/月折叠头改 button + aria-expanded/aria-controls，CSS 按钮复位零视觉变化
- [ ] emoji-panel.js 格子改 button + 焦点入面板/关闭归还；chat.css .emoji-cell 复位
- [ ] 删除 chat.css 附件区 focus-visible outline:none
- [ ] 两份 CSS 的 reduce 媒体查询补 animation/transition 三项（celebration JS 动画留批次三）
- [ ] celebration.js 触发时经 announcer 通报「欢迎 XX 回归」
- [ ] 纯键盘走查：表情插入、折叠开合、附件发送全部可用；reduce 模拟无持续闪烁

## Comments
