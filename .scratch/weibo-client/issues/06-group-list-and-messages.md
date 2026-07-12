Status: ready-for-agent

## What to build

群聊列表与消息端到端：用户调 `GET /weibo/group/list` 拉所有群聊（type=2 为群聊），调 `GET /weibo/group/messages` 拉某群消息（首页不传 max_mid，翻页取上一页 messages[0].id 作为 max_mid）。

具体范围：
- GroupListRequest record + toParams()：source=209678993、t=当前毫秒时间戳、count=50、special_source=3、add_virtual_user="3,4"、is_include_group=0、need_back="0,0"、is_include_folder=1（均固定）
- GroupMessagesRequest record{Long id, Long maxMid} + toParams()：id、count=50、max_mid（maxMid 为空则不传）、convert_emoji=1、query_sender=1、source=209678993、t=当前毫秒时间戳
- GroupListResponse record：totalNumber、List<Contact> contacts；Contact{user}；User{id,type,name,memberCount(@JsonProperty("member_count")),maxMemberCount(@JsonProperty("max_member_count")),avatarLarge(@JsonProperty("avatar_large")),creator,groupType(@JsonProperty("group_type"))}
- GroupMessagesResponse record：result、List<Message> messages、ts；Message{id,gid,fromUid(@JsonProperty("from_uid")),content,mediaType(@JsonProperty("media_type")),time,type}
- GroupListApi（@Component）：调 client.getForString("https://api.weibo.com/webim/2/direct_messages/contacts.json", request.toParams(), WeiboConstants.HEADERS_WEBIM, true)
- GroupMessagesApi（@Component）：调 client.getForString("https://api.weibo.com/webim/groupchat/query_messages.json", request.toParams(), WeiboConstants.HEADERS_WEBIM, true)
- WeiboGroupController（@RestController，@RequestMapping("/weibo/group")）：GET /list、GET /messages

## Acceptance criteria

- [ ] GET /weibo/group/list 返回 contacts，type=2 为群聊，id 为 gid
- [ ] GET /weibo/group/messages?id=& 不传 maxMid 返回最新一批
- [ ] GET /weibo/group/messages?id=&maxMid=上一页messages[0].id 返回更早消息
- [ ] maxMid 不传时不出现在 query string
- [ ] t 参数为当前毫秒时间戳（每次请求实时生成）
- [ ] 请求带 WEBIM header 组（Referer: web.im.weibo.com）+ Cookie
- [ ] 响应字段驼峰（memberCount / maxMemberCount / avatarLarge / fromUid / mediaType）
- [ ] contacts.source 等固定参数出现在 query string

## Blocked by

- 03-weibo-http-client-core
