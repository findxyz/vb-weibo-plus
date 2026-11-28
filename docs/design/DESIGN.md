---
version: alpha
name: vb-weibo-plus
description: >-
  微博辅助客户端 vb-weibo-plus 的双皮肤设计体系：「蔚蓝拟物」桌面窗格皮肤（chat.css）
  与「现代极简 shadcn/ui」博文阅读皮肤（post.css）。chat 令牌沿用源码，post 采用
  UI SDK 无样式组件与 shadcn/ui preset b1ZjA4vKa（base-lyra、taupe 暖灰中性色与蓝色主强调色）
  浅色／深色 OKLCH 语义令牌，作为后续界面扩展与一致性的唯一令牌依据。
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
  post-background: "oklch(1 0 0)"
  post-sidebar: "oklch(0.986 0.002 67.8)"
  post-card: "oklch(1 0 0)"
  post-popover: "oklch(1 0 0)"
  post-foreground: "oklch(0.147 0.004 49.3)"
  post-primary: "oklch(0.488 0.243 264.376)"
  post-primary-foreground: "oklch(0.97 0.014 254.604)"
  post-primary-hover: "oklch(0.424 0.199 265.638)"
  post-primary-soft: "oklch(0.955 0.028 258)"
  post-sidebar-primary: "oklch(0.546 0.245 262.881)"
  post-muted: "oklch(0.96 0.002 17.2)"
  post-muted-foreground: "oklch(0.51 0.02 43.1)"
  post-accent: "oklch(0.96 0.002 17.2)"
  post-accent-foreground: "oklch(0.214 0.009 43.1)"
  post-border: "oklch(0.922 0.005 34.3)"
  post-border-strong: "oklch(0.84 0.008 38)"
  post-ring: "oklch(0.546 0.245 262.881)"
  post-link: "oklch(0.488 0.243 264.376)"
  post-destructive: "oklch(0.577 0.245 27.325)"
  post-destructive-soft: "oklch(0.971 0.013 17.38)"
  post-destructive-border: "oklch(0.885 0.062 18.334)"
  post-verified: "oklch(0.666 0.179 58.318)"
  post-success: "oklch(0.527 0.154 150.069)"
  post-mark-bg: "oklch(0.945 0.129 101.54)"
  post-mark-fg: "oklch(0.147 0.004 49.3)"
  post-highlight: "oklch(0.945 0.036 258)"
  post-dark-background: "oklch(0.147 0.004 49.3)"
  post-dark-sidebar: "oklch(0.214 0.009 43.1)"
  post-dark-card: "oklch(0.214 0.009 43.1)"
  post-dark-popover: "oklch(0.214 0.009 43.1)"
  post-dark-foreground: "oklch(0.986 0.002 67.8)"
  post-dark-primary: "oklch(0.424 0.199 265.638)"
  post-dark-primary-foreground: "oklch(0.97 0.014 254.604)"
  post-dark-primary-hover: "oklch(0.488 0.243 264.376)"
  post-dark-primary-soft: "oklch(0.28 0.075 262)"
  post-dark-sidebar-primary: "oklch(0.623 0.214 259.815)"
  post-dark-muted: "oklch(0.268 0.011 36.5)"
  post-dark-muted-foreground: "oklch(0.714 0.014 41.2)"
  post-dark-accent: "oklch(0.268 0.011 36.5)"
  post-dark-accent-foreground: "oklch(0.986 0.002 67.8)"
  post-dark-border: "oklch(1 0 0 / 10%)"
  post-dark-border-strong: "oklch(1 0 0 / 18%)"
  post-dark-ring: "oklch(0.623 0.214 259.815)"
  post-dark-link: "oklch(0.707 0.165 254.624)"
  post-dark-destructive: "oklch(0.704 0.191 22.216)"
  post-dark-destructive-soft: "oklch(0.24 0.06 20)"
  post-dark-destructive-border: "oklch(0.42 0.12 22)"
  post-dark-verified: "oklch(0.769 0.188 70.08)"
  post-dark-success: "oklch(0.792 0.209 151.711)"
  post-dark-highlight: "oklch(0.26 0.068 262)"

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
  post-ui:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 14px
    fontWeight: 500
  post-heading:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 16px
    fontWeight: 600
