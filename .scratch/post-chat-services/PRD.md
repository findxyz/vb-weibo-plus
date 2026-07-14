# PRD：微博内容与群消息持久化服务

## Problem Statement

当前 vb-weibo-plus 是一个纯即时调用的微博客户端：拉取微博、拉取群消息、下载媒体都走微博 API 现取现返，结果不落库。这带来一个核心问题：

1. 无法回看历史。微博博主删博、改博后，之前拉到的内容就丢了；群消息同理，撤回或清理后无法追溯。

用户希望把微博内容与群消息持久化到本地 SQLite，使内容可离线回看；列表查询不访问任何上游媒体服务。图片与视频封面由独立的本地媒体接口按需代理获取，媒体 bytes 不持久化，不保证离线可用。已有两个参考实现（weiboblog 的微博落库、weibogroup 的群消息落库），本 PRD 将其设计搬运并适配到本项目的 Spring Boot 技术栈。

## Solution

引入 SQLite + JdbcTemplate 持久化层，新建四张表（bloggers/posts/groups/messages），新建两个 service：PostService 负责微博内容与媒体的保存/查询，ChatService 负责群组与群消息的保存/查询。微博与群消息采用首次捕获版本：同一远端标识再次抓取时不覆盖已存内容；博主与群组元信息允许更新。两个 service 有自己的领域 record，不直接耦合 API 层的 record，通过 mapper 双向转换。媒体信息只存 URL/fid；列表接口只返回本地内容和媒体定位信息，独立媒体接口根据本地主键解析上游引用并代理返回二进制。最终通过 Controller 接口体现两个 service 的保存、离线查询与按需媒体代理能力。

## User Stories

1. 作为使用者，我想把某博主最近的微博保存到本地数据库，以便博主删博后我仍能回看。
2. 作为使用者，我想按时间范围保存某博主在指定区间内的微博，以便补全某段时间的历史记录。
3. 作为使用者，我想按一个或多个博主查询聚合微博列表，不指定博主时查询全部已保存博主；每条微博带自己的博主元信息和媒体定位信息，且列表查询只访问 SQLite，以便断网时仍能回看正文。
4. 作为使用者，我想通过独立接口按需获取某条微博的视频封面，并从列表结果取得视频跳转地址，以便在线预览后跳转到微博观看。
5. 作为使用者，我想通过独立接口按需获取某条微博图片的缩略图或原图二进制，以便预览或查看高清原图。
6. 作为使用者，我想查询微博时直接得到完整 HTML 内容与完整纯文本内容，不需要区分截断正文和长文。
7. 作为使用者，我想查询转发微博时同样得到被转发原微博的完整 HTML 内容与完整纯文本内容。
8. 作为使用者，我想通过独立接口按需获取转发原微博的图片缩略图和视频封面，以便预览其媒体。
9. 作为使用者，我想通过独立接口按需获取转发原微博某张图片的原图二进制，以便查看高清原图。
10. 作为使用者，我想把某群最近的消息保存到本地数据库，以便群消息被撤回或清理后我仍能回看。
11. 作为使用者，我想回填某群从指定时间点到现在的全部历史消息，以便补全该群的历史记录。
12. 作为使用者，我想查询某群的消息列表时只读取 SQLite，并通过独立接口按需获取图片压缩图，以便断网时仍能回看消息正文。
13. 作为使用者，我想通过独立接口按需获取群视频消息的封面，以便预览视频内容。
14. 作为使用者，我想通过独立接口按需获取某条群图片消息的原图二进制，以便查看高清原图。
15. 作为使用者，我想查询群消息时按时间区间过滤，以便只看某段时间的对话。
16. 作为使用者，我想保存微博时自动识别长文微博并补全全文，以免只存到摘要。
17. 作为使用者，我想保存微博时自动识别转发原微博的长文并补全全文，以免转发原文只存到摘要。
18. 作为使用者，我想保存群消息时正确处理"从旧到新"的 API 返回顺序与 max_mid 游标，以便增量拉取不丢消息不重复。
19. 作为使用者，我想查询微博/群消息时返回博主/群组的元信息（昵称、头像等），以便识别内容来源。
20. 作为使用者，我想在项目启动时自动创建数据库表，以便无需手动执行迁移脚本。
21. 作为使用者，我想离线查询本地已保存的全部博主与群组，以便在不调用原生微博列表 API 的情况下选择要查看的内容。
22. 作为使用者，我想主动同步上游群列表到本地，以便群消息占位记录能够补齐群名称、头像和成员等元信息。

## Implementation Decisions

### 持久化层

- 引入 `org.xerial:sqlite-jdbc` 依赖与 `spring-boot-starter-jdbc`（提供 JdbcTemplate）。
- `application.yml` 配置 SQLite datasource（本地文件，路径可配，默认项目根 `weibo.db`）与 `spring.sql.init.mode=always`（启动时执行 schema.sql）。
- 不引入 Flyway/Liquibase。建表脚本 `schema.sql` 放 `src/main/resources`，全部用 `CREATE TABLE IF NOT EXISTS`，幂等。`*.db` 已在 `.gitignore` 排除。
- DB 访问统一用 `JdbcTemplate` + 手写 SQL + `RowMapper`，不引 ORM。符合项目现有 record 风格与简单优先原则。

### 四张表 schema

bloggers（博主元信息，源自 weiboblog，删 post_count/raw_json；加 latest_post_id 存增量游标，对称 groups 的 max_mid）：

```sql
CREATE TABLE IF NOT EXISTS bloggers (
    uid             BIGINT PRIMARY KEY,
    screen_name      VARCHAR NOT NULL DEFAULT '',
    avatar           VARCHAR DEFAULT '',
    profile_url      VARCHAR DEFAULT '',
    verified         INT DEFAULT 0,
    latest_post_id   BIGINT DEFAULT 0,   -- 已存最新微博 post_id，增量停止/过滤基准
    created_at       BIGINT DEFAULT 0,
    updated_at       BIGINT DEFAULT 0
);
```

