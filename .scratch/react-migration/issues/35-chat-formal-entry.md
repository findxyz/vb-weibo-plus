# 35：正式 chat 入口切换与迁移收尾

**Status:** resolved

**Blocked by:** 34，已完成。

日期：2026-10-18。用户在任务 34 完成后要求完成剩余迁移。沿用 codex/react-migration 主工作目录，不新增分支或 worktree。

## 范围与成功标准

1. React 接管 /chat/index.html；开发与发布的 post／chat 使用同源互跳，结束两个 preview 入口。
2. 日期、链接与存储键保持单一来源，迁入 frontend/src/shared；表情映射改为普通模块，不再依赖 window 全局变量。共享 logo、favicon 与梦境页面归属 frontend，保持现有资源 URL。
3. 删除被替代的旧 chat、DOM 工厂及其共享运行时，撤下旧实现专用测试；React 行为回归保留，Java 验证实际 classpath 资源、正式页及互跳。历史规格／审查不改写为新实现。
4. 不改变后端、接口、数据库或业务行为，不恢复怪兽欢迎，不扩大视觉改造。
5. 旧包回退基线为 68b0dec 和 target/react-migration-release/ticket-34。已核对 JAR SHA-256：53a726f35e46667ee00de38ec943ce67429d5c4d593a2c47ca989455c1853c7d；7z：16eee75e2276c51ba4e959ee947d9859c41a07ae31c5f9a4bed24b6cd235c175。干净构建前保留所有既有发布包。

## 验证

- [x] frontend 的手写源码不再引用 src/main/resources/static，普通表情和图片短语行为不变。
- [x] 两个正式页可直接打开／刷新并互跳，开发不跳到旧后端页面。
- [x] 两个 preview、旧 chat 脚本／CSS、旧 shared 运行时均不再提供；梦境与 favicon 仍可加载。
- [x] 前端完整回归、类型／构建、干净 Maven verify 通过，测试替换与计数变化如实记录。
- [x] 独立最终 JAR 三尺寸、资源 MIME、惰性分析模块、业务替身与隔离数据库通过。
- [x] 保存最终包与哈希，差异复核、README／路线图与回退说明更新；不部署用户运行环境。

## 实施与证据

按共享源码归属、正式入口／测试与旧实现退役、最终发布验证三个增量推进。发送、扫码、采集与分析写请求均使用本地替身；JAR 使用临时 SQLite、缺失 Credential 与空自动采集群号。

### 实施

- `frontend/chat/index.html` 与 `src/chat/main.tsx` 成为正式 chat 入口；`vite.config.ts` 构建 post／chat 两个 HTML，开发服务器直接提供 `/chat/index.html` 与 `/post/index.html`，旧 `frontend/preview/chat` 已删除。
- `frontend/src/shared` 持有日期、链接化、存储键与品牌素材；表情映射改为 `src/chat/emoji-map.js` 模块；favicon 与梦境页移入 `frontend/public`，保持原 URL。
- 旧 chat 脚本、样式、共享运行时与 `src/main/resources/static` 旧资源全部删除；两页互跳分别指向 `/post/index.html` 与 `/chat/index.html`。
- 前端测试改写为正式入口验收（chat 86 项、post 123 项），Java 的 `GroupChatPageTest` 改为 6 项实际 classpath 资源验收，`PostPageTest` 18 项；旧 chat 专用测试随实现删除。

### 验证

- 前端：`npm run typecheck`、`npm run build` 通过；`npx playwright test` 209 项通过（chat 86、post 123）。
- 干净构建：`mvn clean verify` **335 项通过，0 失败／错误／跳过**，JAR 与 7z 重新打包成功。
- 最终 JAR 冒烟（`jar-smoke.py` + `jar-smoke.mjs`）：900×560、1280×800、1600×900 三尺寸下正式页、历史筛选／采集与分析的本地路径、二维码／409／采集替身、盗梦空间 iframe、两页往返与资源 MIME 全部通过；数据库在写入替身前后逐行一致；分析结果的脚本被净化。
- 证据：`.scratch/react-migration/audits/2026-10-18-chat-cutover/evidence/`（acceptance.json、artifact.json、application.log、三尺寸截图）。
- 最终包：`target/react-migration-release/ticket-35/weibo-plus.jar`（SHA-256 `363EA930615F85E1F14E1CB5407A1ECFE35FBA4A64377FA690A9D6EA693926C3`）、`weibo-plus.7z`（SHA-256 `51A3EC53C2FC7E34714DADF4792861E76740939420FFDB9B3FD71064234CF90E`）。既有 ticket-04 至 34 包已先复制到仓外再恢复，未丢失。
- 回退基线：提交 `68b0dec` 与 `target/react-migration-release/ticket-34`（JAR `53A726F3…C1853C7D`、7z `16EEE75E…CD235C175`）。
- 测试计数变化：旧 chat 的 82 项 Java 行为测试被 6 项 classpath 验收取代；前端 chat 从 62 项增加到 86 项正式入口与验收用例；post 123 项不变。
- 未部署用户运行环境，未替换正在运行的后端；按约定另行处理。

### 差异复核

- 后端接口、数据库、业务行为与皮肤未改动；仅前端入口、资源归属和测试替换。
- 旧 `/preview/chat/index.html`、`/preview/post/index.html` 返回 404；梦境页与 favicon 仍为 200。
- 旧静态源码与新源码不再共存，源码目录中没有 `src/main/resources/static` 引用。
