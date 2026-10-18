---
version: alpha
name: vb-weibo-plus
description: >-
  微博辅助客户端 vb-weibo-plus 的双皮肤设计体系：「蔚蓝拟物」桌面窗格皮肤（chat.css）
  与「星空微博」博文阅读皮肤（post.css）。chat 令牌沿用源码，post 依据已确认效果图更新，
  作为后续界面扩展与一致性的唯一令牌依据。
colors:
  primary: "#086ce0"
  primary-strong: "#034fbf"
  primary-soft: "#dff0ff"
  surface: "#ffffff"
  surface-subtle: "#f3f8fc"
  border: "#98bde0"
  border-strong: "#6f9fc9"
  text: "#101820"
  muted: "#607486"
  danger: "#b42318"
  focus: "#ffb020"
  frame: "#075fd2"
  link: "#1677ff"
  success-hint: "#52c41a"
  error-hint: "#f5222d"
  mark: "#fff0a8"
  amber: "#f4a51d"
  amber-deep: "#e5a11b"
  amber-bg: "#fff8d9"
  paused-text: "#9a6200"
  paused-bg: "#fff7e6"
  titlebar-top: "#1394fa"
  titlebar-upper: "#0879ed"
  titlebar-deep: "#0060d8"
  titlebar-bottom: "#006bea"
  titlebar-text-shadow: "#003692"
  sidebar-from: "#dcefff"
  sidebar-to: "#bedcf3"
  sidebar-text: "#16375a"
  heading-from: "#fafdff"
  heading-to: "#d8eafa"
  heading-alt-to: "#e1effa"
  active-to: "#eaf6ff"
  avatar-from: "#4ba7ec"
  avatar-to: "#0864c6"
  avatar-border-sm: "#789bb8"
  avatar-border-md: "#6c9ec7"
  avatar-border-lg: "#6494bd"
  bubble-border: "#a7bdcd"
  bubble-text: "#16242f"
  meta-text: "#637889"
  chip-text: "#486b88"
  system-bg: "#e1e3e6"
  system-text: "#45494d"
  admin-bg: "#fff3e0"
  admin-border: "#f0c78a"
  bar-bg: "#edf6fc"
  bar-text: "#214f78"
  filter-text: "#355b7c"
  row-line: "#d5e4ef"
  row-line-soft: "#d2e1ec"
  result-hover: "#edf7ff"
  tool-to: "#dceaf5"
  tool-border: "#7f9fba"
  close-from: "#ff9a73"
  close-to: "#e63c20"
  window-from: "#70bcf8"
  window-to: "#176fce"
  immersive-from: "#7cc6f7"
  immersive-to: "#0f6cbd"
  immersive-active-from: "#fcd34d"
  immersive-active-to: "#d97706"
  toggle-from: "#86efac"
  toggle-to: "#16a34a"
  desktop-backdrop: "#b9d8f2"
  search-border: "#8badca"
  search-bg: "#e8f3fb"
  media-border: "#91abc0"
  media-bg: "#16232d"
  emoji-hover: "#eef4fb"
  code-bg: "#f5f5f5"
  error-border: "#e3b7b2"
  error-bg: "#fdf4f3"
  filter-panel-from: "#e7f3fc"
  filter-panel-to: "#d1e6f7"
  post-sky: "#087fb7"
  post-surface: "#031b28"
  post-surface-alt: "#072b42"
  post-surface-raised: "#0b3853"
  post-text: "#e4eef5"
  post-muted: "#9ac9e0"
  post-link: "#60cfff"
  post-line: "#1c5069"
  post-border: "#2986b4"
  post-selected: "#155d89"
  post-accent: "#009fee"
  post-focus: "#8cddff"
  post-verified: "#ffad19"
  post-danger: "#ffb4a8"
  post-mark: "#ffe4a2"
  post-button-top: "#104468"
  post-button-bottom: "#052438"

