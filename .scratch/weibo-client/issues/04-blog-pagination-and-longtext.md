Status: ready-for-agent

## What to build

博主微博增量翻页与长文补全端到端：用户调 `GET /weibo/blog/mymblog` 拉某博主第 1 页微博（首页不传 since_id），带上 since_id 翻下一页；对 isLongText=true 的微博调 `GET /weibo/blog/longtext` 补全全文。这是第一个真实业务切片，验证 Client + AJAX header 组 + Request.toParams() + 全局异常处理。

具体范围：
- MyBlogRequest record{Long uid, Integer page, String sinceId} + toParams()：uid、page、feature=0 固定、since_id（sinceId 为空则不传）
- LongTextRequest record{Long id} + toParams()：id
- MyBlogResponse record：data{sinceId(@JsonProperty("since_id")), List<Mblog> list, Integer total}、ok
- LongTextResponse record：data{longTextContent, longTextContentRaw(@JsonProperty("longTextContent_raw")), isMarkdown(@JsonProperty("isMarkdown")), urlStruct(@JsonProperty("url_struct"))}、ok
- Mblog record（共享）：id、mblogid(@JsonProperty("mblogid"))、createdAt(@JsonProperty("created_at"))、text、source、isLongText(@JsonProperty("isLongText"))、picNum(@JsonProperty("pic_num"))
- MyBlogApi（@Component）：调 client.getForString("https://weibo.com/ajax/statuses/mymblog", request.toParams(), WeiboConstants.HEADERS_AJAX, true)，反序列化为 MyBlogResponse
- LongTextApi（@Component）：调 client.getForString("https://weibo.com/ajax/statuses/longtext", request.toParams(), WeiboConstants.HEADERS_AJAX, true)，反序列化为 LongTextResponse
- WeiboBlogController（@RestController，@RequestMapping("/weibo/blog")）：GET /mymblog、GET /longtext
- 全局异常处理 @RestControllerAdvice：WeiboCookieExpiredException->401、WeiboRateLimitException->429、WeiboUriTooLongException->414、其余 WeiboException（errorCode 非 0 时 502，否则 500），返回体 {code,msg}

## Acceptance criteria

- [ ] GET /weibo/blog/mymblog?uid=&page=1 返回第 1 页微博列表，since_id 用于下一页
- [ ] GET /weibo/blog/mymblog?uid=&page=2&sinceId=上一页since_id 返回第 2 页
- [ ] sinceId 不传时不出现在 query string
- [ ] GET /weibo/blog/longtext?id= 返回长文全文
- [ ] 响应字段为驼峰（sinceId / createdAt / isLongText / picNum 等）
- [ ] 请求带 User-Agent + Referer(weibo.com) + X-Requested-With(XMLHttpRequest) + Cookie
- [ ] Cookie 失效时返回 401 + {code,msg}
- [ ] 限流重试耗尽返回 429
- [ ] feature=0 固定出现在 query string

## Blocked by

- 03-weibo-http-client-core
