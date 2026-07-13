# PRD：微博内容与群消息持久化服务

## Problem Statement

当前 vb-weibo-plus 是一个纯即时调用的微博客户端：拉取微博、拉取群消息、下载媒体都走微博 API 现取现返，结果不落库。这带来两个问题：

1. 无法回看历史。微博博主删博、改博后，之前拉到的内容就丢了；群消息同理，撤回或清理后无法追溯。
2. 媒体访问依赖微博 API 实时可用且 Cookie 有效。一旦限流或凭证失效，整条链路瘫痪。

用户希望把微博内容与群消息持久化到本地 SQLite，并能查询带媒体 base64 的完整结果，使历史可回溯、媒体可离线预览。已有两个参考实现（weiboblog 的微博落库、weibogroup 的群消息落库），本 PRD 将其设计搬运并适配到本项目的 Spring Boot 技术栈。

## Solution

引入 SQLite + JdbcTemplate 持久化层，新建四张表（bloggers/posts/groups/messages），新建两个 service：PostService 负责微博内容与媒体的保存/查询，ChatService 负责群组与群消息的保存/查询。两个 service 有自己的领域 record，不直接耦合 API 层的 record，通过 mapper 双向转换。媒体信息只存 URL/fid，查询时通过现有 WeiboHttpClient 实时取 bytes 并在 service 层编码为 base64 返回。最终通过 Controller 接口体现两个 service 的保存与查询能力。

## User Stories

1. 作为使用者，我想把某博主最近的微博保存到本地数据库，以便博主删博后我仍能回看。
2. 作为使用者，我想按时间范围保存某博主在指定区间内的微博，以便补全某段时间的历史记录。
3. 作为使用者，我想查询某博主的微博列表，每条微博的图片以缩略图 base64 形式内联返回，以便无需二次请求即可预览图片。
4. 作为使用者，我想查询某博主的微博列表，每条微博的视频以封面 base64 + 跳转地址形式内联返回，以便预览视频内容并跳转到微博观看。
5. 作为使用者，我想获取某条微博某张图片的大图 base64，以便查看高清原图。
6. 作为使用者，我想查询到转发微博的原文全文，以便完整了解被转发的内容。
7. 作为使用者，我想查询到转发微博的原转发内容全文，以便完整了解原微博的内容。
8. 作为使用者，我想查询到转发微博的图片缩略图 base64 和视频封面 base64，以便预览转发原微博的媒体。
9. 作为使用者，我想获取转发微博某张图片的大图 base64，以便查看转发原微博的高清原图。
10. 作为使用者，我想把某群最近的消息保存到本地数据库，以便群消息被撤回或清理后我仍能回看。
11. 作为使用者，我想回填某群从指定时间点到现在的全部历史消息，以便补全该群的历史记录。
12. 作为使用者，我想查询某群的消息列表，图片消息以压缩图 base64 形式内联返回，以便无需二次请求即可预览图片。
13. 作为使用者，我想查询某群的消息列表，视频消息以封面 base64 形式内联返回，以便预览视频内容。
14. 作为使用者，我想获取某条群图片消息的原图 base64，以便查看高清原图。
15. 作为使用者，我想查询群消息时按时间区间过滤，以便只看某段时间的对话。
16. 作为使用者，我想保存微博时自动识别长文微博并补全全文，以免只存到摘要。
17. 作为使用者，我想保存微博时自动识别转发原微博的长文并补全全文，以免转发原文只存到摘要。
18. 作为使用者，我想保存群消息时正确处理"从旧到新"的 API 返回顺序与 max_mid 游标，以便增量拉取不丢消息不重复。
19. 作为使用者，我想查询微博/群消息时返回博主/群组的元信息（昵称、头像等），以便识别内容来源。
20. 作为使用者，我想在项目启动时自动创建数据库表，以便无需手动执行迁移脚本。

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

posts（微博内容，weibo_posts 改名；图片档位 thumbnail+large；视频拆为封面 URL + 文章页 URL；不存 raw_json；增量游标存 bloggers.latest_post_id，不现算）：