> latest_post_id 不随微博写入逐条更新，由 `refreshBloggerRange(uid)` 在一次拉取结束后用 `SELECT MAX(post_id) FROM posts WHERE uid=?` 重算写回。

posts（微博内容，weibo_posts 改名；图片档位 thumbnail+original；视频拆为封面 URL + 文章页 URL；不存 raw_json；增量游标存 bloggers.latest_post_id，不现算）：

```sql
CREATE TABLE IF NOT EXISTS posts (
    mblogid         VARCHAR PRIMARY KEY NOT NULL,
    post_id         BIGINT NOT NULL,
    uid             BIGINT NOT NULL,
    content         TEXT DEFAULT '',
    content_raw     TEXT DEFAULT '',
    source          VARCHAR DEFAULT '',
    region          VARCHAR DEFAULT '',
    pics_json       TEXT DEFAULT '[]',
    video_cover_url VARCHAR DEFAULT '',
    video_page_url  VARCHAR DEFAULT '',
    retweeted_json  TEXT DEFAULT '',
    reposts_count   INT DEFAULT 0,
    comments_count  INT DEFAULT 0,
    attitudes_count INT DEFAULT 0,
    created_at      BIGINT NOT NULL,
    saved_at        BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_uid_ctime ON posts(uid, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_post_id ON posts(post_id);
```

`pics_json` 每项结构（thumbnail + original 两档）：

```json
{"pid":"abc","thumbnail":{"url":"...","w":0,"h":0},"original":{"url":"...","w":0,"h":0}}
```

`retweeted_json` 结构（转发原微博，镜像 posts 的内容与媒体结构）：

```json
{"post_id":0,"mblogid":"","content":"","content_raw":"","uid":0,"screen_name":"",
 "created_at":0,
 "pics":[{"pid":"","thumbnail":{"url":"","w":0,"h":0},"original":{"url":"","w":0,"h":0}}],
 "video_cover_url":"","video_page_url":""}
```

groups（群组元信息与群消息游标；允许只有 gid 的占位行，ChatService 增量读 max_mid、历史回填可选读 min_mid）：

```sql
CREATE TABLE IF NOT EXISTS groups (
    gid          BIGINT PRIMARY KEY,
    name         VARCHAR NOT NULL DEFAULT '',
    avatar       VARCHAR DEFAULT '',
    member_count INT DEFAULT 0,
    max_member   INT DEFAULT 0,
    owner_id     BIGINT DEFAULT 0,
    admins       TEXT DEFAULT '[]',
    summary      VARCHAR DEFAULT '',
    group_type   INT DEFAULT 0,
    min_mid      BIGINT DEFAULT 0,     -- 已存最旧消息 mid，历史回填可从这起往前翻
    max_mid      BIGINT DEFAULT 0,     -- 已存最新消息 mid，增量停止/过滤基准
    created_at   BIGINT DEFAULT 0,
    updated_at   BIGINT DEFAULT 0
);
```

> min_mid/max_mid 不随消息写入逐条更新，由 `refreshGroupRange(gid)` 在一次拉取结束后用 `SELECT MIN(mid), MAX(mid) FROM messages WHERE gid=?` 重算写回。

messages（群消息，源自 weibogroup，删 raw_json/media_local_path 及未用字段；显式建 (gid, created_at) 复合索引）：

```sql
CREATE TABLE IF NOT EXISTS messages (
    mid           BIGINT PRIMARY KEY NOT NULL,
    gid           BIGINT NOT NULL,
    msg_type      INT NOT NULL DEFAULT 0,
    msg_type_name VARCHAR DEFAULT '',
    media_type    INT DEFAULT 0,
    sender_id     BIGINT DEFAULT 0,
    sender_name   VARCHAR DEFAULT '',
    text          TEXT DEFAULT '',
    fid           VARCHAR DEFAULT '',
    video_cover_fid VARCHAR DEFAULT '',
    media_orig_url VARCHAR DEFAULT '',
    url_objects   TEXT DEFAULT '',
    pic_infos     TEXT DEFAULT '',
    template      VARCHAR DEFAULT '',
    template_data TEXT DEFAULT '{}',
    recall_mids   TEXT DEFAULT '[]',
    recall_by     VARCHAR DEFAULT '',
    created_at    BIGINT NOT NULL,
    saved_at      BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_gid_ctime ON messages(gid, created_at);
```

### weibogroup 数据迁移对应关系

本 PRD 只固定迁移对应关系并保证目标 schema 可承接数据；迁移脚本与实际执行后续单独实现。“整体迁移”表示源库中的所有群组记录和消息记录都参与导入，不表示所有技术字段无损保留；缓存、FTS、raw JSON 与当前未使用字段按下表明确丢弃。迁移 `D:/weibogroup` 的 SQLite 数据时遵循以下映射。

groups：

| weibogroup 源字段 | 本项目目标字段 | 迁移规则 |
|---|---|---|
| gid、name、avatar、member_count、max_member、owner_id、admins、summary、group_type | 同名字段 | 直接迁移 |
| created_at、updated_at | 同名字段 | 直接迁移，保持毫秒时间戳 |
| min_mid、max_mid | min_mid、max_mid | 不直接复制文本值；messages 导入完成后按 gid 用 `MIN(mid)/MAX(mid)` 重新计算 BIGINT 游标 |
| round_avatar、super_group_type、status、validate_type、raw_json | 无 | 当前查询与保存能力不使用，明确丢弃 |

messages：

| weibogroup 源字段 | 本项目目标字段 | 迁移规则 |
|---|---|---|
| mid | mid | 校验为非零数字后从 TEXT 转为 BIGINT；非法值报告并跳过，不可静默转为 0 |
| gid、msg_type、msg_type_name、media_type、sender_id、sender_name、text、fid、media_orig_url | 同名字段 | 直接迁移 |
| url_objects、pic_infos、template、template_data、recall_mids、recall_by | 同名字段 | 保留原 JSON／文本内容直接迁移 |
| annotations | video_cover_fid | 从 JSON 的 `video_pic_fid` 提取并按字符串迁移；缺失时写空字符串；annotations 其余内容不迁移 |
| created_at、saved_at | 同名字段 | 直接迁移，保持毫秒时间戳 |
| id | 无 | 目标表以 mid 为主键，不迁移源库代理 ID |
| media_local_path、attitude_data、faith_status、faith_icon、group_name、raw_json | 无 | 当前能力不使用或与其他表重复，明确丢弃 |