rounded:
  sm: 3px
  md: 4px
  control: 5px
  pill: 999px
  post-sm: 6px
  post-md: 8px
  post-lg: 10px
  post-xl: 12px
  post-avatar: 9999px
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
    textColor: "{colors.post-foreground}"
    typography: "{typography.post-content}"
    rounded: "{rounded.post-feed}"
  retweet-note:
    backgroundColor: "{colors.post-muted}"
    textColor: "{colors.post-foreground}"
    typography: "{typography.retweet-content}"
    rounded: "{rounded.post-lg}"
  post-button:
    backgroundColor: "{colors.post-background}"
    textColor: "{colors.post-foreground}"
    height: 32px
    rounded: "{rounded.post-sm}"
  post-button-primary:
    backgroundColor: "{colors.post-primary}"
    textColor: "{colors.post-primary-foreground}"
    height: 36px
    rounded: "{rounded.post-sm}"
  post-input:
    backgroundColor: "{colors.post-background}"
    textColor: "{colors.post-foreground}"
    height: 36px
    rounded: "{rounded.post-sm}"

---

## Overview

两套独立皮肤互不混用：

- **蔚蓝拟物（chat.css）**：沿用现有 Windows Aero 桌面窗格、蓝色高光渐变与浅色气泡。
- **现代极简 shadcn/ui（post.css）**：基于 `@ui-sdk/react` 无样式交互组件、`lucide-react` 图标与 shadcn/ui 预设 `b1ZjA4vKa`（`base-lyra`、`taupe` 暖灰底色 + Royal Blue 蓝色主强调色，OKLCH 浅色／深色语义令牌）构建的全视口三栏阅读工作台。默认浅色主题，支持右上角切换深色主题并持久化至本地存储。它替代原来的星空微博皮肤，不再使用星空背景图。

## Colors

chat 继续使用 YAML 中原有拟物令牌。post 仅使用 post 前缀令牌，在 `post.css` 中映射为自包含的 OKLCH 语义 CSS 变量（`:root` 定义浅色值，`:root[data-theme="dark"]` 覆盖深色值），色值源自 shadcn/ui 预设 `b1ZjA4vKa`：

| CSS 变量 | 浅色令牌 | 深色令牌 | 用途 |
|---|---|---|---|
| `--surface` | `post-background` | `post-dark-background` | 正文画布与输入框底色 |
| `--bg` | `post-sidebar` | `post-dark-sidebar` | 左右侧栏暖灰底色 |
| `--card`／`--popover` | `post-card`／`post-popover` | `post-dark-card`／`post-dark-popover` | 弹窗、浮层与状态卡片底色 |
| `--text`／`--muted` | `post-foreground`／`post-muted-foreground` | `post-dark-foreground`／`post-dark-muted-foreground` | 主正文与次要元信息文字 |
| `--primary`／`--primary-fg` | `post-primary`／`post-primary-foreground` | `post-dark-primary`／`post-dark-primary-foreground` | 蓝色主提交按钮、选中博主、日历选中日与点赞选中态 |
| `--sidebar-primary`／`--primary-soft` | `post-sidebar-primary`／`post-primary-soft` | `post-dark-sidebar-primary`／`post-dark-primary-soft` | 进度条、日历内容圆点、转发左侧蓝线与柔和蓝悬停 |
| `--surface-muted`／`--accent` | `post-muted`／`post-accent` | `post-dark-muted`／`post-dark-accent` | 转发底色、计数徽章与按钮悬停底 |
| `--border`／`--border-strong` | `post-border`／`post-border-strong` | `post-dark-border`／`post-dark-border-strong` | 面板细分隔线与控件描边 |
| `--ring`／`--link` | `post-ring`／`post-link` | `post-dark-ring`／`post-dark-link` | 蓝色键盘焦点环、正文链接与转发作者 |
| `--destructive`／`--destructive-soft`／`--destructive-border` | `post-destructive` 系列 | `post-dark-destructive` 系列 | 错误提示、告警文字与登录失效卡片 |
| `--verified`／`--success` | `post-verified`／`post-success` | `post-dark-verified`／`post-dark-success` | 认证图标与同步成功指示点 |
| `--highlight-bg`／`--highlight-fg`／`--highlight-flash` | `post-mark-bg`／`post-mark-fg`／`post-highlight` | 对应深色令牌 | 搜索命中高亮与定位闪亮 |

所有正文与次要文字在浅色与深色两套底色上均满足 WCAG AA（≥ 4.5:1）对比度。禁用控件使用 50% 不透明度。

## Typography

