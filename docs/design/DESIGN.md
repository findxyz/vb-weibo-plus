---
version: alpha
name: vb-weibo-plus
description: >-
  微博辅助客户端 vb-weibo-plus 的双皮肤设计体系：「蔚蓝拟物」桌面窗格皮肤（chat.css）
  与「纸感手绘」博文阅读皮肤（post.css）。全部取值逐行抽取自前端源码，
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
  paper: "#fbf6ec"
  paper-tint: "#f5eedf"
  ink: "#2b2620"
  pencil: "#4d473d"
  rule: "#c8bfa9"
  grid-line: "#e3d8b8"
  sketch-accent: "#d8482b"
  sketch-hatch: "#b53a20"
  sketch-highlight: "#f9d27c"
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
    fontFamily: 'Tahoma, "Microsoft YaHei", "Microsoft JhengHei", SimSun, sans-serif'
    fontSize: 19px
    lineHeight: 1.55
  retweet-content:
    fontFamily: 'Tahoma, "Microsoft YaHei", "Microsoft JhengHei", SimSun, sans-serif'
    fontSize: 17px
    lineHeight: 1.55
  sketch-display:
    fontFamily: '"Microsoft YaHei", sans-serif'
    fontSize: 22px
    fontWeight: 800
    letterSpacing: "0.2px"
rounded:
  sm: 3px
  md: 4px
  control: 5px
  pill: 999px
  sketch-rounded-sm: 4px
  sketch-rounded-md: 8px
  sketch-rounded-card: 10px
  sketch-rounded-app: 12px
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
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.post-content}"
    rounded: "{rounded.sketch-rounded-card}"
  retweet-note:
    backgroundColor: "{colors.paper-tint}"
    textColor: "{colors.pencil}"
    typography: "{typography.retweet-content}"
    rounded: "{rounded.sketch-rounded-md}"
  sketch-action-button:
    backgroundColor: "{colors.sketch-accent}"
    textColor: "{colors.paper}"
    height: 34px
    rounded: "{rounded.sketch-rounded-sm}"
  sketch-input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    height: 36px
    rounded: "{rounded.sketch-rounded-sm}"
---

## Overview

vb-weibo-plus 的前端由两套独立皮肤组成，共用同一副「骨架习惯」：

- **蔚蓝拟物（chat.css，群聊客户端）**：Windows Aero 式高光渐变标题栏、内嵌阴影面板、四段蓝色渐变，制造「桌面软件」的实在感。
- **纸感手绘（post.css，博文阅读器）**：米纸底 + 22px 铅笔点阵、45° 斜线填充、硬偏移投影、±0.5–3° 微旋转与荧光笔涂选，制造「纸面草稿」的轻松感。

两套皮肤共享：Tahoma / 微软雅黑字体栈、浅色 `color-scheme`、3px 焦点环外扩 2px、最小窗宽 900px、计数用 `tabular-nums`。

一句话：**工具窗格用拟物表达「专业软件」，阅读界面用手绘表达「轻量纸面」，令牌互不混用。**

## Colors

- **primary（#086ce0）**：蔚蓝拟物皮肤唯一主操作色；新消息浮标、选中态、跟随指示。
- **amber（#f4a51d）**：拟物皮肤的「定位/激活」信号，只做 4px 内嵌条与目标消息描边，不做大面积填充。
- **sketch-accent（#d8482b）**：纸感皮肤的朱砂笔色，承担主按钮、链接、认证徽章、斜纹头像。
- **sketch-highlight（#f9d27c）**：荧光笔涂选色，永远以 skew(-7deg) 斜道或 28% 透明底出现。
- **titlebar 渐变**：`#1394fa 0 → #0879ed 28% → #0060d8 72% → #006bea 100%`，上覆 8px 白色高光（38% → 透明），下压 `inset 0 -2px 3px rgb(0 48 145 / 58%)` 暗边。
- **danger（#b42318）**：两套皮肤共用同一错误红；焦点色各皮肤独立（A 琥珀 #ffb020，B 朱砂 #d8482b）。

## Typography

