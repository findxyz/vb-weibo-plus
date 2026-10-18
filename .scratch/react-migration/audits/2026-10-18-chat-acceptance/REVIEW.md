# React chat 整页验收记录

日期：2026-10-18。起点：d6fe17f。任务：[34](../../issues/34-chat-page-acceptance.md)。

结果：208 项前端、407 项干净 Maven verify 全部通过，最终独立 JAR 三尺寸验收通过。实现提交 e69e79d、d7bdd83。正式 chat 尚未切换。

## 已发现并修复

| 项目 | 复现与修复 | 回归 |
| --- | --- | --- |
| Historical Browse 关闭未取消请求 | close 事件增加请求版本并取消控制器，阻止迟到结果更新隐藏窗口 | 查询／采集两项先红后绿，e69e79d |
| 窗口图标、favicon 与群号遗漏 | 复制已有 logo 到 React chat，声明共享 favicon，补回独立群号行 | 图标加载／MIME、切群群号先红后绿，d7bdd83 |

三尺寸组合检查：历史筛选 → 上下文 → 图片查看 → Escape 返回历史 → Escape 返回主窗口 → 分析详情 → 关闭 → 沉浸切换。检查焦点恢复、主消息区位置、群过滤词与草稿保留，无业务写请求。900×560 的历史／分析弹窗和 1280×800 的主窗口截图已人工查看。

## 能力与证据归属

| 能力 | 本轮证据 |
| --- | --- |
| 群列表／身份 | chat 常规浏览器回归，含默认选择、搜索、头像、元数据刷新与退避；新增群号／品牌检查 |
| 正文／媒体 | chat 常规浏览器回归，含安全文本、URL、表情、文件、微博卡、图片与视频；新增历史图片嵌套模态组合 |
| 滚动／刷新／长会话 | chat 常规浏览器回归，含动态媒体收尾、用户输入停止收尾、Catch-up、迟到翻页隔离、20101 条消息裁剪与不超过 360 个消息节点 |
| 发送／登录 | chat 常规浏览器回归，含文本、图片、视频、失败保留、409、扫码、401 与群归属；JAR 检查只用本地写替身 |
| 历史／分析／梦境 | chat 常规浏览器回归，含日期、分页、上下文、采集、分析 SSE 与安全 Markdown、梦境取消及真实游戏；新增关闭取消和三尺寸组合 |
| 独立发布 | jar-smoke.py 启动最终 JAR，SQLite 查询使用真实控制器；浏览器只替换媒体、登录和业务写；三尺寸新旧同数据对照、Markdown 惰性模块 MIME、游戏与两页往返 |

## 重放

从 frontend 运行：

```powershell
$env:PREVIEW_BROWSER_CHANNEL='msedge'
npx playwright test tests/chat.spec.ts -g chat_acceptance
```

构建完成后，从仓库根目录运行：

```powershell
python .scratch/react-migration/audits/2026-10-18-chat-acceptance/jar-smoke.py
```

脚本打印仓库外证据目录，保留截图、资源 MIME、JAR 哈希与隔离应用日志。直接使用当前 Java 安装的 bin/java，避免 Windows 启动器派生进程残留。

## 执行中遇到的非产品问题

- 首次最终前端回归运行到分析详情时，另一次 npm ci 因 Rolldown 文件占用失败，删除了大部分依赖。随后测试报告缺少 workerProcessEntry.js，新命令也无法导入 @playwright/test。保留 chat-34-frontend-dependency-interruption.log；停止测试后重新 npm ci 成功，再从头执行完整回归。
- JAR 探针先默认选到空群，改为显式选择种子群；后将 assets 下所有文件误按 JavaScript 检查 MIME，改为按 CSS／SVG／JS 分别检查。这两次为验收脚本错误。
- 初版 JAR 脚本经 Windows 的 java 启动器启动，退出时残留两次隔离 JVM，导致下一次 Maven clean 无法删除 JAR。核实命令仅属于本轮 react-chat-34-jar 临时目录后停止它们，脚本改为直接启动真实 Java，重新干净构建。没有停止用户服务。
- 扫码成功后先隐藏失效面板，再重新挂载消息窗口。探针过早操作旧头像产生 Element is not attached；改为等待扫码完成后的有效状态复查，再滚动、悬停，三尺寸通过，没有修改应用源码来迎合探针。
- 游戏打开后焦点进入 iframe，Escape 未关闭外层 dialog，探针随后点击背景导航被遮挡。改用既有关闭按钮，未改变游戏或宣称验证了 iframe 内 Escape 关闭能力；页面操作增加 8 秒上限，避免探针无限等待。

## 最终证据

- 前端日志：.scratch/react-migration/chat-34-frontend.log，208 项通过（chat 85、post 123）。
- 干净构建日志：.scratch/react-migration/chat-34-verify.log，407 项通过，JAR／7z 构建成功。
- JAR 日志：.scratch/react-migration/chat-34-jar.log。最后一次同时核对完整 SQLite 逻辑导出不变，证据目录为 C:/Users/fixyz/AppData/Local/Temp/react-chat-34-jar-fmmd714j。
- [生产资源／MIME 与三尺寸几何](acceptance.json)、[JAR 哈希与隔离结果](artifact.json)已持久保存；仓库外目录还保留三尺寸的全部截图。上一轮成功证据目录 p09lz77l 用于人工查看 1600 页面；两轮应用 JAR 哈希一致。
- [旧版 900 对照](legacy-900.png)、[React 900 对照](react-900.png)、[真实游戏 900](dream-900.png)。900 新旧、1600 React、900 游戏以及开发态历史／分析截图均已人工查看。
- 可回退包位于 target/react-migration-release/ticket-34，具体 SHA-256 见任务 34。保存包与验收包一致，7z 完整性通过。所有旧发布包已恢复原位置；未留存隔离验收 JVM。

差异复核只涉及当前票的关闭生命周期、标识与群号补齐、回归及证据。没有新增后端、协议、依赖、分支或 worktree；没有发现剩余迁移阻断项。本轮未派独立代理，不把当前执行者的复核表述为独立审查。

## 验证边界

用户的真实 Credential、日常数据库和外部微博发送／扫码／采集未参与本轮验收。媒体字节为本地替身，数据库读取为真实 SQLite；真实媒体后端能力由既有服务与页面回归覆盖。无障碍证据是浏览器语义、键盘、焦点与 live region 断言，不等同于实体屏幕阅读器人工验收。长会话使用真实分页与浏览器 DOM 压力场景，没有宣称进行了数日持续运行。

正式入口仍是旧 chat；本票不清理旧源码，不结束 preview。
