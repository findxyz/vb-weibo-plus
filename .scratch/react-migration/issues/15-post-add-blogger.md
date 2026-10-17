# 15：React post 添加博主

**What to build:** 迁移添加博主入口、UID／主页链接校验、提交与添加后的列表刷新。

**Blocked by:** 14，已完成。

**Status:** resolved

日期：2026-10-17。用户授权连续完成至任务 16。

依据旧 bloggers.js／index.html／post.css 与 POST /post/bloggers。支持 trim 后至少 4 位纯数字 UID，以及旧规则识别的 weibo.com/u/数字、weibo.com/数字；提交提取出的 UID 字符串，不访问输入链接。无效输入本地提示、不发请求；输入 Enter／按钮提交，沿用 15 秒 HTTP 超时、接口错误文案、不自动重试。

添加入口位于博主标题右侧，弹窗每次打开清空输入／错误并聚焦输入。待处理显示“正在添加并拉取微博…”，禁止重复提交及重开另一次添加。关闭按钮／Escape 恢复入口焦点，关闭只隐藏界面，不声称取消已经发送的服务端添加。POST 成功后关闭弹窗，再 GET 博主列表；成功找到新 UID 时切到新博主最新日，保留左栏过滤。若用户已关闭弹窗或刷新期间另行改选，只更新列表，不抢占阅读。

POST 失败保持弹窗和输入，可手动重试；401 关闭弹窗并复用登录失效入口。POST 成功但列表刷新失败不再 POST，沿用博主读取错误提示；仅找到新博主才选中。卸载停止本地请求／回调，不新增后端取消接口。

外框沿用 420px、40px 标题、18px 内边距、36px 输入，纸感令牌与现有焦点环；遮罩改为纸感墨色，投影用 shadow-card。不实现采集弹窗或正式入口切换。

## Acceptance criteria

- [x] 输入格式、trim、Enter、验证和仅一次正确 POST 参数通过。
- [x] 成功列表刷新／选择／最新日与过滤保持、取消或改选隔离通过。
- [x] 非 401 错误重试、401 登录恢复、超时和添加成功但读取失败不重发通过。
- [x] 焦点／键盘、旧版几何对照、前端回归／构建、Maven／JAR 本地替身及独立审查通过。
## 验收证据

实施 cd14091、511972b，审查修正 0111d0d。先复现缺失入口，再实现添加与隔离。

- 新增 11 项添加检查，包含 UID／两类主页输入、Enter、无效输入、重开复位、同次单写、关闭后完成、博主／日期／搜索改选保护、POST 成功但读取失败、401、超时与旧版几何。13 项定向（含两项前轮进程退出用例）及类型／构建通过。
- 最终全套 108 项中 106 项通过，两项在不同旧测试上因 worker 原生退出中断；最后两项定向重跑通过，随后类型与双入口构建通过。不将其表述为单次全套全绿。独立运行问题见 .scratch/react-browser-test-runtime/issues/01-intermittent-worker-exit.md，留待整页验收复查。
- Maven ReactPreviewPageTest package，14 项资源检查通过。新增本地 POST 替身验证主页链接提取、刷新列表及选中新 UID。
- 隔离 JAR 以预种 SQLite、缺失 Credential、空采集群号验证真实读取、搜索及添加后的最新日期正文。添加 POST 在浏览器替换，初次列表隐藏预种博主以模拟添加，随后由真实 GET 返回；未修改用户或临时业务数据。4 个新旧入口与 14 条 MIME 通过。测试进程树已关闭。
- 证据 C:/Users/fixyz/AppData/Local/Temp/react-add-blogger-jar-pndca_ri，弹窗截图已人工检查。仓库外 react-add-blogger-{red,slice1,boundaries,frontend,review-red,review-fixed,final-frontend,runtime-rerun,package,jar-smoke}.log、jar-smoke.py／.mjs 及 release-hashes.json 保留。
- 发布包 target/react-migration-release/ticket-15 的 JAR／7z 哈希一致，7z 完整性通过；正式入口不变。

### Standards

5f09169 到 511972b 独立审查 0 项，0111d0d 新增差异复核 0 项。

### Spec

初审发现 P2 日期／搜索改选不受 visit 保护、P3 前导零 UID 匹配失败；3 项测试复现后，使用阅读操作版本和既有数值 UID 匹配修正，提交值保留字符串。两项均复核关闭，无遗留发现。