```sql
CREATE TABLE IF NOT EXISTS posts (
    id              BIGINT PRIMARY KEY AUTOINCREMENT,
    mblogid         VARCHAR NOT NULL UNIQUE,
    post_id         BIGINT NOT NULL,
    uid             BIGINT NOT NULL,
    text            TEXT DEFAULT '',
    text_raw        TEXT DEFAULT '',
    long_text       TEXT DEFAULT '',
    is_long_text    INT DEFAULT 0,
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

`pics_json` 每项结构（thumbnail + large 两档）：

```json
{"pid":"abc","thumbnail":{"url":"...","w":0,"h":0},"large":{"url":"...","w":0,"h":0}}
```

`retweeted_json` 结构（转发原微博，镜像 posts 的媒体结构；long_text 存原微博长文全文）：

```json
{"post_id":0,"mblogid":"","text_raw":"","uid":0,"screen_name":"",
 "created_at":0,"is_long_text":0,"long_text":"",
 "pics":[{"pid":"","thumbnail":{"url":"","w":0,"h":0},"large":{"url":"","w":0,"h":0}}],
 "video_cover_url":"","video_page_url":""}
```

groups（群组，源自 weibogroup，删 raw_json 及未用字段；保留 min_mid/max_mid 两列，ChatService 增量读 max_mid、全量可选读 min_mid）：

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
    min_mid      VARCHAR DEFAULT '',   -- 已存最旧消息 mid，全量可从这起往前翻
    max_mid      VARCHAR DEFAULT '',   -- 已存最新消息 mid，增量停止/过滤基准
    created_at   BIGINT DEFAULT 0,
    updated_at   BIGINT DEFAULT 0
);
```

> min_mid/max_mid 不随消息写入逐条更新，由 `refreshGroupRange(gid)` 在一次拉取结束后用 `SELECT MIN(mid), MAX(mid) FROM messages WHERE gid=?` 重算写回。

messages（群消息，源自 weibogroup，删 raw_json/media_local_path 及未用字段；显式建 (gid, created_at) 复合索引）：

```sql
CREATE TABLE IF NOT EXISTS messages (
    id            BIGINT PRIMARY KEY AUTOINCREMENT,
    mid           VARCHAR NOT NULL UNIQUE,
    gid           BIGINT NOT NULL,
    msg_type      INT NOT NULL DEFAULT 0,
    msg_type_name VARCHAR DEFAULT '',
    media_type    INT DEFAULT 0,
    sender_id     BIGINT DEFAULT 0,
    sender_name   VARCHAR DEFAULT '',
    text          TEXT DEFAULT '',
    fid           VARCHAR DEFAULT '',
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

所有时间戳均为毫秒级 Unix 时间戳，存 BIGINT。

### 前置：补齐 API record 字段

当前 API 层 record 缺媒体字段，落库前必须先补（改 `model/response` 包）。ObjectMapper 已配 `FAIL_ON_UNKNOWN_PROPERTIES=false`，多余字段安全。

- `Mblog`：补 `pic_infos`（Map<String, PicInfo>，PicInfo 含 thumbnail/large 各 {url, w, h}）、`page_info`（含 `page_pic` 封面直链）、`retweeted_status`（递归 `Mblog`，转发原微博）。参考 `WEIBO_API_RAW.md` 的 pic_infos/page_info 字段结构。
- `Message`：补 `fids`（List<String>）、`annotations`（含 `video_pic_fid` 视频封面 fid）。参考 `WEIBO_API_RAW.md` 的群消息字段结构。

### service 对象层（解耦 API record）

新建包 `xyz.fz.weibo.domain`，定义 service 自己的 record，仅含要存/查的字段，不耦合 API record：

- `PostRecord`：字段对应 posts 表，`pics` 为 `List<PicInfo>`、`video` 为 `VideoInfo`（coverUrl + pageUrl）、`retweeted` 为 `RetweetInfo`（镜像结构，含自己的 pics/video）。
- `MessageRecord`：字段对应 messages 表，媒体为 `fid`/`mediaType`/`urlObjects`/`picInfos`。

新建 mapper（`xyz.fz.weibo.service.mapper`）：

- `PostMapper.toRecord(Mblog, LongTextResponse)`：API record -> PostRecord。
- `PostMapper` 实现 `RowMapper<PostRecord>`：DB 行 -> PostRecord（pics_json/retweeted_json 反序列化）。
- `MessageMapper` 同理。

### PostService

```
// 保存
saveIncremental(uid)            // 增量拉新：读 bloggers.latest_post_id，从最新往旧翻，存 post_id > latest_post_id 的，翻到碰到 post_id <= latest_post_id 停
saveByRange(uid, start, end)    // searchProfile 按日翻（starttime/endtime 为当日 CST 起止秒级时间戳），逐日翻页直到 list 空