weibogroup 的 config、media_files、messages_fts 及 FTS trigger 不迁移：Credential 仍由本项目现有机制管理；媒体文件缓存与全文搜索不在本 PRD 范围内。

数据库中的所有时间戳均为毫秒级 Unix 时间戳，存 BIGINT。`posts.created_at` 来自微博 API 的 `Mblog.created_at`，`messages.created_at` 来自群消息 API 的秒级 `time`，都表示远端内容的发布时间；`posts.saved_at/messages.saved_at` 表示本地首次捕获时间。`bloggers/groups` 的 `created_at/updated_at` 表示本地元信息记录的创建与更新时间。

Controller 的时间参数使用 `yyyy-MM-dd HH:mm:ss` 字符串，按 `Asia/Shanghai` 解析，边界均包含。`PostService.saveByRange` 的 `start/end` 必传；`ChatService.saveBySince` 的 `sinceTime` 必传；`PostService.queryPosts` 与 `ChatService.queryMessages` 的 `start/end` 均可选，不传 start 表示不限制最早时间，不传 end 表示不限制最晚时间。任何方法同时得到 start/end 且 start > end 时返回 400，不自动交换；start == end 合法。Controller 解析后传给 service；service 写库时使用毫秒，调用只接受秒级时间戳的微博 API 时再转换为秒。

### 前置：补齐 API record 字段

当前 API 层 record 缺媒体字段，落库前必须先补（改 `model/response` 包）。ObjectMapper 已配 `FAIL_ON_UNKNOWN_PROPERTIES=false`，多余字段安全。

- `LongTextRequest.id` 从 `Long` 改为 `String`，`WeiboBlogController.longtext` 同步接收 String。PostService 对当前微博与转发原微博补全文时都传 mblogId；数字 ID 仍可作为字符串兼容原有 `/weibo/blog/longtext` 调用。
- `Mblog`：补 `text_raw`、`region_name`、`reposts_count`、`comments_count`、`attitudes_count`、`user`、`pic_infos`、`page_info`、`retweeted_status`。`user` 至少接收 `id`、`screen_name`、头像、主页地址与认证状态，用于 upsert bloggers；`pic_infos` 为 `Map<String, ApiPicInfo>`，接收 thumbnail、large、original、largest 各 `{url, width, height}`，mapper 输出的领域 PicInfo 只保留 thumbnail 与 original，其中 original 按 largest → original → large 回退；`page_info` 含 `page_pic` 封面直链与 `media_info.h5_url` 视频网页地址；`retweeted_status` 递归使用 `Mblog`，接收转发原微博。字段结构以实际 API JSON、`WEIBO_API_RAW.md` 与 weiboblog fixture 为准。
- `Message`：补发送者信息、`fids`、`annotations`、`url_objects`、`pic_infos`、`template`、`template_data`、`recall_mids`、`recall_by` 与媒体原始地址。发送者信息用于填充 `sender_id/sender_name`；`fids` 为 `List<String>`；`annotations.video_pic_fid` 也按 String 接收并映射到 messages.video_cover_fid，兼容类似 `5302496155143676_file` 的非纯数字 fid。字段结构以实际群消息 API JSON 为准。
- `GroupMediaRequest.fid` 从 `Long` 改为 `String`，toParams 只输出字符串 fid、固定 source 与可选 imageType；图片 fid、视频封面 fid 与后续 weibogroup 迁移数据共用同一类型，不对 fid 做数字转换或数值比较。删除当前错误的 `Origin` 查询参数。
- 群媒体下载专用 `HEADERS_MSGET` 使用 `Origin: https://web.im.weibo.com` 与 `Referer: https://web.im.weibo.com/`；Origin 只属于 HTTP header，不得放进 msget 查询参数。Cookie 仍由 `WeiboHttpClient` 在 withCookie=true 时追加。
- `GroupUser`：补 `admins` 与 `summary`，并将现有 `id/name/member_count/max_member_count/avatar_large/creator/group_type` 完整映射到 groups 表。

### service 对象层（解耦 API record）

新建包 `xyz.fz.weibo.domain`，定义 service 自己的 record，不耦合 API record。持久化 record 与查询 view 分开，查询 view 只暴露调用本地媒体接口所需的定位信息，不暴露上游媒体 URL／fid：