typography:
  app-title:
    fontFamily: 'Tahoma, "Microsoft YaHei", "Microsoft JhengHei", SimSun, sans-serif'
    fontSize: 18px
    fontWeight: 700
    letterSpacing: "0.4px"
  panel-title:
    fontFamily: 'Tahoma, "Microsoft YaHei", "Microsoft JhengHei", SimSun, sans-serif'
    fontSize: 17px
    fontWeight: 700
  group-title:
    fontFamily: 'Tahoma, "Microsoft YaHei", "Microsoft JhengHei", SimSun, sans-serif'
    fontSize: 20px
    fontWeight: 700
  body-text:
    fontFamily: 'Tahoma, "Microsoft YaHei", "Microsoft JhengHei", SimSun, sans-serif'
    fontSize: 15px
    lineHeight: 1.55
  meta-text:
    fontFamily: 'Tahoma, "Microsoft YaHei", "Microsoft JhengHei", SimSun, sans-serif'
    fontSize: 12px
    lineHeight: 1.4
  post-content:
    fontFamily: 'QuoteFallback, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif'
    fontSize: 15px
    lineHeight: 24px
  retweet-content:
    fontFamily: 'QuoteFallback, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif'
    fontSize: 14px
    lineHeight: 24px
  post-brand:
    fontFamily: '"Microsoft YaHei", sans-serif'
    fontSize: 36px
    fontWeight: 700
rounded:
  sm: 3px
  md: 4px
  control: 5px
  pill: 999px
  post-control: 3px
  post-avatar: 1px
  post-feed: 0px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 18px
  titlebar: 38px
  sidebar: 280px
  toolbar: 48px
components:
  titlebar:
    backgroundColor: "{colors.titlebar-top}"
    textColor: "#ffffff"
    height: 38px
    typography: "{typography.app-title}"
  window-control:
    backgroundColor: "{colors.window-from}"
    textColor: "#ffffff"
    width: 28px
    height: 26px
    rounded: "{rounded.control}"
  titlebar-close:
    backgroundColor: "{colors.close-from}"
    textColor: "#ffffff"
    width: 28px
    height: 26px
    rounded: "{rounded.control}"
  tool-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    height: 32px
    rounded: "{rounded.sm}"
  fab-new-messages:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: 16px
  search-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    height: 34px
    rounded: "{rounded.sm}"
  bubble:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.bubble-text}"
    typography: "{typography.body-text}"
    rounded: "{rounded.md}"
  attitude-chip:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.chip-text}"
    rounded: "{rounded.pill}"
  attitude-chip-selected:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-strong}"
    rounded: "{rounded.pill}"
  system-message:
    backgroundColor: "{colors.system-bg}"
    textColor: "{colors.system-text}"
    rounded: 2px
  admin-message:
    backgroundColor: "{colors.admin-bg}"
    textColor: "{colors.bubble-text}"
    rounded: "{rounded.md}"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  post-card:
    backgroundColor: "transparent"
    textColor: "{colors.post-text}"
    typography: "{typography.post-content}"
    rounded: "{rounded.post-feed}"
  retweet-note:
    backgroundColor: "{colors.post-surface-alt}"
    textColor: "{colors.post-text}"
    typography: "{typography.retweet-content}"
    rounded: "{rounded.post-control}"
  post-button:
    backgroundColor: "{colors.post-button-top}"
    textColor: "{colors.post-text}"
    height: 32px
    rounded: "{rounded.post-control}"
  post-input:
    backgroundColor: "{colors.post-surface}"
    textColor: "{colors.post-text}"
    height: 34px
    rounded: "{rounded.post-control}"

---

## Overview

两套独立皮肤互不混用：

- **蔚蓝拟物（chat.css）**：沿用现有 Windows Aero 桌面窗格、蓝色高光渐变与浅色气泡。
- **星空微博（post.css）**：根据用户确认的 2010 年微博效果图，使用星空背景、深蓝连续微博流、方形头像和右侧日历。它替代原来的纸感手绘皮肤。

post 的背景素材为本次效果图派生的纯星空图，路径为 frontend/src/post/assets/starry-sky.png。由 ImageGen 去除效果图中的界面内容后生成，固定在页外背景使用；正文区域使用不透明底色，保持阅读对比度。素材生成提示为“纯蓝色星空，顶部深蓝星云与两侧青色星团，底部平滑过渡为蓝色，无界面、文字和前景”。

## Colors

chat 继续使用 YAML 中原有拟物令牌。post 仅使用 post 前缀令牌，在 post.css 中映射为局部变量：

