# 图片加载失败后搜索目标偶发未重新居中

Status: needs-triage

日期：2026-10-25。

历史微博提交交互验收时，完整 post 页面回归 140 项通过，search_location_settles_delayed_media_image_error 失败。图片失败并隐藏后，目标卡片与阅读区域中心相差 25.5 像素，断言要求小于 3 像素。

复现命令（frontend 目录，Chrome）：

```powershell
$env:PREVIEW_BROWSER_CHANNEL = 'chrome'
node node_modules/@playwright/test/cli.js test post.spec.ts --grep search_location_settles_delayed_media_image_error --repeat-each=5
```

- 当前工作区独立复跑 5 次，4 次通过、1 次失败。
- 从 HEAD 06827efa7c359cb68328a9e1ec7970c5bc9a6ae6 提取隔离前端，原源码连续 10 次通过。
- 同一隔离目录只换入本次修改的前端源码，原测试复跑 10 次，9 次通过、1 次失败。
- 失败均发生在图片隐藏后的二次居中断言，偏移均为 25.5 像素。

本次修改未涉及 PostFeed、PostImages 或该测试；测试也未提交同步请求，没有同步提示节点。尚未证实与本次修改是否有关，不能仅凭原源码 10 次通过就归为既有问题。

后续可观察原生 error 捕获阶段的居中计算、React 图片隐藏提交与 requestAnimationFrame 的顺序，以及卡片高度变化。当前只有时序风险的代码线索，未取得足以确认根因的运行证据。本次未修改或放宽断言。