- `PostRecord`：字段对应 posts 表，`pics` 为 `List<PicInfo>`、`video` 为 `VideoInfo`（coverUrl + pageUrl）、`retweeted` 为 `RetweetInfo`（镜像结构，含自己的 pics/video）。
- `MessageRecord`：字段对应 messages 表，媒体为 `fid`/`videoCoverFid`/`mediaType`/`urlObjects`/`picInfos`。
- `BloggerRecord`：博主查询元信息，包含 uid、昵称、头像、主页地址与认证状态，不暴露增量游标。
- `GroupRecord`：群组查询元信息，包含 gid、名称、头像、成员信息、群主、管理员、简介与群类型，不暴露历史游标。群元信息不存在时返回仅含 gid、其他字段为默认值的空信息，不影响消息查询。
- `PostView`：单条聚合微博查询项，复制 `PostRecord` 中需要展示的正文与元数据字段，并带该条微博对应的 `BloggerRecord blogger`；不直接嵌入 `PostRecord`。图片使用 `PostImageView(pid, thumbnailWidth, thumbnailHeight, originalWidth, originalHeight, thumbnailUrl, originalUrl)`，其中两个 URL 均为已正确编码查询参数的本地相对地址 `/post/image?...`；视频使用 `PostVideoView(coverUrl, pageUrl)`，coverUrl 为本地 `/post/video-cover?...`，pageUrl 为可跳转的微博文章页。转发原微博使用同样结构，其视频封面地址带 `retweeted=true`。不存在对应媒体时相关 URL 为空，不暴露上游媒体 URL。
- `MessageView`：单条群消息查询项，复制 `MessageRecord` 中需要展示的消息字段，保留 gid、mid、mediaType，并按媒体能力返回本地相对地址。图片消息同时返回 `/chat/media?...&variant=preview` 的 previewUrl 与 `variant=original` 的 originalUrl；有视频封面的消息只返回 previewUrl；其他消息两个 URL 均为空。不返回媒体 bytes、base64、上游 fid 或媒体 URL。
- `PostQueryResult`：包含 `List<PostView> items`、`page`、`size`、`total`。
- `MessageQueryResult`：包含顶层 `GroupRecord group`、`List<MessageView> items`、`page`、`size`、`total`。
- `MediaBinary`：媒体代理 service 的成功结果，只包含 `byte[] content` 与 `String contentType`；不携带其他上游响应头。上游缺少 Content-Type 时使用 `application/octet-stream`。
- `SaveResult`：四个微博／群消息内容保存入口共用的成功结果，包含 `fetchedCount`、`insertedCount`、`ignoredCount`，不暴露内部游标。`ignoredCount` 包含主键已存在、增量边界内旧内容以及明确过滤的无用户内容事件。`syncGroups()` 直接返回 `List<GroupRecord>`，不使用 SaveResult。中途失败时抛出异常，不返回部分成功结果。

新建 mapper（`xyz.fz.weibo.service.mapper`）：

- `PostMapper.toRecord(Mblog, LongTextResponse?, LongTextResponse?)`：API record + 当前微博可选长文响应 + 转发原微博可选长文响应 -> PostRecord；mapper 只输出归一化后的完整 `content/content_raw`，不保留截断正文、`isLongText` 或长文响应结构。上游 `source` 可能是 HTML 链接，映射时去除 HTML 标签并只将可直接展示的纯文本写入 `posts.source`，不保存原始 HTML。
- `PostMapper` 使用格式 `EEE MMM dd HH:mm:ss Z yyyy` 与 `Locale.ENGLISH` 解析 Mblog.createdAt，并按字符串自带的时区偏移转换为 Unix 毫秒；当前微博与转发原微博使用同一规则。缺失或无法解析时视为映射失败，不以本地当前时间或 0 静默兜底。
- `PostMapper` 实现 `RowMapper<PostRecord>`：DB 行 -> PostRecord（pics_json/retweeted_json 反序列化）。
- `MessageMapper` 同理。

### PostService

```
// 保存
saveIncremental(uid)            // 返回 SaveResult；无游标时保存最新一页并建立基线；有游标时从最新往旧翻，直到碰到旧边界
saveByRange(uid, start, end)    // 返回 SaveResult；start/end 按 Asia/Shanghai 解析；按日切分区间，首日/末日保留精确时分秒，再转为秒级 starttime/endtime，逐日翻页直到 list 空

// 查询
queryBloggers() // 返回全部本地 BloggerRecord；只读 SQLite，不分页；按 updated_at DESC, uid DESC
queryPosts(uids?, start?, end?, page=1, size=100) // 返回 PostQueryResult；uids 可选且支持多个，不传则查询全部已保存博主；start/end 可选；size 最大 100；按 created_at DESC, post_id DESC；只读 SQLite，不下载媒体
queryPostImage(mblogId, pid, variant) // variant=thumbnail|original；从当前微博或转发原微博定位 pid，代理返回 MediaBinary
queryPostVideoCover(mblogId, retweeted=false) // 定位当前微博或转发原微博的视频封面，代理返回 MediaBinary
```

增量停止判定：开始时读取并固定 `bloggers.latest_post_id`（已存最大 post_id）作为本次增量边界。博主记录不存在或 `latest_post_id=0` 时，只请求并保存最新一页，然后刷新游标并结束，不继续向历史翻页。已有游标时，从最新页起翻，完整扫描本页且不依赖 API 页内顺序：保存全部 `post_id > latest_post_id` 的微博，并记录本页是否出现 `post_id <= latest_post_id`。处理完本页后，如果出现过旧边界则停止本次增量抓取；只有整页都比边界新时才继续向前翻页。拉取结束后 `refreshBloggerRange(uid)` 用 `SELECT MAX(post_id) FROM posts WHERE uid=?` 重算写回 bloggers.latest_post_id。这样兼容参考实现记录的“旧到新”与当前 API 文档记录的“新到旧”两种页内顺序。

内容归一化注意点（关键）：`Mblog.isLongText=true` 时，列表中的 `text/text_raw` 只是截断内容，必须调用 longtext 接口。普通微博使用 `Mblog.text/text_raw` 填充 `content/content_raw`；长文微博使用 `LongTextResponse.longTextContent/longTextContentRaw` 填充。当前微博与转发原微博分别判断、分别补全。数据库与查询领域模型只保留最终完整的 `content/content_raw`，不保留 `isLongText`、截断正文或单独的 long_text。

视频跳转：posts.video_page_url 取 `page_info.media_info.h5_url`，即 `https://video.weibo.com/show?...` 网页地址。不要使用带 Expires/ssig 的视频流 URL，也不要使用 `page_info.page_url` 的 `sinaweibo://` 深链。

保存入库用 `INSERT OR IGNORE`（靠 mblogid PRIMARY KEY 去重），返回是否新增。同一 mblogid 再次抓取时保留首次捕获的完整内容与媒体引用，不覆盖已存内容。博主信息在抓取时从 `posts[0].user` 提取并 upsert 到 bloggers 表；upsert 只更新昵称、头像、主页地址、认证状态与 updated_at，必须保留已有 latest_post_id。

### ChatService

