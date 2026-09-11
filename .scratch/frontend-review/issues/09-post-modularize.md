# 09 — post.js 模块化拆分并接入 shared

**What to build:** 把 post 页 1200+ 行单文件 IIFE 拆成与 chat 页同构的 ES 模块：博主列表、日期时间轴、博文渲染、高级搜索、图片查看器、登录六大块 + 页面引导入口；同时接入 shared 的 fetchJson/日期/QR 登录/高亮。DOM 清理统一 replaceChildren，跳转博文绕过 loadingPosts 守卫的 workaround 在拆分中显式化。

**Blocked by:** 03、04、06（shared 能力就位）。

**Status:** resolved

- [x] post 页拆为多个职责模块 + index 引导，行为与拆分前完全一致
- [x] fetchJson、日期工具、QR 登录、高亮全部来自 shared，页内副本删除
- [x] innerHTML 清空统一改为 replaceChildren
- [x] 搜索跳转博文的路径不再依赖对 selectDate 早退保护的绕行注释（守卫显式化）
- [x] index.html 的脚本引用与加载顺序正确

## Comments

- 拆为 7 模块 + 入口：`bloggers.js`（列表/筛选/添加博主/同步历史）、`dates.js`（三级时间轴）、`posts.js`（按日加载 + 卡片渲染 + linkify/清洗）、`search.js`（高级搜索 + 摘要高亮 + 跳转）、`viewer.js`（图片查看器）、`login.js`（登录态）、`helpers.js`（showState/日期校验/认证徽标/formatDate/epochToDateStr/createApiErrorHandler）。入口 post.js 保留原文件名，index.html 无需改动。
- 与 chat 同构的工厂 + DI：签名解构 elements 子集，入口以 `pickElements` 注入；共享可变 state 对象与 handleApiError 回调显式传递。依赖链 viewer ← posts ← dates ← bloggers，search 依赖 dates+posts，login 独立，无循环。
- 守卫显式化：posts 导出 `activateDate(date, itemEl)`（无早退，注释写明供程序性切换使用）与带 loadingPosts 守卫的 `selectDate`；jumpToPost 改走 activateDate + loadPosts，原「避免早退保护的绕行注释」消失，语义落在函数名上。
- replaceChildren 替换全部 8 处 `innerHTML = ""`（posts×2、searchResults×3、datesList×2、renderDates 内 1）；bloggers 的 row.remove() 循环保留（需保留「全部博主」行）。
- 页内副本删除：本地 fetchJson、toQueryDateTime、toQueryEndTime、toLocalDateValue 全部改 import shared；QR 登录与高亮沿用前序工单。formatDate/epochToDateStr 属 post 页专用（非 chat 副本），收在 helpers.js。
- 行为保真自查：异步时序（await loadDates 后查 DOM、jumpToPost 不改 await 结构）、runSyncHistory 硬编码时间模板、搜索空态文案等逐点比对原实现；接线用脚本交叉校验（解构 ⊆ pick ⊆ 映射表，无 elements. 残留）WIRING-OK。commit b3fdf26。
