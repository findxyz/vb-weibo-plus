# 正文调整 04：对齐微博官网字体

**Status:** resolved

2026-10-17，用户要求将本地微博正文字体改为官网相同字体，同时询问 chat 的迁移票数。

从用户已打开的 https://weibo.com/ 页面实际读取普通正文（epoch 与 DeepSeek 两条）的 computed style：font-family 为 `QuoteFallback, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif`，font-weight 为 400，官网字号 15px、行高 24px。

官网 CSS 来源 https://h5.sinaimg.cn/m/weibo-pro-next/assets/index-DCZHqfDD.css。读取 CSSOM 确认 html 声明以上字体栈，QuoteFallback 的字体来源仅为本机 Georgia／SimSun，unicode-range 为 U+2018-2019、U+201C-201D，仅处理引号。不是仅凭截图猜测字体，也未读取或导出用户登录凭据。

按用户所说“字体”调整普通／转发正文的字体族；保留本地 19px／17px、1.55 行高、UI 字体与纸感样式。DESIGN.md 及组件实样同步。固定几何 fixture 只按明确批准的新字体更新两个正文 font 字段，不重录尺寸或其他基准。

chat 票数仅更新路线图估算，约 17 张主票，尚未发布具体实施票；不因此实施 chat 功能。

## Answer

普通与转发正文已对齐官网字体栈及本机引号回退规则。用户现有 localhost:5173 页面热更新后，实际 computed style 已分别确认新字体栈、19px／29.45px 和 17px／26.35px。未改 chat 字体、字号或其他 UI 字体，没有字体文件或外部字体请求。

15 项真实浏览器定向检查通过，覆盖两尺寸固定几何、三尺寸组合、最小桌面媒体、元信息、图片／视频布局、长列表内容高度、正文清洗和行内表情；TypeScript 检查与双入口生产构建通过。仅两个固定基准中的正文 font 字段按本次批准的字体更新，尺寸与其他样式基准未重录。

证据为仓库外 react-post-body-font-tests.log、react-post-body-font-build.log。按正确性、简单性、职责、资源与请求影响自查，改动限于正文令牌、官网本机回退定义及设计实样。此小范围样式调整未重复运行完整 Maven，也没有替换用户正在运行的 JAR；后续 Maven 打包会收集新 CSS，ticket-18 的已保存发布包继续作为切换时的基线。

## 字号与行高跟进

2026-10-17，用户进一步授权普通／转发正文的字号也参考官网，覆盖上文保留旧字号的决定。官网 CSSOM 的普通正文规则为 `._ogText_1h76l_43`，引用 `--feed-detail-og-font-size: 15px` 与 `--feed-detail-og-line-height: 24px`；转发规则为 `._reText_1h76l_48`，引用 `--feed-detail-re-font-size: 14px` 与 `--feed-detail-re-line-height: 24px`。当前官网普通正文的实际 computed style 同样为 15px／24px。

本地普通正文调整为 15px／24px，转发正文为 14px／24px；用户现有页面热更新后，两者实际 computed style 均确认一致。DESIGN.md、组件实样及现有字号断言同步；标题、元信息、chat 及媒体尺寸保持原令牌。

原固定布局检查先展示字号改变导致的差异，再逐项核对并更新受影响的 9 组基准。只更新正文 font、正文／卡片高度和内容下方 y 坐标；三行普通正文减少 16.3125px，单行转发正文减少 2.34375px，组合位移为两者之和。宽度、横向位置、颜色、边框、图片／视频尺寸及其他字体字段未变。原版多出的空操作行差异仍按既有规则保留，未借机重录。临时测量代码没有进入测试源码，前后基准和逐字段差异保存于仓库外 react-post-size-{geometry-before,measurements,approved-diff}.json。

最终 16 项浏览器定向检查、类型检查及生产构建通过；覆盖尺寸／媒体／文本、三种窗口、长列表内容高度和普通／转发字号。900px 组合截图人工检查通过。日志为 react-post-body-size-tests.log、react-post-body-size-build.log，旧基准差异日志为 react-post-size-baseline-diff.log。该调整仍只更新源码与前端生成资源，未重新打包或部署 JAR。
