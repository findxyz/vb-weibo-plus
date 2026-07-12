Status: ready-for-agent

## What to build

Controller 层 HTTP 端到端测试：用 @WebMvcTest + MockRestServiceServer（Spring Boot 内置，不引新依赖）mock 微博返回，验证全部 Controller 的公共错误应对、Api 拼参、响应解析、异常映射。一个 seam 覆盖全部行为。

具体范围：
- 按 Controller 分多个测试类（WeiboBlogControllerTest、WeiboGroupControllerTest、WeiboMediaControllerTest、WeiboLoginRenewControllerTest 等），都走同一个 seam
- MockRestServiceServer 绑定到 RestTemplate，mock 微博返回的响应
- 验证点：
  - 公共错误应对：mock 429/302(跳登录域)/21301/414 响应，验证 Controller 返回对应状态码（401/429/414/502/500）
  - Api 拼参：mock 成功响应，验证发往微博的 URL 与 query 参数正确（since_id 下划线、page 递增、feature=0 固定、has* 固定等）
  - 响应解析：mock JSON 与 JSONP 响应，验证 Controller 返回的对象字段正确（驼峰映射）
  - Cookie 装配：mock WeiboCookieHolder 返回固定 cookie，验证请求带 Cookie 头
  - header 组选择：验证不同接口带对应 header 组（AJAX 接口带 X-Requested-With，webim 接口带 web.im.weibo.com Referer，msget 带 Origin 等）
  - 续期链：mock 四步响应，验证 Set-Cookie 合并逻辑与 LoginRenewResponse
- 不纳入：WeiboLoginController 的扫码登录（Playwright 需真实浏览器，留手动验证）

## Acceptance criteria

- [ ] 429 mock 触发重试逻辑，耗尽返回 429
- [ ] 302 跳登录域 mock 返回 401
- [ ] 21301 mock 返回 401
- [ ] 414 mock 返回 414
- [ ] 业务 error_code 非 0 mock 返回 502
- [ ] mymblog 拼参验证：since_id 下划线、page、feature=0、不带 since_id 时不出现在 query
- [ ] searchProfile 拼参验证：starttime/endtime/has* 固定参数
- [ ] group messages 拼参验证：max_mid 下划线、t 为毫秒时间戳、source 固定
- [ ] 响应字段驼峰映射验证（sinceId/createdAt/isLongText/picNum 等）
- [ ] header 组验证：AJAX 带 XMLHttpRequest，WEBIM 带 web.im.weibo.com Referer，MSGET 带 Origin
- [ ] 续期链 mock 四步响应，验证 mergeRenewal 合并 SSOLoginState/ALF、SUB/SUBP 不变
- [ ] mvn test 通过

## Blocked by

- 04-blog-pagination-and-longtext
- 05-blog-time-range
- 06-group-list-and-messages
- 07-media-download
- 08-renewal-chain
