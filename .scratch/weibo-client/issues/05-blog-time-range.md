Status: ready-for-agent

## What to build

博主微博时间范围拉取端到端：用户调 `GET /weibo/blog/searchProfile` 拉某博主指定日期段的微博，按 page 翻页（纯 page 翻页无 since_id），list 为空表示该时段翻完。

具体范围：
- SearchProfileRequest record{Long uid, Integer page, Long starttime, Long endtime} + toParams()：uid、page、starttime、endtime、hasori=1、hasret=1、hastext=1、haspic=1、hasvideo=1、hasmusic=1（均固定）
- SearchProfileResponse record：data{List<Mblog> list, String total(@JsonProperty 无需，原样 total 可能是字符串 "2" 或数字 0，用 Object 或 String 兼容), absStr(@JsonProperty("absstr"))}、ok
  - 注意：data.total 在规范里第 1 页是字符串 "2"，第 2 页是数字 0，需兼容处理（用 Object 或读为 String）
- SearchProfileApi（@Component）：调 client.getForString("https://weibo.com/ajax/statuses/searchProfile", request.toParams(), WeiboConstants.HEADERS_AJAX, true)，反序列化为 SearchProfileResponse
- WeiboBlogController 增 GET /searchProfile

## Acceptance criteria

- [ ] GET /weibo/blog/searchProfile?uid=&page=1&starttime=&endtime= 返回该时段微博列表
- [ ] page=2 返回更早的微博，list 为空表示该时段翻完
- [ ] starttime/endtime/hasori/hasret/hastext/haspic/hasvideo/hasmusic 均出现在 query string
- [ ] 复用 Mblog record（与 04 共享）
- [ ] 响应字段驼峰
- [ ] 请求带 AJAX header 组 + Cookie
- [ ] total 字段兼容字符串与数字两种返回

## Blocked by

- 03-weibo-http-client-core
