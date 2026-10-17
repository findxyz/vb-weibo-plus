# 验收缺陷 03：最小桌面媒体撑出正文栏

**Status:** resolved

日期：2026-10-17。任务 17 的跨功能组合在 900×560 复现；1280／1600 同路径通过。

正文栏 clientWidth=399、scrollWidth=451；267px 宽的 post-body 被自动网格最小宽度撑出 346px 轨道，转发视频和 120px 图片又溢出。与既定最小桌面可用性不符。

最小修复：正文／转发网格使用可收缩单列，媒体最大宽度不超过容器，九宫格与失败视频占位按原比例收缩。常规桌面的 120px／100px 缩略图、320px 视频及卡片几何继续对照旧版。无隐藏内容、横向裁剪或新尺寸令牌。

证据：react-post-acceptance-combined.log、react-post-acceptance-media-red.log；测试输出 media-bounds.json、combined-media.png。

## Answer

3193fd9 修复。三尺寸组合、最小桌面的单图／方形缩略图／失败视频比例、既有图片／视频／元信息旧版几何通过；Java 生成资源及最终 JAR 的三尺寸路径无横向溢出，截图人工检查通过。绿日志为 react-post-acceptance-media-fixed.log、slices.log；完整验证见任务 17。
