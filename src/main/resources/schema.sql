CREATE TABLE IF NOT EXISTS bloggers (
    uid             BIGINT PRIMARY KEY,
    screen_name     VARCHAR NOT NULL DEFAULT '',
    avatar          VARCHAR DEFAULT '',
    profile_url     VARCHAR DEFAULT '',
    verified        INT DEFAULT 0,
    latest_post_id  BIGINT DEFAULT 0,
    created_at      BIGINT DEFAULT 0,
    updated_at      BIGINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS posts (
    mblogid          VARCHAR PRIMARY KEY NOT NULL,
    post_id          BIGINT NOT NULL,
    uid              BIGINT NOT NULL,
    content          TEXT DEFAULT '',
    content_raw      TEXT DEFAULT '',
    source           VARCHAR DEFAULT '',
    region           VARCHAR DEFAULT '',
    pics_json        TEXT DEFAULT '[]',
    video_cover_url  VARCHAR DEFAULT '',
    video_page_url   VARCHAR DEFAULT '',
    retweeted_json   TEXT DEFAULT '',
    reposts_count    INT DEFAULT 0,
    comments_count   INT DEFAULT 0,
    attitudes_count  INT DEFAULT 0,
    created_at       BIGINT NOT NULL,
    saved_at         BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_uid_ctime_post ON posts(uid, created_at DESC, post_id DESC);
CREATE INDEX IF NOT EXISTS idx_posts_ctime_post ON posts(created_at DESC, post_id DESC);
CREATE INDEX IF NOT EXISTS idx_posts_post_id ON posts(post_id);

CREATE TABLE IF NOT EXISTS groups (
    gid           BIGINT PRIMARY KEY,
    name          VARCHAR NOT NULL DEFAULT '',
    avatar        VARCHAR DEFAULT '',
    member_count  INT DEFAULT 0,
    max_member    INT DEFAULT 0,
    owner_id      BIGINT DEFAULT 0,
    admins        TEXT DEFAULT '[]',
    summary       VARCHAR DEFAULT '',
    group_type    INT DEFAULT 0,
    min_mid       BIGINT DEFAULT 0,
    max_mid       BIGINT DEFAULT 0,
    created_at    BIGINT DEFAULT 0,
    updated_at    BIGINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
    mid              BIGINT PRIMARY KEY NOT NULL,
    gid              BIGINT NOT NULL,
    msg_type         INT NOT NULL DEFAULT 0,
    msg_type_name    VARCHAR DEFAULT '',
    media_type       INT DEFAULT 0,
    sender_id        BIGINT DEFAULT 0,
    sender_name      VARCHAR DEFAULT '',
    sender_avatar    VARCHAR DEFAULT '',
    text             TEXT DEFAULT '',
    fid              VARCHAR DEFAULT '',
    video_cover_fid  VARCHAR DEFAULT '',
    media_orig_url   VARCHAR DEFAULT '',
    url_objects      TEXT DEFAULT '',
    pic_infos        TEXT DEFAULT '',
    template         VARCHAR DEFAULT '',
    template_data    TEXT DEFAULT '{}',
    recall_mids      TEXT DEFAULT '[]',
    recall_by        VARCHAR DEFAULT '',
    created_at       BIGINT NOT NULL,
    saved_at         BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_msg_gid_ctime ON messages(gid, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_gid_ctime_cover ON messages(gid, created_at, mid, sender_name, text);
