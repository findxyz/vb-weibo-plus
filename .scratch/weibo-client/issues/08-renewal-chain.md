Status: ready-for-agent

## What to build

续期链端到端：用户调 `POST /weibo/login/renew`，LoginRenewApi 编排四步（updatetgt -> crossdomain -> 刷新 passport.weibo.com -> 刷新 passport.weibo.cn），合并 Set-Cookie 更新 SSOLoginState/ALF（SUB/SUBP 不变），返回 LoginRenewResponse{success, message}。

具体范围：
- WeiboCookieHolder.mergeRenewal(List<String> setCookies)：双重过滤（domain=.weibo.com + name∈{SSOLoginState,ALF}）合并续期新值，SUB/SUBP 不动，拼回新串调 set()
- LoginRenewApi（@Component，注入 WeiboHttpClient、WeiboCookieHolder）编排四步：
  1. updatetgt.php：params={entry=account, callback=cb}，HEADERS_RENEW，withCookie=true；校验 body 含 retcode:0
  2. crossdomain.php：params={action=login, domain=sina.com.cn, callback=cb, sr=1920*1080}；剥 JSONP 壳（取第一个 `(` 与最后一个 `)` 之间）解析取 arrURL
  3. 遍历 arrURL，每个追加 &callback=cb：
     - URL 含 passport.weibo.com：调 client.getForString 拿响应头，读 Set-Cookie 调 holder.mergeRenewal()；不解析 body（单引号 JSONP 非合法 JSON）
     - URL 含 passport.weibo.cn：剥壳校验 retcode=20000000，忽略 deleted cookie
- 私有方法 stripJsonp(String body) -> String：取第一个 `(` 与最后一个 `)` 之间内容
- WeiboLoginRenewController（@RestController，@RequestMapping("/weibo/login")）：POST /renew 调 LoginRenewApi.renew() 返回 LoginRenewResponse{boolean success, String message}

## Acceptance criteria

- [ ] POST /weibo/login/renew 成功返回 {success:true, message:"续期成功"}（或类似）
- [ ] updatetgt 返回 retcode 非 0 时 success=false + message 说明
- [ ] crossdomain 返回 arrURL 被正确解析
- [ ] passport.weibo.com 的 Set-Cookie 被读取并合并（SSOLoginState/ALF 更新）
- [ ] passport.weibo.cn 的 SUB=deleted/SUBP=deleted 不影响 .weibo.com 域（domain 过滤）
- [ ] mergeRenewal 双重过滤：domain 不是 .weibo.com 跳过，name 不是 SSOLoginState/ALF 跳过
- [ ] 续期后 SUB/SUBP 保持扫码登录值不变
- [ ] 续期后新凭证回写 .weibo_cookie.txt
- [ ] 任一步失败返回 {success:false, message:说明哪步失败}
- [ ] 续期链请求带 RENEW header 组（Referer: weibo.com）+ Cookie

## Blocked by

- 02-credential-holder-and-qr-login
- 03-weibo-http-client-core