```
// 保存
saveIncremental(gid)                    // 返回 SaveResult；无游标时保存最新一页并建立基线；有游标时从最新往旧翻，直到碰到旧边界
saveBySince(gid, sinceTime, beforeMid?)  // 返回 SaveResult；sinceTime 按 Asia/Shanghai 解析且包含边界；从 beforeMid 之前（可选，不传则从最新）往前翻，直到空页或早于 sinceTime

// 查询
syncGroups() // 调用 GroupListApi，同步并 upsert 群元信息，保留 min_mid/max_mid；返回同步后的全部本地 GroupRecord
queryGroups() // 返回全部本地 GroupRecord；只读 SQLite，不分页；按 updated_at DESC, gid DESC；包含仅有 gid 的占位群
queryMessages(gid, start?, end?, page=1, size=100) // 返回 MessageQueryResult；顶层带群组元信息；start/end 可选；size 最大 100；按 created_at DESC, mid DESC；只读 SQLite，不下载媒体
queryMessageMedia(gid, mid, variant) // variant=preview|original；preview 为图片压缩图或视频封面，original 仅允许图片；代理返回 MediaBinary
```

两个保存模式的停止判定：

- **增量 `saveIncremental(gid)`**：开始时读取并固定 `groups.max_mid` 作为本次增量边界，比较期间不改变。群组记录不存在或 `max_mid=0` 时，只请求并保存最新一页，然后刷新游标并结束，不继续向历史翻页。已有游标时，从最新页起翻；每页 API 消息先用 `reversed()` 从“旧到新”转换为“新到旧”，再逐条比较。`mid > max_mid` 的是新消息，保存；碰到 `mid <= max_mid` 时，说明该条及本页剩余消息都已进入已存范围，停止本次增量抓取。如果整页消息都比边界新，则用本页 `msgs[0].id`（页内最旧）作为下一页的 `max_mid` API 参数继续向前翻。拉取结束后 `refreshGroupRange(gid)` 重算 min_mid/max_mid 写回 groups。
- **历史回填 `saveBySince(gid, sinceTime, beforeMid?)`**：`beforeMid` 可选，不传则从最新页起翻；传了则从该 mid 之前开始往前翻（用于填补已存最旧之前的历史空隙）。无页数上限，翻到空页或某条 `created_at < sinceTime` 停。页内遍历用 `reversed()`（从新到旧），遇 `created_at < sinceTime` 即停。是否传 beforeMid 完全由用户决定，service 不自行判断"首次/非首次"。拉取结束后 `refreshGroupRange(gid)`。

注意：群聊 query_messages API 只有 `max_mid` 游标翻页，**没有** starttime/endtime 参数。所以历史回填的时间下限靠客户端逐条判 `created_at < sinceTime` 实现，不是服务端过滤。这与 PostService 的 `saveByRange`（searchProfile 服务端支持 starttime/endtime）不同。

页内顺序（query_messages API 约定）：一页 50 条内从旧到新排列，`msgs[0]` 是本页最旧，`msgs[-1]` 是本页最新。增量保存与历史回填都先用 `reversed()` 转为从新到旧遍历。`max_mid` API 参数语义=取比该 mid 更早的消息；传空=取最新页。

群聊视频：只通过独立媒体接口代理返回封面二进制，不提供跳转地址（群视频是聊天文件，靠 fid+cookie 通过 mss/msget 取，无公开文章页 URL）。

保存入库用 `INSERT OR IGNORE`（靠 mid PRIMARY KEY 去重）。同一 mid 再次抓取时保留首次捕获的消息内容与媒体引用，不覆盖已存内容。保存群消息不依赖群列表 API；groups 中不存在 gid 时先插入仅含 gid 的默认占位行，用于保存 min_mid/max_mid。`syncGroups()` 调用 `GroupListApi` 后逐条 upsert 群元信息，只更新 name、avatar、member_count、max_member、owner_id、admins、summary、group_type、updated_at，保留已有 min_mid/max_mid 与 created_at；新群设置 created_at/updated_at。同步完成后按 `queryGroups()` 的排序返回全部本地群组。上游响应缺少 contacts 时按必需结构缺失处理为 502，不得清空本地群表。

群消息抓取时跳过 `msg_type=332`（协议同步／心跳）与 `msg_type=9999`（态度更新）：两类事件没有需要展示的用户消息内容，且目标 schema 不保存 attitude_data。它们计入 SaveResult 的 fetchedCount 与 ignoredCount，不写入 messages。

`msg_type_name` 不来自微博 API，由 mapper 按 `weibogroup/weibo_im/types.py` 的现有映射派生，保证新抓取数据与迁移数据语义一致：

| msg_type | msg_type_name | msg_type | msg_type_name |
|---:|---|---:|---|
| 100 | 微博分享 | 320 | 邀请入群 |
| 321 | 普通消息 | 322 | 新人入群 |
| 323 | 退群 | 324 | 被踢出群 |
| 325 | 群名修改 | 327 | 群主转让 |
| 331 | 消息撤回 | 332 | 协议同步 |
| 333 | 免打扰变更 | 335 | 群信息更新 |
| 337 | 管理员变更 | 421 | 入群申请 |
| 429 | 被移出群 | 499 | 群通知 |
| 9999 | 态度更新 | 其他 | `未知(<msg_type>)` |

### 失败恢复与游标提交

- 不使用一个数据库长事务包住整次多页抓取；每批已成功写入的内容立即保留。
- HTTP 200 不等于抓取成功：微博列表／搜索／长文响应必须满足 `ok == 1` 且所需 data 存在，群消息响应必须满足 `result == true`。业务标记失败或响应结构缺失时抛出上游异常，不能按空页处理。
- 只有业务成功响应中的空列表才能作为正常停止条件；业务失败不得刷新 latest_post_id、min_mid 或 max_mid。
- `saveIncremental` 开始时固定读取旧游标，只有正常到达旧边界或 API 空页后才刷新新游标。中途 API、长文补全、映射或写库失败时抛出错误并保留旧游标。
- 增量失败后使用相同参数重试：从旧游标重新抓取，已保存内容由 `INSERT OR IGNORE` 跳过，直到完整到达停止边界后再提交新游标。
- `saveByRange`、`saveBySince` 中途失败时同样保留已写入内容，不维护额外进度游标；调用者使用相同参数重试即可。

