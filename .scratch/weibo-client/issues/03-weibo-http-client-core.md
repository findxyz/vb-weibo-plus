Status: ready-for-agent

## What to build

WeiboHttpClient 核心：装配公共 header（从 WeiboConstants 选组）、按 withCookie 追加 Cookie、发起 RestTemplate 请求、应对公共错误。两个方法：getForString（JSON 文本 + 响应头）、getForBytes（二进制 + 响应头）。

具体范围：
- WeiboHttpClient（@Component，注入 RestTemplate、WeiboCookieHolder、ObjectMapper）
- getForString(url, params, headers, withCookie) -> ResponseEntity<String>：用于 JSON 接口与续期链
- getForBytes(url, params, headers, withCookie) -> ResponseEntity<byte[]>：用于群聊 msget 与图床/视频直链
- 公共错误应对（两方法统一）：
  - 429：指数退避 4^n 秒重试（n=1,2,3），耗尽抛 WeiboRateLimitException
  - 414：立即抛 WeiboUriTooLongException
  - 302 且 Location 命中 LOGIN_DOMAIN_REGEX：抛 WeiboCookieExpiredException；其余 3xx 抛 WeiboException
  - 200 且 body 为 JSON 含 error_code=21301 或 error=relogin!：抛 WeiboCookieExpiredException（JSON 解析失败则跳过，兼容 JSONP）
  - getForBytes 不检查 body（只看状态码）
- withCookie=true 时从 holder 取 Cookie 追加到 header；holder 无值抛 WeiboCookieExpiredException("未登录，无可用 Cookie")
- URI 组装：UriComponentsBuilder，params 的 null/空值跳过
- header 装配：headers 参数直接放入（Api 层从 WeiboConstants 选组），withCookie 决定是否追加 Cookie

## Acceptance criteria

- [ ] getForString 发 GET 请求返回原始 body + 响应头
- [ ] getForBytes 发 GET 请求返回二进制 + 响应头
- [ ] 429 响应触发指数退避重试（4s/16s/64s），耗尽抛 WeiboRateLimitException
- [ ] 414 响应立即抛 WeiboUriTooLongException
- [ ] 302 跳登录域抛 WeiboCookieExpiredException，其余 3xx 抛 WeiboException
- [ ] 200 + body 含 error_code=21301 抛 WeiboCookieExpiredException
- [ ] 200 + body 非 JSON（JSONP）不误触发 21301 判定
- [ ] withCookie=true 但 holder 无值抛 WeiboCookieExpiredException("未登录")
- [ ] withCookie=false 不追加 Cookie
- [ ] params 中 null/空值的参数不出现在 query string

## Blocked by

- 01-scaffold-and-config
