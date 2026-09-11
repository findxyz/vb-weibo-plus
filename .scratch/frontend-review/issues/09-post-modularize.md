# 09 — post.js 模块化拆分并接入 shared

**What to build:** 把 post 页 1200+ 行单文件 IIFE 拆成与 chat 页同构的 ES 模块：博主列表、日期时间轴、博文渲染、高级搜索、图片查看器、登录六大块 + 页面引导入口；同时接入 shared 的 fetchJson/日期/QR 登录/高亮。DOM 清理统一 replaceChildren，跳转博文绕过 loadingPosts 守卫的 workaround 在拆分中显式化。

**Blocked by:** 03、04、06（shared 能力就位）。

**Status:** ready-for-agent

- [ ] post 页拆为多个职责模块 + index 引导，行为与拆分前完全一致
- [ ] fetchJson、日期工具、QR 登录、高亮全部来自 shared，页内副本删除
- [ ] innerHTML 清空统一改为 replaceChildren
- [ ] 搜索跳转博文的路径不再依赖对 selectDate 早退保护的绕行注释（守卫显式化）
- [ ] index.html 的脚本引用与加载顺序正确

## Comments
