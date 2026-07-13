Status: ready-for-agent

# PRD：移除续期接口

## Problem Statement

单用户本地工具的 `/weibo/login/renew` 端点及其完整实现仍然在线，但调研已证明它对项目使用的二维码登录态有破坏性：续期前受保护接口返回 200，调用 `/renew` 四步均业务成功后，5 秒后受保护接口变为 401，恢复原四字段仍 401。根因是二维码登录生成的 Credential 缺少旧版更新器要求的 `et` 字段，无论等待多久都不会进入续期窗口，而跳过前置检查直接调用旧接口链会使原凭证失效却不返回新的 `.weibo.com` 域 SUB/SUBP。保留这个端点等于保留一个会主动毁掉有效登录态的入口。

## Solution

移除 `/weibo/login/renew` 端点及其全部依赖：删除续期编排类、续期响应 record、续期测试类；从 Controller 去掉端点与注入；从 Cookie 持有者删除续期合并方法及其私有辅助方法；从常量类删除续期专用 header 组；清理 HTTP 调试文件中的续期请求段；清理活词汇表中的 Renewal 术语；删除接口原始文档中的续期章节。凭证失效后的恢复路径保持现有机制：受保护接口返回 401 时重新扫码。

## User Stories

1. 作为单用户，我不想再有一个会破坏有效登录态的 `/weibo/login/renew` 端点存在，以便不会误调导致凭证失效。
2. 作为单用户，我想删除续期编排类，以便代码库不再包含已证明无效的四步链实现。
3. 作为单用户，我想删除续期响应 record，以便不残留只被续期链引用的死代码。
4. 作为单用户，我想删除续期测试类，以便测试套件不再覆盖已移除的端点。
5. 作为单用户，我想从登录 Controller 移除续期端点与续期编排类的注入，以便 Controller 只保留扫码登录。
6. 作为单用户，我想从 Cookie 持有者删除续期合并方法及其私有辅助方法，以便不残留只服务于续期链的死代码。
7. 作为单用户，我想从常量类删除续期专用 header 组，以便 header 组只保留实际使用的四组。
8. 作为单用户，我想从 HTTP 调试文件删除续期请求段，以便调试文件只含可用端点。
9. 作为单用户，我想从活词汇表删除 Renewal 术语，以便领域语言反映"扫码登录 + 失效重登"的现状而非已移除的续期链。
10. 作为单用户，我想从接口原始文档删除续期章节，以便文档不再描述已移除的能力。
11. 作为单用户，我想删除后 `mvn clean test` 通过，以便确认没有残留编译错误或测试失败。
12. 作为单用户，我想删除后生产与测试源码中 renew 零残留，以便确认清理彻底。

## Implementation Decisions

### 删除范围

删除三个文件：
- 续期编排类（四步链编排：updatetgt -> crossdomain -> 遍历 arrURL 跨域刷新）
- 续期响应 record（`{boolean success, String message}`，只被续期链和续期测试引用）
- 续期测试类（整个类只测 `/renew` 端点，三个测试方法均为 renew 场景，类注释明说"不测 Playwright 扫码 /qr"）

### 编辑范围

**登录 Controller**：
- 删除续期编排类的 import 与续期响应 record 的 import
- 删除续期编排类字段
- 构造器去掉续期编排类参数与赋值
- 删除 `POST /renew` 端点方法
- 保留 `POST /qr` 不动

**Cookie 持有者**：
- 删除续期合并方法（合并 Set-Cookie，双重过滤 domain=.weibo.com + name=SSOLoginState，同步 ALF）
- 删除只服务于该方法的三个私有辅助方法（cookie 串解析、按固定顺序拼回、单字段追加）
- 删除因该方法而存在的 import（List、LinkedHashMap、Map），仅当 get/set/init 不依赖它们时删
- 类注释中"续期链回写"改为"扫码登录回写"
- 保留 get/set/init/cookie 字段/@PostConstruct 不动

**常量类**：
- 删除续期专用 header 组（UA + Referer: weibo.com，注释"续期链 4 步"）
- 类注释"五组 header"改为"四组 header"
- 保留 AJAX/WEBIM/MSGET/DIRECT 四组不动

**HTTP 调试文件**：
- 删除续期请求段（注释 + POST 行）

**活词汇表（CONTEXT.md）**：
- 删除 Renewal 条目及 _Avoid_（refresh, keepalive）
- Credential 条目中"SSOLoginState and ALF are timestamps refreshed by the renewal chain"改为"obtained at QR login"
- "SUB/SUBP are the unique login tokens (never refreshed by renewal)"删去"by renewal"
- 引言保持"扫码登录"语义不动

**接口原始文档（WEIBO_API_RAW.md）**：
- 登录总览改为"扫码登录获取凭证 + Cookie 失效后重登"，删"续期链保活"
- 流程图删除 Renewal 子图及相关节点/连线，保留扫码登录 -> Ready -> Cookie 失效重登主线
- 扫码登录说明中"续期链不刷新"改为"扫码登录时获得，后续不刷新"
- 删除续期触发、取跨域 URL、跨域刷新 passport.weibo.com、跨域刷新 passport.weibo.cn 四个章节
- 保留扫码登录章节与后续非续期章节不动

### 凭证失效恢复路径

不变。受保护接口返回 401（WeiboCookieExpiredException 经 WeiboExceptionHandler 映射）时，由用户手动调 `POST /weibo/login/qr` 重新扫码。无自动重登、无定时续期。

### ADR

- ADR-0001（单用户本地工具）不受影响，保持有效。

## Testing Decisions

### 测试 seam

不新增测试。删除续期测试类后，登录 Controller 的 `/qr` 端点保持零自动测试覆盖（与现状一致，因为扫码需真实浏览器与人工扫码，留作手动验证）。

### 测试原则

- 删除任务不为新行为写测试
- 验证靠编译与现有测试通过，不新增测试

### 验证标准

- `mvn clean test` 通过（删 renew 后剩余源码编译且测试通过）
- 全仓 `grep -rn "Renew|renew|mergeRenewal|HEADERS_RENEW"` 在 `src/` 下零命中
- `CONTEXT.md` 不再含 Renewal 术语
- `WEIBO_API_RAW.md` 不再含续期章节

## Out of Scope

- 回溯修改 `.scratch/weibo-client/PRD.md` 与 issues/ 下已完成 issue 的描述（历史 issue tracker 记录，非代码面）
- 修改 `.idea/` 下的 IDE 私有缓存（httpRequests 历史、workspace.xml 运行配置）
- 修改 `docs/research/weibo-renewal.md`（调研结论的来源文档，本 PRD 的依据，保持原样）
- 新增 `/qr` 端点的 mock 测试（扫码需真实浏览器与人工扫码，留作手动验证）
- 新增 Edge cookie 导出接口（已否决，Edge 侧同为扫码登录不会比应用活更久）
- 实时推送架构（常驻 headless Chromium + CometD hook，当前只需按需拉历史，属过度设计）

## Further Notes

- 本 PRD 的依据是 `docs/research/weibo-renewal.md`（commit 5b4bdac，2026-07-13），调研已证明续期链对二维码登录态有破坏性。
- 续期链的历史 issue `.scratch/weibo-client/issues/08-renewal-chain.md` 状态为 `ready-for-agent`，本 PRD 实质上将其标记为废弃。