- 全局唯一字体栈 `Tahoma, "Microsoft YaHei", "Microsoft JhengHei", SimSun, sans-serif`；post.css 有意让 `--serif/--hand/--mono` 全部指向微软雅黑，**不加载任何字体文件**。
- 字号阶梯：12/13 元信息与计数 → 14/15 工具与正文 → 16–18 面板/标题栏 → 19–22 内容与展示（post 正文 19px/1.55，标题 22px/800）。
- 时间、地区、计数一律 12px + `font-variant-numeric: tabular-nums`。

## Layout

- 4/8 基座间距习惯：4、8、10、12、14、16、18px。
- 结构尺寸：标题栏 38px（post 为 44px）、群列表侧栏 280px、工具/分页行 48px、输入区 154px；应用最小 900×560。
- 列表行：hover 用半透明白（A）或 28% 荧光黄（B）；激活态 A 用 4px 琥珀内嵌条，B 用 skew(-7deg) 荧光笔道。

## Elevation & Depth

- 拟物皮肤三级投影：气泡 `0 1px 2px rgb(31 63 89 / 10%)` → 浮动控件 `0 2px 8px rgb(17 67 115 / 28%)` → 对话框 `0 12px 36px rgb(0 35 85 / 38%)`；标题栏立体感完全依赖 inset 高光与暗部，不加外投影。
- 纸感皮肤全部为**硬偏移无模糊**阴影：近景 `2px 2px 0 -1px rgb(43 38 32 / 18%)`，卡片/对话框 `6px 8px 0 -3px rgb(43 38 32 / 18%–22%)`。

## Shapes

- 拟物皮肤是小圆角世界：2px 系统条、3/4px 输入与气泡、5px 窗控、6/7px 头像、16px 浮标、999px 胶囊。
- 纸感皮肤：4/8px 基础、卡片 10px、应用外框 12px；标准描边宽度 1.5px，卡片 2px，应用外框 3px。
- 纹理三件套（仅纸感皮肤）：22px 点阵纸纹（全局）、45° 斜纹填充（头像/空图位）、135° 影线（标题带，`rgba(0,0,0,.05) 0 2px / 透明 2px 6px`）。

## Components

- `titlebar`：四段渐变 + 高光 + 38px 高，白色文字带 `#003692` 1px 文字投影。
- `window-control`：28×26px 蓝渐变窗控，白描边、内嵌环与 1px 外投影；关闭钮为 `#ff9a73 → #e63c20` 红渐变，切换钮为绿渐变，沉浸激活为琥珀渐变，hover 统一 `brightness(1.08)`。
- `tool-button`：白→浅蓝渐变 + `#7f9fba` 描边，最小高 32px。
- `bubble`：白底 `#a7bdcd` 描边 4px 圆角，15px/1.55；系统消息为灰条 2px 圆角，管理消息为 `#fff3e0/#f0c78a` 暖黄变体。
- `attitude-chip`：胶囊表态符，选中态切 `primary-soft/primary/primary-strong` 三件套。
- `post-card`：2px 铅笔描边 10px 圆角米纸卡；转发为虚线便签（tint 底）；九宫格 120px 方格 + 空位显示斜纹 "img" 印章。
- `sketch-action-button`：朱砂底纸色字、`rotate(-0.6deg)`、hover `brightness(1.08)`；次级按钮 hover 换荧光黄底。

## Do's and Don'ts

**Do**

- 标题栏永远保留顶部高光 + 底部内嵌暗边，这是拟物皮肤的「玻璃感」来源。
- 激活/定位态统一交给琥珀（A）或荧光笔道（B），主操作色不参与状态表达。
- 链接一律带下划线：拟物皮肤实线 hover，纸感皮肤波浪线 hover 转实线。
- 焦点环固定 `3px solid <皮肤焦点色>` 外扩 2px，全组件一致。
- 小控件允许 ±0.5–3° 微旋转（仅纸感皮肤），营造手贴便签的松动感。

**Don't**

- 不要把标题栏四段渐变简化成纯色，也不要把渐变蔓延到内容区背景。
- 不要在两套皮肤间混用令牌：琥珀只属于拟物皮肤，荧光黄只属于纸感皮肤。
- 不要移除纸面点阵纹理；去掉它纸感皮肤就退化成普通米色页面。
- 不要给纸感皮肤加模糊投影——它只有硬偏移阴影。
- 不要在 900px 以下硬挤布局，这是桌面应用，最小窗宽是硬约束。
