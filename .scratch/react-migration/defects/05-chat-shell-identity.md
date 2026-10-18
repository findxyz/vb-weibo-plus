# chat 窗口标识与群号遗漏

日期：2026-10-18。来源：[任务 34 整页验收](../issues/34-chat-page-acceptance.md)。

## 对照与复现

旧 chat 的标题栏包含微博图标，head 声明 SVG favicon，会话头单独显示当前群号。React chat 遗漏三项；仅有群名和人数／消息数，重名群无法凭群号区分。

新增窗口图标／favicon 和切群后群号两项浏览器检查，修复前均失败。新版本补回相同图标、favicon 与群号行，人数和消息数仍独立刷新。标题栏图标大小沿用旧页 30 px，未引入新颜色、圆角或阴影。

图标复制到 frontend/src/chat/assets，保留旧版仍消费的原文件。favicon 沿用现有共享来源，最终归属整理仍由切换收尾票处理。

## 验证

修复后 7 项整页新增检查通过，涵盖图标实际加载、favicon 响应 MIME、切群群号更新及三尺寸组合。首次修复后 favicon 探针使用相对 URL，APIRequestContext 缺少 baseURL，产生 Invalid URL；修正探针为根据页面解析绝对地址后通过，不涉及应用行为调整。

红绿日志：.scratch/react-migration/chat-34-identity-red.log、chat-34-identity-green.log。