| CSS 变量 | DESIGN 令牌 | 用途 |
|---|---|---|
| --sky | post-sky | 星空图片下的背景底色 |
| --surface | post-surface | 连续微博流、输入框、弹窗 |
| --surface-alt | post-surface-alt | 右侧栏和转发区域 |
| --surface-raised | post-surface-raised | 标题带、悬停与定位高亮 |
| --text／--muted | post-text／post-muted | 正文与元信息 |
| --link | post-link | 昵称、原文链接 |
| --line／--border | post-line／post-border | 条目分隔与控件描边 |
| --selected／--accent | post-selected／post-accent | 博主选中与日期选中 |
| --focus | post-focus | 键盘焦点环 |
| --verified | post-verified | 认证标记 |
| --danger／--mark | post-danger／post-mark | 错误提示与搜索命中 |
| --button-top／--button-bottom | post-button-top／post-button-bottom | 紧凑蓝色按钮渐变 |

post 的正文、链接与次要文字在深色底上保持清晰。禁用按钮使用 45% 不透明度，并设置原生 disabled；进行中的采集按钮沿用 aria-disabled 与提交防重。

## Typography

- post 的 UI、标题与昵称保留 Microsoft YaHei；中文不使用手写体或衬线体。
- 正文沿用 QuoteFallback, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif。
- QuoteFallback 仅覆盖 U+2018-2019、U+201C-201D 引号，本机来源为 Georgia、SimSun。不下载字体。
- 普通正文为 15px／24px，转发正文为 14px／24px；来源为 2026-10-17 对照的微博官网 CSS。
- 元信息为 12px，并使用 tabular-nums。昵称为 16px／700，博主列表为 17px／700，面板标题为 19px／700。
- banner 品牌字为 36px／700，标语为 24px／700；窄窗口标语降为 22px。
- chat 字体与字号保持原有定义。

## Layout

- post 最小窗口为 900×560，居中外框最大宽度为 1120px；默认两侧总留白为 64px。
- 顶部 banner 高 112px，包含现有微博标志、微博字样、“随时随地发现新鲜事”和群聊切换入口。
- 主体为左侧微博流＋右侧 300px 工具栏。窗口宽度不超过 1100px 时，外侧总留白改为 32px，右栏为 260px，banner 高为 96px。
- 正文面板标题高不小于 48px，正文独立滚动；右栏整体独立滚动，博主列表最大高为 336px，确保小窗口所有入口均可触达。
- 右栏按“日期选择 → 博主管理”排列。日历星期一开头，日期格高 36px，空日期不可点，有内容日期显示圆点。
- 年月下拉支持直接选择，前后月按钮在数据范围边缘禁用。导航月份不发请求；选择有效日期才读取当日内容。
- 添加博主与同步历史并排，按钮最小高 32px；同步按钮常驻，选中单个博主后可用。
- 博文头像为 48px 方形，博主列表头像为 40px 方形。条目左右间距 12px，正文容器内边距 18px，条目上下内边距 18px。
- 元信息移至内容之后，与“查看原文”同行；长来源允许截断，不增加社交操作。
- chat 的标题栏 38px、侧栏 280px、工具栏 48px 与输入区 154px 保持不变。

## Elevation & Shapes

- post 按钮、转发框和弹窗为 3px 圆角；头像为 1px 圆角；连续微博流为直角、无独立卡片投影。
- 面板与控件使用 1px 蓝色描边，头像为 2px 浅色描边；图片为 1px 浅色描边。
- 弹窗投影为 0 12px 36px rgb(0 12 28 / 55%)，弹窗遮罩为 rgb(0 12 28 / 65%)。
- 原图查看器遮罩为 rgb(0 12 28 / 90%)，图片保留 3px 浅色边框。
- 焦点环为 3px solid var(--focus)，外扩 2px。
- chat 延续既有 inset 高光暗边与气泡、浮控、弹窗三级模糊投影，不受 post 影响。

## Components

- 星空背景只用于页面外层；正文使用稳定深色底。
- 微博条目连续排列，以细线分隔；转发为深蓝内嵌面板。
- 日期格使用原生按钮和完整日期可访问名称；选中态、无内容禁用态与内容圆点分开表达。
- 搜索、添加、历史采集、扫码与图片查看器沿用现有交互，配色统一为星空皮肤。
- 不混入米纸、铅笔点阵、斜纹填充、旋转按钮或硬偏移纸片阴影。

## Historical reference

原纸感皮肤与三栏几何测量保留在 Git 历史和 frontend/tests/fixtures/post-geometry.json，仅作为迁移存档，不再作为 post 当前视觉验收依据。当前布局决策见 docs/adr/0009-post-starry-calendar-layout.md。
