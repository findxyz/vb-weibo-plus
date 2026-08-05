# 02 - 日期时间轴侧栏与按日加载（含后端 calendar 端点）

**What to build:** 在博主面板与 feed 之间新增第三栏「日期时间轴」：后端新增 `GET /post/calendar?uid=` 聚合端点（可选 uid，不传=聚合全部博主，用 SQLite `strftime` 按 Asia/Shanghai 把 created_at 聚合成月份 -> 每日条数，倒序），前端调用它渲染可折叠的月份 -> 日期条目（带条数）。同时移除现有顶部筛选栏（起止日期/关键词/查询/重置）与底部分页，改为：点击日期树某日后右侧 feed 一次性加载该日全部微博（复用 `/post/list` 传 start=当日00:00:00、end=当日23:59:59、size=9999）。博主列表顶部新增「全部博主」行（始终置顶、不受搜索过滤），选中后 uid 不传（聚合全部）。页面初始加载默认选「全部博主」并展开最近月份、选中最近一天；移除 localStorage last-uid 记忆逻辑。

**Blocked by:** 01 - 重命名 weibo 页面目录与路由为 post

**Status:** ready-for-agent

- [ ] 后端新增 `GET /post/calendar`，可选 `uid` 参数，返回月份列表（倒序），每月含 `month`（YYYY-MM）、`count`、`days`（[{date, count}] 倒序）
- [ ] 聚合用 SQLite `strftime` on `created_at/1000` `'unixepoch' '+8 hours'`，可选 `WHERE uid = :uid`
- [ ] `PostRepositoryTest` 新增聚合测试：不传 uid 聚合全部、传 uid 只聚合该博主、UTC/CST 跨日边界归入正确日期、月份与日期倒序
- [ ] 前端中栏渲染日期时间轴：月份可折叠（默认折叠），展开显示每日条目（MM-DD + 条数）
- [ ] 博主列表顶部新增「全部博主」行，始终置顶不受搜索过滤，选中后 selectedUid=null
- [ ] 页面初始默认选「全部博主」，展开最近月份并选中最近一天，加载该日微博
- [ ] 移除 localStorage last-uid 记忆逻辑（每次都从「全部博主」开始）
- [ ] 移除顶部筛选栏（起止日期/关键词/查询/重置）与底部分页
- [ ] 点击日期树某日后 feed 一次性加载该日全部微博（倒序），feed 头部显示日期与条数
- [ ] 切换博主后日期树与 feed 跟随刷新；「全部博主」时聚合全部
- [ ] 保持现有蓝色主题与卡片样式，三栏 grid 布局 `280px 200px minmax(0,1fr)`
- [ ] Playwright `PostPageTest` 覆盖：默认选全部博主+最近一天、日期树展开选日加载、全部博主聚合、切换博主日期树刷新
