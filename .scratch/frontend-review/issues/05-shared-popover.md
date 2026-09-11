# 05 — shared：popover 弹层组件，三处弹层接入

**What to build:** 抽出 shared 弹层组件：open(anchor) 视口夹取定位、外点关闭、Esc 关闭、可选的关闭回调。表情面板、回归庆祝弹层、盗梦空间弹层三处手写的定位与关闭逻辑全部替换。三处现有交互（锚点跟随、入口点击不误关、滚动收起等）保持不变。

**Blocked by:** 03（shared 目录已就位）。

**Status:** ready-for-agent

- [ ] shared/popover.js：定位夹取（含上下翻转）、document 外点关闭、Esc 关闭
- [ ] 表情面板接入，保留懒构建与 Escape 关闭行为
- [ ] 庆祝弹层接入，保留「点在 message-sender/庆祝名单按钮上不关闭」的特殊规则
- [ ] 盗梦弹层接入，保留悬停探测与滚动收起行为
- [ ] 三处页内定位/关闭代码删除

## Comments
