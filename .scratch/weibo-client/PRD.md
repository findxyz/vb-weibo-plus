Status: ready-for-agent

# PRD：微博客户端服务

## Problem Statement

单用户需要一个本地工具来驱动一个微博账号的 Web/API 接口：扫码登录获取凭证、续期保活、拉取博主微博与长文、查看群聊列表与消息、下载群聊媒体文件、下载图床与视频直链。当前没有这些能力的封装，需要手动拼接请求头、处理 Cookie、应对公共错误，重复且易错。

## Solution

一个单用户本地运行的 Spring Boot Web 服务，封装微博 Web/API 接口为可手动调用的 HTTP 端点。核心是 WeiboHttpClient--装配公共 header、发起请求、应对公共错误（429 限流重试 / Cookie 失效抛异常 / 414 抛异常）。各接口分装为独立的 Api 类，经 Controller 暴露为 `/weibo` 前缀的端点。扫码登录用 Playwright 有头浏览器，凭证存于 `.weibo_cookie.txt`。

## User Stories

1. 作为单用户，我想扫码登录微博，以便获得后续所有接口所需的四字段凭证（SUB/SUBP/SSOLoginState/ALF）。
2. 作为单用户，我想扫码后凭证自动写入 `.weibo_cookie.txt`，以便下次启动时复用登录态。
3. 作为单用户，我想在启动时自动读取 `.weibo_cookie.txt` 恢复登录态，以便不必每次重新扫码。
4. 作为单用户，我想调用续期接口一键完成四步续期链，以便保活登录态不失效。
5. 作为单用户，我想续期后 SSOLoginState/ALF 取 .weibo.com 域新值而 SUB/SUBP 不变，以便凭证保持有效。
6. 作为单用户，我想续期后新凭证回写 `.weibo_cookie.txt`，以便下次启动用最新凭证。
7. 作为单用户，我想调用博主微博增量翻页接口（首页不传 since_id），以便获取某博主第 1 页微博。
8. 作为单用户，我想带上上一页的 since_id 翻下一页，以便逐页拉取博主微博。
9. 作为单用户，我想调用长文补全接口，以便获取 isLongText=true 的微博全文。
10. 作为单用户，我想调用博主微博时间范围拉取接口，以便获取某博主指定日期段的微博。
11. 作为单用户，我想时间范围拉取按 page 翻页，以便拉完该时段所有微博。
12. 作为单用户，我想调用群聊列表接口，以便获取我所有群聊的 gid 与名称。
13. 作为单用户，我想调用群聊消息接口（首页不传 max_mid），以便获取某群最新一批消息。
14. 作为单用户，我想带上上一页的 max_mid 翻更早的消息，以便逐页拉取历史消息。
15. 作为单用户，我想调用群聊媒体下载接口（msget），以便下载群聊里的图片或视频。
16. 作为单用户，我想调用图床直链下载接口，以便按图床 URL 下载微博正文图片。
17. 作为单用户，我想调用视频直链下载接口，以便按视频流 URL 下载微博正文视频。
18. 作为单用户，我想请求被 429 限流时自动指数退避重试（4^n 秒，最多 3 次），以便无需手动重试。
19. 作为单用户，我想重试耗尽时收到明确的限流错误（429），以便知道是限流而非其他问题。
20. 作为单用户，我想 Cookie 失效时收到 401 状态码，以便知道需要重新扫码登录。
21. 作为单用户，我想 URI 过长时收到 414 状态码，以便知道是参数过多导致。
22. 作为单用户，我想微博业务错误时收到 502 状态码及 error_code，以便定位业务问题。
23. 作为单用户，我想扫码超时时收到明确提示，以便知道需要重新发起扫码。
24. 作为单用户，我想 Playwright 浏览器未安装时收到安装提示，以便知道先执行安装命令。

## Implementation Decisions

### 技术栈

- Spring Boot 3.5.16 + spring-boot-starter-web + RestTemplate（底层 httpclient5，禁用重定向与默认错误处理）
- Java 21
- Playwright 1.49.0（仅扫码登录，有头 Chromium）
- Jackson（starter-web 自带，全局配 FAIL_ON_UNKNOWN_PROPERTIES=false）

### 架构分层

