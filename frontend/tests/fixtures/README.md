# post 几何基准

post-geometry.json 来自切换前提交 2cc6ef8 的旧正式 post。任务 18 在删除旧实现之前，以隔离 HTTP 数据在 Chrome 执行原有 15 项旧版／React 对照并保存旧版测量；15 项全部通过。包含桌面布局、窗控、弹窗、元信息、图片、视频与查看器。

此文件是固定的迁移验收基准，不包含旧页面可执行代码。变更布局时先对照 docs/design/DESIGN.md 和用户要求，明确说明基准变化；不要通过自动重录当前 React 输出来消除失败。原始测量环境为 Windows 与 Microsoft YaHei，字体或操作系统变化可能需要单独评估几何差异。
