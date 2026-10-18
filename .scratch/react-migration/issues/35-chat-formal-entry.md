# 35：正式 chat 入口切换与迁移收尾

**Status:** claimed

**Blocked by:** 34，已完成。

日期：2026-10-18。用户在任务 34 完成后要求完成剩余迁移。沿用 codex/react-migration 主工作目录，不新增分支或 worktree。

## 范围与成功标准

1. React 接管 /chat/index.html；开发与发布的 post／chat 使用同源互跳，结束两个 preview 入口。
2. 日期、链接与存储键保持单一来源，迁入 frontend/src/shared；表情映射改为普通模块，不再依赖 window 全局变量。共享 logo、favicon 与梦境页面归属 frontend，保持现有资源 URL。
3. 删除被替代的旧 chat、DOM 工厂及其共享运行时，撤下旧实现专用测试；React 行为回归保留，Java 验证实际 classpath 资源、正式页及互跳。历史规格／审查不改写为新实现。
4. 不改变后端、接口、数据库或业务行为，不恢复怪兽欢迎，不扩大视觉改造。
5. 旧包回退基线为 68b0dec 和 target/react-migration-release/ticket-34。已核对 JAR SHA-256：53a726f35e46667ee00de38ec943ce67429d5c4d593a2c47ca989455c1853c7d；7z：16eee75e2276c51ba4e959ee947d9859c41a07ae31c5f9a4bed24b6cd235c175。干净构建前保留所有既有发布包。

## 验证

- [ ] frontend 的手写源码不再引用 src/main/resources/static，普通表情和图片短语行为不变。
- [ ] 两个正式页可直接打开／刷新并互跳，开发不跳到旧后端页面。
- [ ] 两个 preview、旧 chat 脚本／CSS、旧 shared 运行时均不再提供；梦境与 favicon 仍可加载。
- [ ] 前端完整回归、类型／构建、干净 Maven verify 通过，测试替换与计数变化如实记录。
- [ ] 独立最终 JAR 三尺寸、资源 MIME、惰性分析模块、业务替身与隔离数据库通过。
- [ ] 保存最终包与哈希，差异复核、README／路线图与回退说明更新；不部署用户运行环境。

## 实施与证据

按共享源码归属、正式入口／测试与旧实现退役、最终发布验证三个增量推进。发送、扫码、采集与分析写请求均使用本地替身；JAR 使用临时 SQLite、缺失 Credential 与空自动采集群号。