// 查询
queryPosts(uid, start, end)     // 返回 List<PostRecord>；每张图内联 thumbnail base64，每个视频内联 cover base64 + video_page_url；转发微博的缩略/封面同样内联
queryPostLargeImage(postId, pid) // 返回该图 large 档 base64；service 内部判断 pid 属于原微博还是转发，从对应存储取 large URL
```

增量停止判定：开始时读 `bloggers.latest_post_id`（已存最大 post_id）。从最新页起翻，逐条比较：接口拉到的 `post_id > latest_post_id` 的是新消息，存；翻到某条 `post_id <= latest_post_id`，说明已进入已存范围，**拉取完毕，停**。拉取结束后 `refreshBloggerRange(uid)` 用 `SELECT MAX(post_id) FROM posts WHERE uid=?` 重算写回 bloggers.latest_post_id。与 ChatService 增量读 groups.max_mid 对称。

长文补全注意点（关键）：`text` 字段在 `is_long_text=true` 时只是摘要，必须调 longtext 接口补全到 `long_text`。这个判断在两处都要做：原微博（补到 posts.long_text）和转发原微博（补到 retweeted_json.long_text）。逐条判断，逐条补全。

视频跳转：posts 视频用文章页 URL（永久有效，不带签名不过期）做跳转地址。

保存入库用 `INSERT OR IGNORE`（靠 mblogid UNIQUE 去重），返回是否新增。博主信息在首次抓取时从 `posts[0].user` 提取并 upsert 到 bloggers 表。

### ChatService

```
// 保存
saveIncremental(gid)                    // 增量拉新：读 groups.max_mid，从最新往旧翻，存 mid > max_mid 的，翻到碰到 mid <= max_mid 停
saveFull(gid, sinceTime, minMid?)        // 全量拉历史：从 minMid（可选，不传则从最新）往前翻，无页数上限，翻到空页或撞 sinceTime 停

