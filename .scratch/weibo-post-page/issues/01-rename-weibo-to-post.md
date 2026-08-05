# 01 - 重命名 weibo 页面目录与路由为 post

**What to build:** 把本地微博浏览页面从 `static/weibo/` 迁到 `static/post/`，页面路由从 `/weibo/index.html` 变为 `/post/index.html`，文件随之改名（`weibo.css` -> `post.css`、`weibo.js` -> `post.js`、`index.html` 里的引用更新）。chat 页面 titlebar 切换按钮的跳转目标从 `/weibo/` 改为 `/post/`。页面 `<title>` 与 `<h1>` 保持中文「本地微博」不变。这是纯重命名，不改任何功能与样式，迁移后页面行为与现在完全一致（博主列表、筛选栏、分页、卡片、图片查看器、登录失效检测全部照常工作）。

**Blocked by:** None - can start immediately

**Status:** ready-for-agent

- [ ] `static/weibo/` 目录改名为 `static/post/`，`weibo.css`/`weibo.js` 改名为 `post.css`/`post.js`，`index.html` 里的 `<link>`/`<script>` 引用更新
- [ ] chat 页面切换按钮跳转目标从 `/weibo/` 改为 `/post/`（chat.js 中的 `location.href`）
- [ ] post 页面切换按钮跳转目标保持 `/chat/` 不变
- [ ] 页面 `<title>` 与 `<h1>` 保持中文「本地微博」
- [ ] 访问 `/post/index.html` 能正常加载页面，博主列表、筛选栏、分页、卡片、图片查看器、登录失效检测行为与迁移前一致
- [ ] chat 页面切换按钮能跳转到 `/post/index.html`