- **config**：WeiboConfig（RestTemplate Bean，HttpComponentsClientHttpRequestFactory + disableRedirectHandling）、NoOpResponseErrorHandler（禁用 RestTemplate 默认 4xx/5xx 抛异常，交给 Client 处理）
- **client**：WeiboHttpClient、WeiboCookieHolder、WeiboConstants、exception/*
- **api**：每接口一 Api 类，注入 WeiboHttpClient
- **model**：request/*（record + toParams()）、response/*（record）
- **controller**：Controller 类名加 Weibo 前缀，@RequestMapping("/weibo/xxx")

### WeiboHttpClient 设计

两个方法，都带 withCookie 参数：

- `getForString(url, params, headers, withCookie)` -> `ResponseEntity<String>`：JSON 文本 + 响应头。JSON 接口与续期链共用，API 层自己反序列化或剥 JSONP 壳。
- `getForBytes(url, params, headers, withCookie)` -> `ResponseEntity<byte[]>`：二进制 + 响应头。群聊 msget 与图床/视频直链共用。

公共错误应对（两方法统一）：
- 429：指数退避 4^n 秒重试（n=1,2,3），耗尽抛 WeiboRateLimitException
- 414：立即抛 WeiboUriTooLongException
- 302 且 Location 命中登录域正则（login.sina.com.cn / passport.weibo.com / weibo.com/login）：抛 WeiboCookieExpiredException；其余 3xx 抛 WeiboException
- 200 且 body 为 JSON 含 error_code=21301 或 error=relogin!：抛 WeiboCookieExpiredException（JSON 解析失败则跳过，兼容 JSONP）
- getForBytes 不检查 body（只看状态码）

### WeiboConstants 设计

维护五组公共 header，Api 层选组 + 可追加自定义：

| 组 | 用在 | UA | Referer | X-Requested-With | Origin |
|----|------|----|---------|-------------------|--------|
| HEADERS_AJAX | mymblog / longtext / searchProfile | ✓ | weibo.com | XMLHttpRequest | - |
| HEADERS_WEBIM | group list / group messages | ✓ | web.im.weibo.com | - | - |
| HEADERS_MSGET | group media（msget） | ✓ | web.im.weibo.com | - | web.im.weibo.com |
| HEADERS_RENEW | 续期链 4 步 | ✓ | weibo.com | - | - |
| HEADERS_DIRECT | 图床 / 视频直链 | ✓ | weibo.com | - | - |

Cookie 由 Client 按 withCookie 自动追加，不放进 header 组。

### WeiboCookieHolder 设计

- 内存缓存（volatile String）+ `.weibo_cookie.txt` 持久化
- 格式：原始 Cookie 串 `SUBP=..; ALF=..; SSOLoginState=..; SUB=..`
- 启动时读文件（不存在则 cookie=null，不报错）
- set() 更新内存 + 回写文件；写文件失败只记日志不抛，以内存值为准
- mergeRenewal(List<String> setCookies)：双重过滤（domain=.weibo.com + name∈{SSOLoginState,ALF}）合并续期新值，SUB/SUBP 不动

### 异常体系

```
WeiboException (RuntimeException, 带 int errorCode 字段，默认 0)
├── WeiboCookieExpiredException   // 401
├── WeiboRateLimitException        // 429
└── WeiboUriTooLongException       // 414
```

微博业务错误（error_code 非 0 非 21301）直接抛 `new WeiboException(errorCode, message)`，不单独建类。

### Controller 层

- 全局 `@RestControllerAdvice` 统一异常处理：WeiboCookieExpiredException->401 / WeiboRateLimitException->429 / WeiboUriTooLongException->414 / 其余 WeiboException->500（业务错误 errorCode 非 0 时 502）
- 返回体统一 `{code, msg}`
- Controller 类名加 Weibo 前缀，路径前缀 /weibo 分散到各 @RequestMapping

### LoginApi（Playwright）设计

- 有头 Chromium 打开 https://api.weibo.com/chat
- 轮询 ctx.cookies() 直到 .weibo.com 域出现非空 SUB，超时 weibo.qr-timeout-seconds（默认 300）
- 提取 SUB/SUBP/SSOLoginState/ALF 四字段，缺一抛 WeiboException
- 拼 Cookie 串调 holder.set()
- 扫码超时抛 WeiboException("扫码登录超时")
- 浏览器未安装抛 WeiboException 带 install chromium 提示

### LoginRenewApi 设计

单 Api 编排四步：
1. updatetgt.php（entry=account, callback=cb）-> 校验 retcode=0
2. crossdomain.php（action=login, domain=sina.com.cn, callback=cb, sr=1920*1080）-> 剥 JSONP 壳取 arrURL
3. 遍历 arrURL，每个追加 callback=cb：
   - passport.weibo.com：读 Set-Cookie 调 holder.mergeRenewal()，不解析 body（单引号 JSONP）
   - passport.weibo.cn：校验 retcode=20000000，忽略 deleted cookie
4. 返回 LoginRenewResponse{success, message}

JSONP 剥壳：私有方法 stripJsonp(body) 取第一个 `(` 与最后一个 `)` 之间内容。

### Request/Response 设计

- Request 用 record，提供 toParams() 方法把驼峰字段转下划线参数名 Map（如 sinceId -> since_id）
- Response 用 record，下划线字段用 @JsonProperty 映射（如 @JsonProperty("created_at") String createdAt）
- toParams() 内聚映射，Api 层直接传给 Client

### 包结构

```
xyz.fz.weibo
├── WeiboApplication
├── config       (WeiboConfig, NoOpResponseErrorHandler)
├── client       (WeiboHttpClient, WeiboCookieHolder, WeiboConstants,
│                 exception/WeiboException, WeiboCookieExpiredException,
│                 WeiboRateLimitException, WeiboUriTooLongException)
├── api          (LoginApi, LoginRenewApi, MyBlogApi, LongTextApi,
│                 SearchProfileApi, GroupListApi, GroupMessagesApi,
│                 GroupMediaApi, DirectMediaApi)
├── model        (request/*, response/*)
└── controller   (WeiboLoginController, WeiboLoginRenewController,
                  WeiboBlogController, WeiboGroupController, WeiboMediaController)
```

### API 契约

| 端点 | 方法 | 路径 |
|------|------|------|
| 扫码登录 | POST | /weibo/login/qr |
| 续期 | POST | /weibo/login/renew |
| 博主微博翻页 | GET | /weibo/blog/mymblog?uid=&page=&sinceId= |
| 长文补全 | GET | /weibo/blog/longtext?id= |
| 时间范围拉取 | GET | /weibo/blog/searchProfile?uid=&page=&starttime=&endtime= |
| 群聊列表 | GET | /weibo/group/list |
| 群聊消息 | GET | /weibo/group/messages?id=&maxMid= |
| 群聊媒体下载 | GET | /weibo/group/media?fid=&imageType= |
| 图床直链下载 | GET | /weibo/media/image?url= |
| 视频直链下载 | GET | /weibo/media/video?url= |

### ADR

- ADR-0001：单用户本地工具（无多账号隔离、无 Controller 鉴权、无并发隔离）

## Testing Decisions

### 测试 seam

Controller 层 HTTP 端到端，一个 seam 覆盖全部行为。

### 测试方式

- `@WebMvcTest` + `MockRestServiceServer`（Spring Boot 内置，不引新依赖）
- mock 微博返回的响应，验证：
  - 公共错误应对：mock 429/302/21301/414，验证 Controller 返回对应状态码（401/429/414/502/500）
  - Api 拼参：mock 成功响应，验证发往微博的 URL 与 query 参数正确（如 since_id 下划线、page 递增）
  - 响应解析：mock JSON 与 JSONP 响应，验证 Controller 返回的对象字段正确（驼峰映射）
  - Cookie 装配：mock 请求，验证 Cookie 头取自 holder
  - header 组选择：验证不同接口带对应 header 组（如 webim 接口带 web.im.weibo.com Referer）

### 不纳入测试

- LoginApi（Playwright 扫码）：需真实浏览器与人工扫码，留作手动验证，不纳入自动测试。

### 测试原则

- 只测外部行为（HTTP 请求/响应），不测实现细节（不 assert 私有方法、不 mock 内部协作）
- 一个 seam 不意味着一个测试类，按 Controller 分多个测试类，但都走同一个 seam

## Out of Scope

- 多用户/多账号支持（ADR-0001 已定单用户）
- Controller 鉴权（本地工具，无鉴权）
- 自动定时续期（手动调 /weibo/login/renew）
- Cookie 失效自动重登（抛异常由用户手动调 /weibo/login/qr）
- 数据库持久化（微博拉取结果不落库，按需调用即返回）
- Playwright 自动安装（用户手动执行 install chromium）
- 持久化存储微博数据（拉取结果即时返回，不缓存不落库）

## Further Notes

- 首次运行前需执行 `mvn exec:java -Dexec.mainClass="com.microsoft.playwright.CLI" -Dexec.args="install chromium"` 安装浏览器，写进 README
- 不写集成测试依赖真实网络，但保证 mvn compile / package 通过
- 凭证术语遵循 CONTEXT.md：Credential / Renewal / Blogger Blog / Long Text / Group Message
