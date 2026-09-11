# 05 — shared：popover 弹层组件，三处弹层接入

**What to build:** 抽出 shared 弹层组件：open(anchor) 视口夹取定位、外点关闭、Esc 关闭、可选的关闭回调。表情面板、回归庆祝弹层、盗梦空间弹层三处手写的定位与关闭逻辑全部替换。三处现有交互（锚点跟随、入口点击不误关、滚动收起等）保持不变。

**Blocked by:** 03（shared 目录已就位）。

**Status:** resolved

- [x] shared/popover.js：定位夹取（含上下翻转）、document 外点关闭、Esc 关闭
- [x] 表情面板接入，保留懒构建与 Escape 关闭行为
- [x] 庆祝弹层接入，保留「点在 message-sender/庆祝名单按钮上不关闭」的特殊规则
- [x] 盗梦弹层接入，保留悬停探测与滚动收起行为
- [x] 三处页内定位/关闭代码删除

## Comments

- 设计为两个可独立组合的能力而非单一 createPopover：三处调用面差异大（表情面板是 CSS 定位、盗梦无外点/Esc 关闭语义），`positionPopover(popover, anchor, {align, gap, margin, prefer})` + `attachDismiss(popover, close, {ignoreClosest})` 各取所需。
- 盗梦弹层翻转阈值由原来的「上方有 pop.height+12 即置上」统一为语义化的 gap+margin（+16），头像几乎不可能贴近视口顶部，实际无可见差异。
- 净变化：三处调用点 -37 行，shared/popover.js +65 行；commit a6e5520。