// 查询
queryMessages(gid, start, end)           // 返回 List<MessageRecord>；图片消息内联 compress base64，视频消息内联 cover base64
queryMessageLargeMedia(gid, mid)         // 返回该消息 origin 档 base64
```

两个保存模式的停止判定：

- **增量 `saveIncremental(gid)`**：开始时读 `groups.max_mid`（已存最大 mid，字符串比较）。从最新页起翻，逐条比较：接口拉到的 `mid > max_mid` 的是新消息，存；翻到某条 `mid <= max_mid`，说明已经进入已存范围，**拉取完毕，停**。翻页游标用本页 msgs[0]（页内最旧）传给 `max_mid` API 参数取更早的页。拉取结束后 `refreshGroupRange(gid)` 重算 min_mid/max_mid 写回 groups。
- **全量 `saveFull(gid, sinceTime, minMid?)`**：`minMid` 可选，不传则从最新页起翻；传了则从该 mid 起往前翻（用于填补已存最旧之前的历史空隙）。无页数上限，翻到空页或某条 `created_at < sinceTime` 停。页内遍历用 `reversed`（从新到旧），遇 `created_at < sinceTime` 即停。是否传 minMid 完全由用户决定，service 不自行判断"首次/非首次"。拉取结束后 `refreshGroupRange(gid)`。

注意：群聊 query_messages API 只有 `max_mid` 游标翻页，**没有** starttime/endtime 参数。所以全量的时间下限靠客户端逐条判 `created_at < sinceTime` 实现，不是服务端过滤。这与 PostService 的 `saveByRange`（searchProfile 服务端支持 starttime/endtime）不同。

页内顺序（query_messages API 约定）：一页 50 条内从旧到新排列，`msgs[0]` 是本页最旧，`msgs[-1]` 是本页最新。`max_mid` API 参数语义=取比该 mid 更早的消息；传空=取最新页。

群聊视频：只返回封面 base64，不提供跳转地址（群视频是聊天文件，靠 fid+cookie 通过 mss/msget 取，无公开文章页 URL）。

保存入库用 `INSERT OR IGNORE`（靠 mid UNIQUE 去重）。群组信息在抓取群列表时 upsert 到 groups 表。

### 媒体 base64 编码

base64 编码在 service 层完成。service 返回的 record 里媒体字段直接是 base64 字符串。媒体 bytes 通过现有 `WeiboHttpClient.getForBytes()` / `DirectMediaApi.download()` / `GroupMediaApi.download()` 获取。

- posts 图片：thumbnail/large URL 走 `DirectMediaApi.download()`（不带 cookie，用 HEADERS_DIRECT）。
- posts 视频封面：`page_pic` 直链走 `DirectMediaApi.download()`。
- messages 图片：fid + imageType（compress/origin）走 `GroupMediaApi.download()`（带 cookie，用 HEADERS_MSGET）。
- messages 视频封面：`annotations.video_pic_fid` 走 `GroupMediaApi.download()`（不附加 imageType）。

### Controller 接口

遵循现有命名约定（`Weibo` 前缀 + `@RequestMapping("/weibo/<domain>")`，构造器注入）。新增接口体现两个 service 的能力：

PostService 相关（`/weibo/post`）：
- 保存增量、保存按时间范围、查询微博（带时间区间）、查大图 base64。

ChatService 相关（`/weibo/chat`）：
- 保存增量、保存全量（带 sinceTime、可选 minMid）、查询消息（带时间区间）、查原图 base64。

异常处理复用现有 `WeiboExceptionHandler`（Cookie 失效->401，限流->429 等）。

## Testing Decisions

### 测试 seam：两个

1. **Controller 单元测试**：沿用现有 `@WebMvcTest` 风格，mock 对象从 Api 层改为 service 层（`@MockitoBean`），验证 HTTP 状态码与 JSON 字段。参考 `WeiboBlogControllerTest`、`WeiboGroupControllerTest`、`WeiboMediaControllerTest` 的现有写法。
2. **service 单元测试**：mock Api 层（`@MockitoBean` 或直接构造注入 mock），DB 用 SQLite 内存库（`jdbc:sqlite::memory:` + 启动时加载 schema.sql）测真实 SQL 与 RowMapper，媒体 base64 逻辑用固定 byte[] 断言。失败定位快，与项目轻量测试风格一致。

### 好测试的标准

- 只测外部行为，不测实现细节（不测 service 内部私有方法、不测 SQL 字符串拼接）。
- Controller 测：给定 service 返回 X，HTTP 响应状态码与 JSON 字段符合预期。
- service 测：给定 mock Api 返回 X、DB 已存 Y，service 返回 Z（含 base64 内容断言）或 DB 状态符合预期（用查询验证写入）。
- 长文补全测：给 `is_long_text=true` 的微博，验证 longtext 接口被调用且 long_text 字段被填充（原微博与转发两处都测）。
- 群消息增量测：给 DB 已存 max_mid=X，mock 多页 API 返回（页内旧到新），验证存下 mid > X 的、翻到 mid <= X 停、翻页游标用 msgs[0].id、结束后 max_mid 被刷新。
- 群消息全量测：给 sinceTime，验证无页数上限翻到空页或 created_at < sinceTime 停、minMid 可选控制起点、reversed 遍历顺序。

### 模块

- PostService、ChatService：service 单元测。
- PostMapper、MessageMapper：随 service 测或单独测映射正确性。
- RowMapper：随 service 测（内存库读回验证）。
- schema.sql：随 service 测隐式验证（内存库加载即验证建表正确性）。

### 现有先例

- `WeiboBlogControllerTest`：`@WebMvcTest` + `@MockitoBean` mock Api 层，验证状态码与 JSON。Controller 测照搬。
- service 测无现有先例，需新建测试基类（内存库初始化）。

## Out of Scope

- 视频文件的 bytes 下载与 base64（用户明确不要，太大）。
- 媒体文件本地磁盘缓存（messages 不存 media_local_path，查询时实时取 base64，不落盘）。
- 群消息全文搜索（FTS5）（参考项目建了但实际用 LIKE，本 PRD 不做搜索）。
- 多账号隔离、Controller 鉴权、并发隔离（ADR-0001 约束，单用户本地工具）。
- 媒体 URL 过期处理（posts 视频用永久文章页 URL 规避；图片/封面直链若过期则查询失败，重拉即重存）。
- 全量回填模式（PostService 不做"翻到底"的全量，只做增量 + 按时间范围；ChatService 的全量 `saveFull` 由 sinceTime 下限控制，不做无下限的"翻到底"）。
- probe_boundary 群最早可爬边界探测（weibogroup 有此能力，用 mid↔ts 线性回归 + 指数后退 + 二分查找盲测入群边界，本 PRD 不搬）。
- 群聊视频跳转地址（群视频无公开网页链接，只返回封面 base64）。
- raw_json 兜底列（schema 只含明确要存的字段）。
- 数据库迁移版本管理（用 schema.sql 幂等建表，不引 Flyway）。

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
4. PostService（保存 + 查询 + 长文补全 + base64）。
5. ChatService（保存 + 查询 + 翻页方向 + base64）。
6. Controller 接口（`/weibo/post`、`/weibo/chat`）。