### 媒体按需代理

列表查询只读取 SQLite，不下载或编码媒体，只根据本地主键生成以 `/` 开头的本地相对媒体 URL；查询参数必须经过 URL 编码。独立媒体接口在 service 层根据本地主键解析已保存的 URL／fid，再通过现有 `DirectMediaApi.download()`／`GroupMediaApi.download()` 获取上游 bytes。service 只从成功响应中提取 bytes 与 Content-Type 组成 `MediaBinary`；Controller 据此构造新的 `ResponseEntity<byte[]>`，Content-Length 由 Spring 生成。不得转发上游的 Set-Cookie、Location、CORS、Content-Disposition 或其他响应头。客户端不能提交任意上游 URL，避免将接口变成通用开放代理，也不暴露上游 URL 与 Credential。

- posts 图片：`variant=thumbnail` 使用已存 thumbnail URL，`variant=original` 使用已存 original URL，均走 `DirectMediaApi.download()`（不带 cookie，使用 HEADERS_DIRECT）。pid 可属于当前微博或转发原微博。
- posts 视频封面：按 `retweeted=false|true` 选择当前微博或转发原微博的 `page_pic` 直链，走 `DirectMediaApi.download()`。
- messages `variant=preview`：图片消息以字符串 fid + imageType=compress 走 `GroupMediaApi.download()`；视频消息读取已存的字符串 `video_cover_fid`，不附加 imageType。
- messages `variant=original`：仅允许 media_type=1 的图片消息，以 fid + imageType=origin 走 `GroupMediaApi.download()`。

### Controller 接口

`/weibo/**` 仅用于现有原生微博 API 透传接口。本地持久化服务使用不带 `Weibo` 前缀的 `PostController` 与 `ChatController`，保持构造器注入。

PostController（`/post`）：
- `POST /post/incremental?uid=...`：保存指定博主的增量，参数使用查询参数传递。
- `POST /post/range?uid=...&start=...&end=...`：按时间范围保存指定博主的微博，参数使用查询参数传递，start/end 必传。
- `GET /post/bloggers`：返回全部本地博主元信息，只读 SQLite，不分页，按 updated_at DESC、uid DESC 稳定排序。
- `GET /post/list?uids=...&uids=...&start=...&end=...&page=...&size=...`：查询聚合微博。`uids` 为可重复的可选查询参数，由 Spring 直接绑定为 `List<Long>`；不传查询全部博主，不支持逗号拼接。start/end 可选，不传则不限制对应时间边界；page 默认 1，size 默认且最大为 100。
- `GET /post/image?mblogId=...&pid=...&variant=thumbnail|original`：用本地微博主键 mblogId 与图片 pid 定位当前微博或转发原微博图片，按 variant 代理返回图片二进制，variant 必传。
- `GET /post/video-cover?mblogId=...&retweeted=false`：代理返回当前微博或转发原微博的视频封面二进制，retweeted 可选且默认 false。

ChatController（`/chat`）：
- `POST /chat/incremental?gid=...`：保存指定群的增量，参数使用查询参数传递。
- `POST /chat/since?gid=...&sinceTime=...&beforeMid=...`：按时间下限回填指定群的历史，参数使用查询参数传递，sinceTime 必传、beforeMid 可选。
- `POST /chat/groups/sync`：调用上游群列表并 upsert 本地群元信息，保留各群 min_mid/max_mid，返回同步后的全部本地 GroupRecord；无请求参数。
- `GET /chat/groups`：返回全部本地群组元信息，只读 SQLite，不分页，按 updated_at DESC、gid DESC 稳定排序；仅有 gid 的占位群也返回。
- `GET /chat/messages?gid=...&start=...&end=...&page=...&size=...`：查询指定群的消息，gid 必传；start/end 可选，不传则不限制对应时间边界；page 默认 1，size 默认且最大为 100。
- `GET /chat/media?gid=...&mid=...&variant=preview|original`：按需代理群消息媒体二进制，variant 必传；preview 对图片返回压缩图、对视频返回封面，original 仅允许 media_type=1 的图片消息。mid 不属于 gid、消息不存在或类型不支持该 variant 时按本地接口错误规则返回。

异常状态统一如下：

- 时间格式错误、page/size 越界、缺少必填参数等请求校验错误返回 400。
- variant 不支持、媒体类型不支持所请求的 variant 等本地请求语义错误返回 400。
- 本地微博、群消息或对应的已存媒体引用不存在返回 404。
- 媒体代理时 Credential 失效复用现有上游异常映射，返回 401；列表查询不使用 Credential。
- 上游微博 API 限流返回 429。
- 本地媒体引用存在，但上游媒体返回 404、其他非成功状态或下载失败时统一返回 502，不将上游 404 透传为本地 404。
- 上游返回 HTTP 200 但业务标记失败或必需结构缺失时返回 502。
- SQLite 错误及其他未分类内部错误返回 500。

原生微博 API 异常继续复用现有 `WeiboExceptionHandler`；本地持久化接口补充所需的参数校验与本地数据不存在映射，不改变现有 `/weibo/**` 行为。

## Testing Decisions

### 测试 seam：两个

1. **Controller 单元测试**：沿用现有 `@WebMvcTest` 风格，mock 对象从 Api 层改为 service 层（`@MockitoBean`），验证 HTTP 状态码与 JSON 字段。参考 `WeiboBlogControllerTest`、`WeiboGroupControllerTest`、`WeiboMediaControllerTest` 的现有写法。
2. **service 测试**：mock Api 层并直接构造注入 service；DB 使用 `SingleConnectionDataSource` 持有唯一的 `jdbc:sqlite::memory:` 连接，通过同一 DataSource 加载 schema.sql，测真实 SQL 与 RowMapper。媒体代理逻辑用固定 byte[] 与 Content-Type 断言。每个测试类结束后关闭连接，避免内存库跨测试污染。

### 好测试的标准