- post 的 UI、标题与昵称使用现代无衬线字体栈 `system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`。
- 正文沿用 `QuoteFallback, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif`。
- `QuoteFallback` 仅覆盖 U+2018-2019、U+201C-201D 引号，本机来源为 Georgia、SimSun，不下载字体。
- 普通正文保持 15px／24px，转发正文保持 14px／24px；元信息为 12px 并启用 `tabular-nums`。
- 面板标题为 16px／600，正文作者与博主昵称为 15px／600（列表项 14px／500）。
- chat 字体与字号保持原有定义。

## Layout

- post 最小窗口为 900×560，全视口三栏布局（`100% × 100%`），无外层留白与背景壁纸。
- 三栏默认宽度为左栏 256px（博主管理）、中栏自适应（博文流）、右栏 280px（日期面板）；视口宽度不超过 1100px 时收窄为 224px／自适应／248px。
- 三栏顶部统一 64px 标题栏，由同一条 1px `--border` 底线贯穿对齐；左右侧栏与中间正文之间使用 1px `--border` 纵向分隔线。
- 正文区域独立滚动，宽屏下居中限制内容最大宽度 760px 以保证中文阅读行宽；左右侧栏各自独立滚动，博主列表占满左栏剩余高度。
- 右栏标题栏右侧放置浅色／深色主题切换图标按钮；中间标题栏右侧保留高级搜索与微博群聊按钮。
- 博文头像为 40px 圆形，博主列表头像为 32px 圆形。元信息位于正文与媒体之后，与点赞开关、点赞数及“查看原文”同行。
- chat 的标题栏 38px、侧栏 280px、工具栏 48px 与输入区 154px 保持不变。

## Elevation & Shapes

- 控件圆角：按钮与输入框 6px（`--radius-sm`），图片缩略图与列表项 8px（`--radius-md`），转发面板与状态卡 10px（`--radius-lg`），弹窗 12px（`--radius-xl`），头像 9999px 圆形；连续微博流为直角、无外层卡片投影。
- 控件描边使用 1px `--input`，面板与条目分隔使用 1px `--border`。
- 轻投影 `--shadow-xs`（`0 1px 2px rgb(9 9 11 / 5%)`）用于描边按钮与输入控件；浮层投影 `--shadow-md` 用于下拉菜单；弹窗投影 `--shadow-lg` 用于模态对话框；弹窗遮罩为 `rgb(9 9 11 / 50%)` 配合轻量背景模糊。
- 原图查看器遮罩为 `rgb(9 9 11 / 90%)`，操作控件采用半透明深色圆形按钮与药丸计数器。
- 键盘焦点环为 `2px solid var(--ring)`，外扩 2px。
- chat 延续既有 inset 高光暗边与三级投影，不受 post 影响。

## Components

- `post.css` 顶部声明 `@layer ui-sdk;`，所有交互组件使用 `@ui-sdk/react` 无样式原语并通过 `data-slot` 与状态属性（`data-open`、`data-selected`、`data-pressed`、`data-disabled`、`data-starting-style`、`data-ending-style`）着色。
- 图标统一使用 `lucide-react` 矢量图标（`aria-hidden="true"`），不再使用系统彩色 emoji 作为按钮装饰。
- 博主搜索框采用 `@ui-sdk/react/input` 的 `InputGroup`、`Input` 与 `InputClear`。
- 博主头像采用 `@ui-sdk/react/avatar`，认证标记采用 `BadgeCheckIcon`。
- 高级搜索、添加博主、同步历史与原图查看器统一采用 `@ui-sdk/react/dialog`，表单项采用 `@ui-sdk/react/field` 与 `@ui-sdk/react/input`，同步进度条采用 `@ui-sdk/react/progress`。
- 右侧日期面板采用 `@ui-sdk/react/calendar` 网格与 `@ui-sdk/react/select` 自定义年月下拉，保留星期一开头、无内容日期不可选、有内容日期显示圆点、导航年月不发请求及重复点击当前日期重新读取本地数据的行为。
- 点赞控件在状态已确认时采用 `@ui-sdk/react/toggle`，未知状态时采用禁用的 `@ui-sdk/react/button`（不输出 `aria-pressed`）。
- 连续阅读追加前一个有微博日期、登录恢复、搜索定位、媒体代理与查看器缩放拖拽逻辑保持不变。

## Historical reference

原纸感皮肤与星空微博皮肤的视觉决策保留在 Git 历史、`docs/adr/0009-post-starry-calendar-layout.md`、`docs/adr/0010-post-starry-three-column-and-flat-header.md` 与 `frontend/tests/fixtures/post-geometry.json`，仅作为历史存档。当前布局与组件体系见 `docs/adr/0012-post-modern-shadcn-ui-sdk.md`。
