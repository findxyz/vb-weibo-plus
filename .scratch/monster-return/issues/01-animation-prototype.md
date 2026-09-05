# 怪兽回归动画原型

Type: prototype
Status: resolved

## 问题

能否用 MonsterDeleter 的怪兽动作，演示群成员久未发言后回归的庆祝效果？

## 结果

独立原型已完成，位于 codex/monster-return-prototype 分支的 src/main/resources/static/chat/monster-prototype/。播放地址与启动方式见该目录 README.md。

原型验证了透明图集与 Canvas 时间轴可以组合入场、指点、踢击、爆炸、雷欧登场与飞离。使用模拟聊天和潜水卡片，未接入真实消息。支持重播、暂停、跳过和拖动进度。

浏览器已检查默认宽度、390 像素窄屏、指点和欢迎画面、跳过与重播；JavaScript 语法检查通过。素材当前约 17.5 MB，正式实现需要压缩。

## 待用户评估

整体观感、角色尺寸与演出时长尚待用户确认。正式接入是后续工作，本次只交付可播放原型。
