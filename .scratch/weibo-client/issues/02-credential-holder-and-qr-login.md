Status: ready-for-agent

## What to build

扫码登录端到端：用户调用 `POST /weibo/login/qr`，Playwright 有头 Chromium 打开 https://api.weibo.com/chat，用户微博 App 扫码确认后，提取 .weibo.com 域的 SUB/SUBP/SSOLoginState/ALF 四字段，拼成 Cookie 串存入 WeiboCookieHolder 并写入 .weibo_cookie.txt。应用启动时自动读取 .weibo_cookie.txt 恢复登录态。

具体范围：
- WeiboCookieHolder（@Component）：volatile String cookie 内存缓存；@PostConstruct 读 .weibo_cookie.txt（不存在则 null 不报错）；set() 更新内存 + 回写文件（写失败只记日志不抛，以内存值为准）；mergeRenewal(List<String>) 供续期链用（本切片可不实现 mergeRenewal，留空或抛 UnsupportedOperationException）
- LoginApi（@Component）：Playwright.create() + chromium().launch(headless=false) + newContext() + newPage().navigate("https://api.weibo.com/chat")；轮询 ctx.cookies() 直到 .weibo.com 域出现非空 SUB，超时 weibo.qr-timeout-seconds（默认 300）；提取四字段，缺一抛 WeiboException("扫码登录不完整，缺少 X")；拼 Cookie 串调 holder.set()
- 扫码超时抛 WeiboException("扫码登录超时")
- 浏览器未安装抛 WeiboException 带 install chromium 提示
- WeiboLoginController（@RestController，@RequestMapping("/weibo/login")）：POST /qr 调 LoginApi.qrLogin() 返回 LoginResponse{sub,subp,ssoLoginState,alf}
- LoginResponse record

## Acceptance criteria

- [ ] 调用 POST /weibo/login/qr 后浏览器弹出，扫码成功后返回四字段
- [ ] 四字段拼成 `SUBP=..; ALF=..; SSOLoginState=..; SUB=..` 写入 .weibo_cookie.txt
- [ ] 应用重启后自动读取 .weibo_cookie.txt 恢复 holder 的 cookie
- [ ] 扫码超时返回 500 + "扫码登录超时"
- [ ] 浏览器未安装返回 500 + install chromium 提示
- [ ] 缺字段返回 500 + "扫码登录不完整，缺少 X"
- [ ] 写文件失败不抛异常，内存值仍可用

## Blocked by

- 01-scaffold-and-config
