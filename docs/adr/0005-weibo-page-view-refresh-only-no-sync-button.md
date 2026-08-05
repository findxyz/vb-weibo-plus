# 本地微博页面不新增前端同步按钮，依赖后台 SyncTask + 视图刷新

参考项目 weiboblog 的前端有「同步按钮 + 轮询状态 + 自动刷新开关 + 倒计时圆环」机制，但那是因为 weiboblog 是无后台任务的 Python 项目，同步靠前端触发子进程。vb-weibo-plus 已有 `SyncTask`（每 10 分钟对全部博主执行 `saveIncremental`），因此本地微博页面不新增任何前端同步触发入口，只做定时视图刷新：前端每 60 秒重新拉取月份/日期/当日微博，diff 出新帖后显示提示条。这样避免后端为 `saveIncremental` 增加异步与状态查询改造，也符合 CONTEXT.md 中「Background Capture」与「View Refresh」的区分。
