# 验收缺陷 02：缺少读取成功的事件摘要

**Status:** resolved

日期：2026-10-17。任务 17 对照旧 posts.js／shared/announcer.js 发现。

旧版成功读取非空日列表后播报“已加载 N 条微博”，正文大列表不设 aria-live。React 只有加载／错误／空态提示，缺少成功摘要。

最小修复：常驻、视觉隐藏的 polite／atomic 阅读摘要，成功后以实际已加载条数播报；加载、错误或空列表清空。重复显式读取同一日时经过清空后重新播报，不增加计时器、轮询或全局 DOM 工厂。

## Answer

b421dbb 修复。成功摘要、重复同日、错误清空与正文不设 live region 的浏览器检查通过；Java 生成资源与最终 JAR 也验证摘要。红／绿日志为 react-post-acceptance-announcement-red.log、announcement-fixed.log；完整验证见任务 17。