- 只测外部行为，不测实现细节（不测 service 内部私有方法、不测 SQL 字符串拼接）。
- Controller 测：给定 service 返回 X，HTTP 响应状态码与 JSON 字段符合预期。
- 保存接口参数绑定测：验证四个微博／群消息内容保存 POST 接口均从查询参数绑定 uid/gid 与时间参数，不接收 JSON 请求体；同时验证 beforeMid 可省略。
- 列表接口参数绑定测：验证 `/post/list` 通过重复的 uids 查询参数绑定多个博主、不传 uids 时查询全部且逗号拼接格式返回 400；验证 `/chat/messages` 的 gid 必传。
- 本地元信息列表测：验证 `/post/bloggers` 与 `/chat/groups` 不调用上游 API、不分页，分别按 updated_at/uid 与 updated_at/gid 倒序稳定返回；群列表包含仅有 gid、其他字段为默认值的占位群。
- 群元信息同步测：验证 `POST /chat/groups/sync` 无请求参数，调用 GroupListApi 后新增或更新群元信息并返回全部本地 GroupRecord；已有群的 min_mid/max_mid 与 created_at 不变，新群正确设置 created_at/updated_at；上游缺少 contacts 时返回 502，且不删除或清空现有群数据。
- 保存响应测：验证四个微博／群消息内容保存入口成功时返回 fetchedCount/insertedCount/ignoredCount，且不包含 latest_post_id、min_mid、max_mid 等内部游标；群元信息同步返回 List<GroupRecord>。
- Controller 错误测：验证参数校验或不支持的媒体 variant 返回 400、本地数据／媒体引用不存在返回 404、Credential 失效返回 401、上游限流返回 429、上游业务响应失败返回 502、SQLite 或未分类内部错误返回 500。
- 查询响应测：验证聚合微博的每条 item 都包含对应 blogger，群消息响应只在顶层包含 group，且两种响应均返回 page/size/total；查询结果使用 PostView/MessageView，按媒体能力返回参数已编码的本地相对 thumbnailUrl/originalUrl/coverUrl/previewUrl，不包含 base64、上游 URL 或 fid；mock 媒体 API 并验证列表查询从不调用它。转发视频 coverUrl 必须带 retweeted=true，普通消息与无封面视频不生成无效媒体地址。
- 微博媒体代理测：验证 original URL 按 largest → original → large 回退；用 mblogId 定位本地微博，分别验证 pid 属于当前微博与转发原微博时，thumbnail/original 均选择对应的已存 URL；验证视频封面按 retweeted 选择；不使用数字 post_id 定位本地记录；成功响应只返回 bytes 与 Content-Type，不转发 Content-Disposition、Set-Cookie 等其他上游响应头。
- 群消息媒体代理测：preview 对 media_type=1 下载 compress 图片，对有 video_cover_fid 的视频下载封面且不下载视频文件；original 仅允许 media_type=1 并下载 origin 图片；类型不支持 variant 返回 400，gid/mid 不匹配或消息不存在返回 404；成功响应只返回 bytes 与 Content-Type，不转发 Content-Disposition、Set-Cookie 等其他上游响应头。
- 群媒体 fid 类型测：使用 `5302496155143676_file` 一类非纯数字 fid 验证 Message JSON 反序列化、数据库写入／读回、GroupMediaRequest 查询参数与 weibogroup 迁移映射全程保持字符串，不发生 Long 转换；请求参数只含 fid/source/可选 imageType，不含 Origin。
- 群媒体请求头测：验证 msget 请求使用 `Origin: https://web.im.weibo.com`、`Referer: https://web.im.weibo.com/` 与当前 Credential，且不会复用普通微博页面的 Origin／Referer。
- 媒体代理失败测：本地记录和媒体引用存在但上游返回 404 或其他非成功状态时统一映射为 502；验证它与本地引用不存在的 404 可区分。
- 群元信息兼容测：未抓取群列表时可仅凭 gid 保存和查询群消息，返回的 GroupRecord 保留 gid 且其他元信息为默认值；后续 upsert 群元信息时不覆盖 min_mid/max_mid。
- 博主元信息更新测：重复抓取博主信息时允许更新昵称、头像、主页地址与认证状态，但不覆盖 latest_post_id。
- service 测：给定 mock Api 返回 X、DB 已存 Y，service 返回 Z 或 DB 状态符合预期（用查询验证写入）；媒体 service 单独断言 `MediaBinary` 的二进制与 Content-Type，缺少 Content-Type 时回退为 `application/octet-stream`。
- 分页查询测：验证 page 默认 1、size 默认 100、size 超过 100 时拒绝请求，以及微博按 created_at/post_id 倒序、群消息按 created_at/mid 倒序稳定返回；total 使用与 items 完全相同的 uids/gid、start、end 过滤条件，但不受 LIMIT/OFFSET 影响。
- 时间参数测：验证 `yyyy-MM-dd HH:mm:ss` 按 `Asia/Shanghai` 解析，保存方法的必传参数校验，查询方法的开放时间边界，start/end/sinceTime 包含边界，数据库使用毫秒且上游 API 参数转换为秒；start > end 返回 400、start == end 合法，saveByRange 按日切分时首日/末日保留精确时分秒。
- 内容归一化测：分别给普通微博与 `isLongText=true` 的微博，验证普通微博直接使用列表内容、长文微博调用 longtext 接口，并最终写入完整 `content/content_raw`；当前微博与转发原微博两处都测，查询结果不暴露截断正文或长文标记。
- 微博来源映射测：给定 `<a href="...">微博客户端</a>` 形式的 `source`，验证数据库和查询结果中的 `source` 均为纯文本“微博客户端”，且不保留 HTML 标签。
- 微博发布时间映射测：在非英文默认 Locale 下解析 `Fri Jul 10 18:18:55 +0800 2026`，验证按 `Locale.ENGLISH` 与字符串时区得到正确的毫秒时间戳；当前微博和转发原微博都覆盖，非法日期触发映射失败且不刷新增量游标。
- 长文请求参数测：验证 LongTextRequest 与原生 Controller 接收 String id，PostService 对当前微博和转发原微博均使用 mblogId 调用长文接口，同时数字字符串仍能透传。
- 首次增量测：给定博主或群组记录不存在／游标为 0，验证只保存 API 最新一页、刷新游标且不请求下一页。
- 微博增量顺序测：分别让同一页按旧到新、新到旧返回，且同时包含 `post_id <= X` 与 `post_id > X`，验证两种顺序都保存全部新微博、处理完本页后停止且不请求下一页；整页均为新微博时才继续翻页。
- 群消息增量测：给 DB 已存 max_mid=X，mock 多页 API 返回（页内旧到新，且同一页同时包含 `mid <= X` 与 `mid > X`），验证每页先 `reversed()`、存下全部 mid > X 的、碰到 mid <= X 后停止、整页均为新消息时翻页游标使用 msgs[0].id、结束后 max_mid 被刷新。
- 群消息过滤测：给定 msg_type=332、9999 与普通用户消息，验证前两类不写入 messages、普通消息正常写入，且 SaveResult 的 fetchedCount/ignoredCount 计数正确。
- 消息类型映射测：覆盖一个已知 msg_type 与一个未知 msg_type，验证 msg_type_name 分别按固定映射和 `未知(<msg_type>)` 生成；迁移数据与新抓取数据使用同一名称。
- 失败恢复测：让多页增量在中途失败，验证失败前写入的内容保留、旧游标不变；使用相同参数重试后不重复写入并能补齐剩余内容，最终才刷新游标。`saveByRange/saveBySince` 同样验证部分写入保留且可幂等重试。
- 上游业务失败测：分别返回微博 `ok != 1`／data 缺失和群消息 `result=false`，验证不会被当作空页、不会刷新游标并抛出上游异常；业务成功且列表为空才正常结束。
- 群消息历史回填测：给 sinceTime，验证无页数上限翻到空页或 created_at < sinceTime 停、beforeMid 可选控制起点、`reversed()` 遍历顺序。

