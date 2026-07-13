Status: ready-for-agent

## Parent

`.scratch/remove-renewal/PRD.md`

## What to build

清理续期相关文档与领域词汇。编辑 HTTP 调试文件：删除续期请求段（注释 `### 续期...` + `POST {{host}}/weibo/login/renew` 行）。编辑活词汇表（CONTEXT.md）：删除 Renewal 条目及 _Avoid_（refresh, keepalive）；Credential 条目中"SSOLoginState and ALF are timestamps refreshed by the renewal chain"改为"obtained at QR login"；"SUB/SUBP are the unique login tokens (never refreshed by renewal)"删去"by renewal"；引言保持"扫码登录"语义不动。编辑接口原始文档（WEIBO_API_RAW.md）：登录总览改为"扫码登录获取凭证 + Cookie 失效后重登"，删"续期链保活"；流程图删除 Renewal 子图及相关节点/连线，保留扫码登录 -> Ready -> Cookie 失效重登主线；扫码登录说明中"续期链不刷新"改为"扫码登录时获得，后续不刷新"；删除续期触发、取跨域 URL、跨域刷新 passport.weibo.com、跨域刷新 passport.weibo.cn 四个章节；保留扫码登录章节与后续非续期章节不动。

## Acceptance criteria

- [ ] HTTP 调试文件不再含续期请求段
- [ ] CONTEXT.md 不再含 Renewal 条目
- [ ] CONTEXT.md 的 Credential 条目不再提"renewal chain"
- [ ] CONTEXT.md 引言保持"扫码登录"语义不变
- [ ] WEIBO_API_RAW.md 登录总览不再含"续期链保活"
- [ ] WEIBO_API_RAW.md 流程图不再含 Renewal 子图
- [ ] WEIBO_API_RAW.md 不再含续期触发章节
- [ ] WEIBO_API_RAW.md 不再含取跨域 URL 章节
- [ ] WEIBO_API_RAW.md 不再含跨域刷新 passport.weibo.com 章节
- [ ] WEIBO_API_RAW.md 不再含跨域刷新 passport.weibo.cn 章节
- [ ] WEIBO_API_RAW.md 扫码登录章节与后续非续期章节保留不变

## Blocked by

None - can start immediately
