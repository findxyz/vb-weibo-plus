# 怪兽回归动画原型

验证问题：MonsterDeleter 的原角色动作，能否组成适合群聊的回归庆祝演出？

当前为一版独立原型，使用模拟消息，无数据持久化，不触发文件或消息删除。目标是包住成员头像的水泡，怪兽轻戳后水泡破裂、头像亮起并显示“已冒泡”。角色动作使用透明 PNG 图集，Canvas 根据时间选帧。支持重播、暂停、继续、跳过、拖动进度与修改成员名。总时长 9 秒，当前无音效。

在仓库根目录运行：

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory src/main/resources/static
```

打开 <http://127.0.0.1:8765/chat/monster-prototype/>。

## 素材来源

六张图集原样来自 <https://github.com/531149627/MonsterDeleter/tree/main/assets>，下载日期为 2026-09-05。原项目说明仅供娱乐与学习。图集布局为 5 列、3 行。爆炸素材取帧时裁去分隔线边缘。

素材合计约 17.5 MB，当前优先验证动作。正式接入前需要针对显示尺寸缩减图集、确认素材使用范围，再接入现有 spawnCelebration 入口与生命周期。

原型保存在 codex/monster-return-prototype 分支。待用户判断观感后，再决定是否将演出接入真实群聊。
