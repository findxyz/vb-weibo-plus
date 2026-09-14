# 15 — 批次二：正确性收敛

设计依据：`.scratch/frontend-review/2026-09-14-design.md` 批次二（含 2.1-2.7 全部细节与取舍）。

**What to build:** 时区统一（post 全链路 Asia/Shanghai，chat 仅查询类默认值）、login 合并 shared 并统一 valid 语义、linkify 同源、toLowerCase 替换、posts 清洗换 DOMPurify 白名单、CSP 响应头（Java filter + JUnit）、三个小项（fetch 超时、qr onerror、viewer token）。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] date.js：SHANGHAI_OFFSET_MS / epochToShanghai / shanghaiToday / epochToShanghaiDate，formatDate 改上海口径，头注释写明两页口径分工
- [x] search.js 删本地 epochToDateStr；post 搜索/同步弹窗、chat 历史/分析默认日期改上海今天（远端粗锚点随「今天」锚推算）
- [x] shared/login.js 合并两页 login，valid 严格 === true；chat/login.js 保留周期检测壳；post/login.js 删除
- [x] shared/linkify.js：URL_TEXT_RE + stripUrlTrailing；chat message-view 与 post posts.js 共用
- [x] groups/highlight/search 的 toLocaleLowerCase("zh-CN") → toLowerCase()
- [x] dompurify.min.js 移 shared；post/index.html 常规加载；posts.js renderContent 换白名单管线，删 sanitizeContentTree
- [x] SecurityHeadersFilter：仅两个 app shell 路径加 CSP，dream 页排除；JUnit 覆盖带头/不带头
- [x] fetchJson 默认 15s 超时（TimeoutError 转中文提示）；qr 二维码图失败自愈提示（靠既有 10s 轮询重拉，比设计稿的「点击重试」更顺，不与 pending 守卫打架）；viewer 切换加 token
- [x] mvn test 通过；时区/链接/DOMPurify 手动走查按设计验收清单

## Comments

- 提交 1a25a40。全量 mvn test 420 例通过（含 SecurityHeadersFilterTest 2 例与两套 UI 页面测试）。