### 模块

- PostService、ChatService：使用 mock Api 与单连接内存 SQLite 测试。
- PostMapper、MessageMapper：随 service 测或单独测映射正确性。
- API record：使用包含微博正文、博主、转发、图片、视频、群消息发送者、模板与撤回信息的代表性 JSON fixture，验证新增字段能够正确反序列化。
- 微博视频映射测：验证 page_info.page_pic 写入 video_cover_url、page_info.media_info.h5_url 写入 video_page_url，且不会误存带签名的视频流 URL 或 sinaweibo:// 深链。
- RowMapper：随 service 测（内存库读回验证）。
- schema.sql：随 service 测隐式验证（内存库加载即验证建表正确性）。

### 现有先例

- `WeiboBlogControllerTest`：`@WebMvcTest` + `@MockitoBean` mock Api 层，验证状态码与 JSON。Controller 测照搬。
- service 测无现有先例，需新建测试基类，统一创建/关闭 `SingleConnectionDataSource` 并通过该 DataSource 初始化 schema.sql。

## Out of Scope

- 视频文件本身的 bytes 代理（用户明确不要，太大；只代理视频封面）。
- 媒体文件本地磁盘缓存（messages 不存 media_local_path，媒体接口按需代理，不落盘）。
- 媒体离线可用性（仅持久化媒体 URL/fid；查询时在线获取媒体 bytes，微博 API 不可用或 Credential 失效时只保证已持久化内容可回看）。
- 群消息全文搜索（FTS5）（参考项目建了但实际用 LIKE，本 PRD 不做搜索）。
- 多账号隔离、Controller 鉴权、并发隔离（ADR-0001 约束，单用户本地工具）。
- 媒体 URL 过期后的引用刷新（posts 视频用永久文章页 URL 规避；图片／封面直链若过期则媒体代理返回 502，重复抓取不会覆盖首次捕获的媒体引用）。
- 无时间下限的回填模式（PostService 只做增量 + 按时间范围；ChatService 的 `saveBySince` 由 sinceTime 下限控制，不做无下限的"翻到底"）。
- probe_boundary 群最早可爬边界探测（weibogroup 有此能力，用 mid↔ts 线性回归 + 指数后退 + 二分查找盲测入群边界，本 PRD 不搬）。
- 群聊视频跳转地址（群视频无公开网页链接，只通过媒体接口代理封面）。
- raw_json 兜底列（schema 只含明确要存的字段）。
- 数据库迁移版本管理（用 schema.sql 幂等建表，不引 Flyway）。
- 从 weibogroup 实际执行数据迁移（本 PRD 只固定字段对应关系；迁移脚本与执行后续单独实现）。

## Further Notes

### 与现有 PRD 的关系

本 PRD 有意推翻 weibo-client PRD 的 Out of Scope 边界（"数据库持久化（微博拉取结果不落库，按需调用即返回）"）。这是一次经过 grilling 确认的架构变更，记录于此供后续参考。

### 参考实现

- weiboblog（`D:/weiboblog`）：微博落库的 Python 实现。建表 `db.py`、抓取 `crawler.py`、字段映射 `parser.py`。三种抓取模式（全量回填/增量/按时间范围），本 PRD 取后两种。
- weibogroup（`D:/weibogroup`）：群消息落库的 Python 实现。建表 `weibo_im/db.py`、抓取 `weibo_im/crawler.py`、字段映射 `weibo_im/parser.py`。翻页方向（从旧到新）与游标（msgs[0].id 传 max_mid）是搬运时最易错点，已记入 Implementation Decisions。

### issue 切分建议

实现时可天然切分为独立认领的 issue：

1. 持久化层搭建（依赖 + datasource + schema.sql）。
2. 补齐 API record 媒体字段（Mblog 的 pic_infos/page_info/retweeted_status，Message 的 fids/annotations）。
3. domain record + mapper（PostRecord/MessageRecord + PostMapper/MessageMapper）。
4. PostService（保存 + 离线查询 + 长文补全 + 媒体代理）。
5. ChatService（保存 + 离线查询 + 翻页方向 + 媒体代理）。
6. Controller 接口（`/post`、`/chat`）。
