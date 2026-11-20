use axum::extract::{RawQuery, Request, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use jiff::{Timestamp, civil::DateTime};
use reqwest::Method;
use rusqlite::{OptionalExtension, Row, params, params_from_iter, types::Value as SqlValue};
use serde_json::{Value, json};

use crate::{
    AppState, shanghai,
    weibo::{self, HeaderProfile, Retry, WeiboError},
};

type ApiResult<T> = Result<T, WeiboError>;

pub(crate) fn routes() -> Router<AppState> {
    Router::new()
        .route("/post/bloggers", get(bloggers).post(add_blogger))
        .route("/post/calendar", get(calendar))
        .route("/post/list", get(list))
        .route("/post/incremental", post(incremental))
        .route("/post/range", post(range))
        .route("/post/like", get(local_like).post(set_local_like))
        .route("/weibo/blog/like", get(raw_like).post(set_raw_like))
        .route("/weibo/blog/mymblog", get(raw_blog))
        .route("/weibo/blog/longtext", get(raw_long_text))
        .route("/weibo/blog/searchProfile", get(raw_search))
}

fn bad_request(message: impl Into<String>) -> WeiboError {
    WeiboError::new(StatusCode::BAD_REQUEST, message)
}

fn database_error(error: impl std::fmt::Display) -> WeiboError {
    WeiboError::new(StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
}

fn blogger(row: &Row<'_>, index: usize) -> rusqlite::Result<Value> {
    Ok(json!({
        "uid": row.get::<_, i64>(index)?,
        "screenName": row.get::<_, String>(index + 1)?,
        "avatar": row.get::<_, Option<String>>(index + 2)?,
        "profileUrl": row.get::<_, Option<String>>(index + 3)?,
        "verified": row.get::<_, Option<i64>>(index + 4)?.unwrap_or_default() != 0
    }))
}

async fn bloggers(State(state): State<AppState>) -> ApiResult<Json<Vec<Value>>> {
    let values = state
        .db
        .run(|db| {
            db.prepare(
                "SELECT uid, screen_name, avatar, profile_url, verified FROM bloggers ORDER BY uid",
            )?
            .query_map([], |row| blogger(row, 0))?
            .collect::<rusqlite::Result<Vec<_>>>()
        })
        .await
        .map_err(database_error)?;
    Ok(Json(values))
}

async fn calendar(
    State(state): State<AppState>,
    RawQuery(raw): RawQuery,
) -> ApiResult<Json<Value>> {
    let parameters = query_pairs(raw.as_deref());
    let uid = parse_optional::<i64>(&parameters, "uid")?;
    let days =
        state
            .db
            .run(move |db| {
                db.prepare(
                "SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', '+8 hours') AS day,
                        count(*) FROM posts WHERE (?1 IS NULL OR uid = ?1)
                 GROUP BY day ORDER BY day DESC",
            )?
            .query_map([uid], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()
            })
            .await
            .map_err(database_error)?;
    let mut months: Vec<(String, i64, Vec<Value>)> = Vec::new();
    for (date, count) in days {
        let month = date.get(..7).unwrap_or(&date);
        if months.last().is_none_or(|entry| entry.0 != month) {
            months.push((month.to_owned(), 0, Vec::new()));
        }
        let (_, total, entries) = months.last_mut().expect("a month for every day");
        *total += count;
        entries.push(json!({"date": date, "count": count}));
    }
    Ok(Json(
        json!({"months": months.into_iter().map(|(month, count, days)| {
        json!({"month": month, "count": count, "days": days})
    }).collect::<Vec<_>>()}),
    ))
}

async fn list(State(state): State<AppState>, RawQuery(raw): RawQuery) -> ApiResult<Json<Value>> {
    let parameters = query_pairs(raw.as_deref());
    let page = parse_optional::<i32>(&parameters, "page")?.unwrap_or(1);
    let size = parse_optional::<i32>(&parameters, "size")?.unwrap_or(100);
    if page < 1 {
        return Err(bad_request("page 必须大于等于 1。"));
    }
    if !(1..=9999).contains(&size) {
        return Err(bad_request("size 必须介于 1 和 9999 之间。"));
    }
    let start = parameter(&parameters, "start")
        .filter(|v| !v.is_empty())
        .map(parse_time)
        .transpose()?;
    let end = parameter(&parameters, "end")
        .filter(|v| !v.is_empty())
        .map(parse_time)
        .transpose()?;
    if matches!((start, end), (Some(start), Some(end)) if start > end) {
        return Err(bad_request("start 不能晚于 end。"));
    }
    let uids = parameters
        .iter()
        .filter(|(key, _)| key == "uids")
        .map(|(_, value)| {
            if value.contains(',') {
                return Err(bad_request("uids 必须使用重复查询参数传递。"));
            }
            value
                .parse::<i64>()
                .map_err(|_| bad_request("uids 格式无效。"))
        })
        .collect::<ApiResult<Vec<_>>>()?;
    let keyword = parameter(&parameters, "keyword").filter(|value| !value.trim().is_empty());
    let mut conditions = vec!["1=1".to_owned()];
    let mut args: Vec<SqlValue> = Vec::new();
    if !uids.is_empty() {
        let marks = std::iter::repeat_n("?", uids.len())
            .collect::<Vec<_>>()
            .join(",");
        conditions.push(format!("uid IN ({marks})"));
        args.extend(uids.into_iter().map(SqlValue::Integer));
    }
    if let Some(start) = start {
        conditions.push("created_at >= ?".to_owned());
        args.push(start.into());
    }
    if let Some(end) = end {
        conditions.push("created_at <= ?".to_owned());
        args.push(end.into());
    }
    if let Some(keyword) = keyword {
        let escaped = keyword
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        let pattern = format!("%{escaped}%");
        conditions.push(r"(content LIKE ? ESCAPE '\' OR json_extract(nullif(retweeted_json, ''), '$.content') LIKE ? ESCAPE '\')".to_owned());
        args.extend([SqlValue::Text(pattern.clone()), SqlValue::Text(pattern)]);
    }
    let filters = conditions.join(" AND ");
    let (items, total) = state
        .db
        .run(move |db| {
            let total: i64 = db.query_row(
                &format!("SELECT count(*) FROM posts WHERE {filters}"),
                params_from_iter(&args),
                |row| row.get(0),
            )?;
            args.push(i64::from(size).into());
            args.push(((i64::from(page) - 1) * i64::from(size)).into());
            let sql = format!(
                "SELECT p.mblogid, p.post_id, p.uid, p.content, p.content_raw, p.source, p.region,
                        p.pics_json, p.video_cover_url, p.video_page_url, p.retweeted_json,
                        p.reposts_count, p.comments_count, p.attitudes_count, p.created_at, p.saved_at,
                        b.uid, b.screen_name, b.avatar, b.profile_url, b.verified
                 FROM (SELECT * FROM posts WHERE {filters}
                       ORDER BY created_at DESC, post_id DESC LIMIT ? OFFSET ?) p
                 JOIN bloggers b ON b.uid = p.uid
                 ORDER BY p.created_at DESC, p.post_id DESC"
            );
            let rows = db.prepare(&sql)?.query_map(params_from_iter(&args), post_view)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok((rows, total))
        })
        .await
        .map_err(database_error)?;
    Ok(Json(
        json!({"items": items, "page": page, "size": size, "total": total}),
    ))
}

fn post_view(row: &Row<'_>) -> rusqlite::Result<Value> {
    let id: String = row.get(0)?;
    let uid: i64 = row.get(2)?;
    let pictures = read_json(row.get(7)?);
    let quoted = read_json(row.get(10)?);
    let cover: Option<String> = row.get(8)?;
    let page: Option<String> = row.get(9)?;
    let quoted = quoted.is_object().then(|| json!({
        "postId": number(&quoted["post_id"]), "mblogId": string(&quoted["mblogid"]),
        "content": string(&quoted["content"]), "contentRaw": string(&quoted["content_raw"]),
        "uid": number(&quoted["uid"]), "screenName": string(&quoted["screen_name"]),
        "createdAt": number(&quoted["created_at"]), "pics": image_views(&id, &quoted["pics"]),
        "video": video_view(&id, string(&quoted["video_cover_url"]), string(&quoted["video_page_url"]), true)
    }));
    Ok(json!({
        "mblogId": id, "postId": row.get::<_, i64>(1)?, "uid": uid,
        "postUrl": format!("https://weibo.com/{uid}/{id}"),
        "content": row.get::<_, Option<String>>(3)?, "contentRaw": row.get::<_, Option<String>>(4)?,
        "source": row.get::<_, Option<String>>(5)?, "region": row.get::<_, Option<String>>(6)?,
        "pics": image_views(&id, &pictures),
        "video": video_view(&id, cover.as_deref().unwrap_or_default(), page.as_deref().unwrap_or_default(), false),
        "retweeted": quoted,
        "repostsCount": row.get::<_, Option<i64>>(11)?.unwrap_or_default(),
        "commentsCount": row.get::<_, Option<i64>>(12)?.unwrap_or_default(),
        "attitudesCount": row.get::<_, Option<i64>>(13)?.unwrap_or_default(),
        "createdAt": row.get::<_, i64>(14)?, "savedAt": row.get::<_, i64>(15)?,
        "blogger": blogger(row, 16)?
    }))
}

fn image_views(id: &str, pictures: &Value) -> Vec<Value> {
    pictures.as_array().into_iter().flatten().map(|picture| {
        let pid = string(&picture["pid"]);
        let thumbnail = &picture["thumbnail"];
        let original = &picture["original"];
        let url = |reference: &Value, variant| {
            if string(reference).trim().is_empty() {
                String::new()
            } else {
                format!("/post/image?mblogId={}&pid={}&variant={variant}", encode(id), encode(pid))
            }
        };
        json!({"pid": pid, "thumbnailWidth": number(&thumbnail["w"]), "thumbnailHeight": number(&thumbnail["h"]),
            "originalWidth": number(&original["w"]), "originalHeight": number(&original["h"]),
            "thumbnailUrl": url(&thumbnail["url"], "thumbnail"), "originalUrl": url(&original["url"], "original")})
    }).collect()
}

fn video_view(id: &str, cover: &str, page: &str, quoted: bool) -> Value {
    let url = if cover.trim().is_empty() {
        String::new()
    } else {
        format!(
            "/post/videoCover?mblogId={}{}",
            encode(id),
            if quoted { "&retweeted=true" } else { "" }
        )
    };
    json!({"coverUrl": url, "pageUrl": page})
}

fn encode(value: &str) -> String {
    use std::fmt::Write;
    let mut encoded = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            encoded.push(char::from(byte));
        } else {
            let _ = write!(encoded, "%{byte:02X}");
        }
    }
    encoded
}

fn read_json(text: Option<String>) -> Value {
    text.and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn number(value: &Value) -> i64 {
    value.as_i64().unwrap_or_default()
}

fn string(value: &Value) -> &str {
    value.as_str().unwrap_or_default()
}

fn query_pairs(raw: Option<&str>) -> Vec<(String, String)> {
    let mut url = reqwest::Url::parse("http://localhost").expect("static URL");
    url.set_query(raw);
    url.query_pairs().into_owned().collect()
}

fn parameter<'a>(parameters: &'a [(String, String)], key: &str) -> Option<&'a str> {
    parameters
        .iter()
        .find(|(name, _)| name == key)
        .map(|(_, value)| value.as_str())
}

fn parse_optional<T: std::str::FromStr>(
    parameters: &[(String, String)],
    key: &str,
) -> ApiResult<Option<T>> {
    parameter(parameters, key)
        .filter(|value| !value.is_empty())
        .map(|value| {
            value
                .parse()
                .map_err(|_| bad_request(format!("{key} 格式无效。")))
        })
        .transpose()
}

fn parse_time(value: &str) -> ApiResult<i64> {
    DateTime::strptime("%Y-%m-%d %H:%M:%S", value)
        .ok()
        .and_then(shanghai::milliseconds)
        .ok_or_else(|| bad_request("日期格式无效。"))
}

const STATUSES_URL: &str = "https://weibo.com/ajax/statuses";
static RANGE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn required<T: std::str::FromStr>(query: &[(String, String)], name: &str) -> ApiResult<T> {
    parse_optional(query, name)?.ok_or_else(|| bad_request(format!("{name} 不能为空。")))
}

fn upstream_error(message: impl Into<String>) -> WeiboError {
    WeiboError::new(StatusCode::BAD_GATEWAY, message)
}

async fn blog(state: &AppState, uid: i64, page: i32, since: Option<&str>) -> ApiResult<Value> {
    let mut query = vec![
        ("uid", uid.to_string()),
        ("page", page.to_string()),
        ("feature", "0".to_owned()),
    ];
    if let Some(since) = since {
        query.push(("since_id", since.to_owned()));
    }
    let url = weibo::with_query(&format!("{STATUSES_URL}/mymblog"), &query);
    weibo::json(
        weibo::request(
            state,
            Method::GET,
            &url,
            HeaderProfile::Ajax,
            true,
            Retry::RateLimit,
            |request| request,
        )
        .await?,
    )
    .await
}

pub(crate) async fn long_text(state: &AppState, id: &str) -> ApiResult<Value> {
    let url = weibo::with_query(&format!("{STATUSES_URL}/longtext"), &[("id", id)]);
    let response = weibo::request(
        state,
        Method::GET,
        &url,
        HeaderProfile::Ajax,
        true,
        Retry::RateLimit,
        |request| request,
    )
    .await?;
    let text = weibo::text(response).await?;
    Ok(serde_json::from_str(&text).unwrap_or_else(|_| json!({"data":null,"ok":1})))
}

async fn search(state: &AppState, uid: i64, page: i32, start: i64, end: i64) -> ApiResult<Value> {
    let mut query = vec![
        ("uid", uid.to_string()),
        ("page", page.to_string()),
        ("starttime", start.to_string()),
        ("endtime", end.to_string()),
    ];
    query.extend(
        [
            "hasori", "hasret", "hastext", "haspic", "hasvideo", "hasmusic",
        ]
        .into_iter()
        .map(|name| (name, "1".to_owned())),
    );
    let url = weibo::with_query(&format!("{STATUSES_URL}/searchProfile"), &query);
    let referer = header::HeaderValue::from_str(&format!("https://weibo.com/u/{uid}"))
        .expect("referer contains a numeric UID");
    let response = weibo::request(
        state,
        Method::GET,
        &url,
        HeaderProfile::Ajax,
        true,
        Retry::RateLimit,
        |request| {
            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert(header::REFERER, referer.clone());
            request.headers(headers)
        },
    )
    .await?;
    let text = weibo::text(response).await?;
    Ok(serde_json::from_str(&text)
        .unwrap_or_else(|_| json!({"ok":1,"data":{"list":[],"total":0,"absstr":""}})))
}

async fn raw_blog(
    State(state): State<AppState>,
    RawQuery(raw): RawQuery,
) -> ApiResult<Json<Value>> {
    let query = query_pairs(raw.as_deref());
    let response = blog(
        &state,
        required(&query, "uid")?,
        required(&query, "page")?,
        parameter(&query, "sinceId"),
    )
    .await?;
    let data = &response["data"];
    Ok(Json(
        json!({"ok":to_int(&response["ok"]),"data":data.is_object().then(|| json!({
            "since_id": java_string(&data["since_id"]),
            "list": raw_mblogs(&data["list"]),
            "total": to_int(&data["total"]),
        }))}),
    ))
}

async fn raw_long_text(
    State(state): State<AppState>,
    RawQuery(raw): RawQuery,
) -> ApiResult<Json<Value>> {
    let query = query_pairs(raw.as_deref());
    let response = long_text(&state, &required::<String>(&query, "id")?).await?;
    let data = &response["data"];
    Ok(Json(
        json!({"ok":to_int(&response["ok"]),"data":data.is_object().then(|| json!({
            "longTextContent":java_string(&data["longTextContent"]),
            "longTextContent_raw":java_string(&data["longTextContent_raw"]),
            "isMarkdown":java_bool(&data["isMarkdown"]),
            "url_struct":data["url_struct"],
        }))}),
    ))
}

async fn raw_search(
    State(state): State<AppState>,
    RawQuery(raw): RawQuery,
) -> ApiResult<Json<Value>> {
    let query = query_pairs(raw.as_deref());
    let response = search(
        &state,
        required(&query, "uid")?,
        required(&query, "page")?,
        required(&query, "startTime")?,
        required(&query, "endTime")?,
    )
    .await?;
    let data = &response["data"];
    Ok(Json(
        json!({"ok":to_int(&response["ok"]),"data":data.is_object().then(|| json!({
            "list": raw_mblogs(&data["list"]), "total":data["total"], "absstr":java_string(&data["absstr"]),
        }))}),
    ))
}

fn java_string(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Number(_) | Value::Bool(_) => Some(value.to_string()),
        _ => None,
    }
}

fn java_bool(value: &Value) -> bool {
    value
        .as_bool()
        .or_else(|| value.as_str().and_then(|value| value.parse().ok()))
        .unwrap_or_else(|| value.as_i64().is_some_and(|value| value != 0))
}

fn raw_mblogs(list: &Value) -> Option<Vec<Value>> {
    list.as_array()
        .map(|list| list.iter().map(raw_mblog).collect())
}

fn raw_mblog(item: &Value) -> Value {
    if !item.is_object() {
        return Value::Null;
    }
    let mut projected = serde_json::Map::new();
    for name in [
        "mblogid",
        "created_at",
        "text",
        "text_raw",
        "source",
        "region_name",
    ] {
        projected.insert(name.to_owned(), json!(java_string(&item[name])));
    }
    for name in [
        "pic_num",
        "reposts_count",
        "comments_count",
        "attitudes_count",
    ] {
        projected.insert(name.to_owned(), json!(to_int(&item[name])));
    }
    projected.insert("id".into(), json!(integer(&item["id"])));
    projected.insert("isLongText".into(), json!(java_bool(&item["isLongText"])));
    let user = &item["user"];
    projected.insert(
        "user".into(),
        json!(user.is_object().then(|| {
            let mut fields = serde_json::Map::new();
            for name in [
                "screen_name",
                "profile_image_url",
                "avatar_large",
                "avatar_hd",
                "profile_url",
            ] {
                fields.insert(name.into(), json!(java_string(&user[name])));
            }
            fields.insert("id".into(), json!(integer(&user["id"])));
            fields.insert("verified".into(), json!(java_bool(&user["verified"])));
            fields
        })),
    );
    projected.insert("pic_infos".into(), json!(item["pic_infos"].as_object().map(|pictures| {
        pictures.iter().map(|(pid, info)| {
            let sizes = info.is_object().then(|| ["thumbnail", "large", "original", "largest"].into_iter()
                .map(|size| {
                    let image = &info[size];
                    (size.to_owned(), json!(image.is_object().then(|| json!({
                        "url":java_string(&image["url"]),"width":to_int(&image["width"]),"height":to_int(&image["height"])
                    }))))
                }).collect::<serde_json::Map<_, _>>());
            (pid.clone(), json!(sizes))
        }).collect::<serde_json::Map<_, _>>()
    })));
    projected.insert("page_info".into(), raw_page(&item["page_info"]));
    projected.insert(
        "retweeted_status".into(),
        raw_mblog(&item["retweeted_status"]),
    );
    let media = &item["mix_media_info"];
    projected.insert("mix_media_info".into(), json!(media.is_object().then(|| json!({
        "items": media["items"].as_array().map(|items| items.iter().map(|item| {
            json!(item.is_object().then(|| json!({"type":java_string(&item["type"]), "data":raw_page(&item["data"])})))
        }).collect::<Vec<_>>())
    }))));
    Value::Object(projected)
}

fn raw_page(page: &Value) -> Value {
    json!(page.is_object().then(|| {
        let media = &page["media_info"];
        json!({"page_pic":java_string(&page["page_pic"]),"page_url":java_string(&page["page_url"]),
        "media_info":media.is_object().then(|| json!({
            "h5_url":java_string(&media["h5_url"]),"stream_url":java_string(&media["stream_url"])
        }))})
    }))
}

fn require_blog_posts<'a>(response: &'a Value, action: &str) -> ApiResult<&'a [Value]> {
    if to_int(&response["ok"]) != 1 {
        return Err(upstream_error(format!("{action}响应失败：ok != 1。")));
    }
    response["data"]["list"]
        .as_array()
        .map(Vec::as_slice)
        .ok_or_else(|| upstream_error(format!("{action}响应缺少 data.list。")))
}

fn positive_uid(uid: i64) -> ApiResult<i64> {
    if uid <= 0 {
        Err(bad_request("uid 必须大于 0。"))
    } else {
        Ok(uid)
    }
}

async fn incremental(State(state): State<AppState>, request: Request) -> ApiResult<Json<Value>> {
    let uid = positive_uid(required(&post_parameters(request).await?, "uid")?)?;
    Ok(Json(capture_incremental(&state, uid).await?))
}

async fn add_blogger(State(state): State<AppState>, request: Request) -> ApiResult<Json<Value>> {
    let uid = positive_uid(required(&post_parameters(request).await?, "uid")?)?;
    if find_blogger(&state, uid).await?.is_some() {
        return Err(bad_request("该博主已在列表中。"));
    }
    capture_incremental(&state, uid).await?;
    find_blogger(&state, uid)
        .await?
        .map(Json)
        .ok_or_else(|| bad_request("没有拉到该博主的微博，请确认 UID 是否正确。"))
}

async fn find_blogger(state: &AppState, uid: i64) -> ApiResult<Option<Value>> {
    state.db.run(move |db| {
        db.query_row("SELECT uid, screen_name, avatar, profile_url, verified FROM bloggers WHERE uid = ?",
            [uid], |row| blogger(row, 0)).optional()
    }).await.map_err(database_error)
}

pub(crate) fn spawn_background(state: AppState) {
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        loop {
            if state.credential.get().is_some() {
                let uids = state
                    .db
                    .run(|db| {
                        db.prepare("SELECT uid FROM bloggers ORDER BY uid")?
                            .query_map([], |row| row.get::<_, i64>(0))?
                            .collect::<rusqlite::Result<Vec<_>>>()
                    })
                    .await;
                match uids {
                    Ok(uids) => {
                        for uid in uids {
                            if let Err(error) = capture_incremental(&state, uid).await {
                                eprintln!("博主 {uid} 增量同步失败：{error}");
                            }
                        }
                    }
                    Err(error) => eprintln!("查询博主列表失败：{error}"),
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(600)).await;
        }
    });
}

async fn capture_incremental(state: &AppState, uid: i64) -> ApiResult<Value> {
    let latest = state
        .db
        .run(move |db| {
            db.query_row(
                "SELECT coalesce((SELECT latest_post_id FROM bloggers WHERE uid = ?), 0)",
                [uid],
                |row| row.get::<_, i64>(0),
            )
        })
        .await
        .map_err(database_error)?;
    let mut page = 1;
    let mut since = None::<String>;
    let mut fetched = 0;
    let mut inserted = 0;
    loop {
        let response = blog(state, uid, page, since.as_deref()).await?;
        let posts = require_blog_posts(&response, "微博列表")?;
        let Some(first) = posts.first() else { break };
        let captured = Timestamp::now().as_millisecond();
        save_blogger(state, &first["user"], captured).await?;
        let mut reached = false;
        for item in posts {
            fetched += 1;
            let post_id = required_number(item, "id")?;
            if latest > 0 && post_id <= latest {
                reached = true;
                continue;
            }
            inserted += i64::from(capture_post(state, item, captured).await?);
        }
        if latest == 0 || reached {
            break;
        }
        let new_cursor = string(&response["data"]["since_id"]);
        if new_cursor.trim().is_empty() || since.as_deref() == Some(new_cursor) {
            return Err(upstream_error("微博列表响应缺少 data.since_id。"));
        }
        since = Some(new_cursor.to_owned());
        page += 1;
    }
    if fetched > 0 || latest > 0 {
        state.db.run(move |db| {
            db.execute("UPDATE bloggers SET latest_post_id = coalesce((SELECT max(post_id) FROM posts WHERE uid = ?1), 0) WHERE uid = ?1", [uid])?;
            Ok(())
        }).await.map_err(database_error)?;
    }
    Ok(json!({"fetchedCount":fetched,"insertedCount":inserted,"ignoredCount":fetched-inserted}))
}

async fn range(State(state): State<AppState>, request: Request) -> ApiResult<StatusCode> {
    let query = post_parameters(request).await?;
    let uid = positive_uid(required(&query, "uid")?)?;
    let start = parse_time(&required::<String>(&query, "start")?)?;
    let end = parse_time(&required::<String>(&query, "end")?)?;
    if start > end {
        return Err(bad_request("start 不能晚于 end。"));
    }
    tokio::spawn(async move {
        let Ok(_guard) = RANGE_LOCK.try_lock() else {
            return;
        };
        if let Err(error) = capture_range(&state, uid, start, end).await {
            eprintln!("博主 {uid} 历史同步失败：{error}");
        }
    });
    Ok(StatusCode::NO_CONTENT)
}

async fn capture_range(state: &AppState, uid: i64, start: i64, end: i64) -> ApiResult<()> {
    let to_local = |epoch| shanghai::local_time(epoch).map(|local| local.date());
    let mut date = to_local(start).ok_or_else(|| bad_request("日期格式无效。"))?;
    let final_date = to_local(end).ok_or_else(|| bad_request("日期格式无效。"))?;
    let mut requested = false;
    loop {
        let next = date.tomorrow().map_err(|_| bad_request("日期格式无效。"))?;
        let lower = shanghai::start_of_day(date).unwrap_or(start).max(start);
        let upper = (shanghai::start_of_day(next).unwrap_or(end.saturating_add(1)) - 1).min(end);
        let mut page = 1;
        loop {
            if requested {
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            }
            requested = true;
            let response = search(
                state,
                uid,
                page,
                lower.div_euclid(1000),
                upper.div_euclid(1000),
            )
            .await?;
            let posts = require_blog_posts(&response, "微博搜索")?;
            let Some(first) = posts.first() else { break };
            let captured = Timestamp::now().as_millisecond();
            save_blogger(state, &first["user"], captured).await?;
            for item in posts {
                capture_post(state, item, captured).await?;
            }
            page += 1;
        }
        if date == final_date {
            return Ok(());
        }
        date = next;
    }
}

fn integer(value: &Value) -> Option<i64> {
    value.as_i64().or_else(|| value.as_str()?.parse().ok())
}

fn to_int(value: &Value) -> i64 {
    integer(value).unwrap_or_default()
}

fn required_number(value: &Value, field: &str) -> ApiResult<i64> {
    integer(&value[field]).ok_or_else(|| upstream_error(format!("微博响应缺少 {field}。")))
}

async fn save_blogger(state: &AppState, user: &Value, captured: i64) -> ApiResult<()> {
    let uid = required_number(user, "id")?;
    let screen_name = string(&user["screen_name"]).to_owned();
    let avatar = string(&user["avatar_large"]);
    let avatar = if avatar.trim().is_empty() {
        string(&user["profile_image_url"])
    } else {
        avatar
    }
    .to_owned();
    let profile_url = string(&user["profile_url"]).to_owned();
    let verified = user["verified"].as_bool().unwrap_or_default();
    state.db.run(move |db| {
        db.execute(
            "INSERT INTO bloggers(uid,screen_name,avatar,profile_url,verified,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?6) ON CONFLICT(uid) DO UPDATE SET screen_name=excluded.screen_name,
             avatar=excluded.avatar,profile_url=excluded.profile_url,verified=excluded.verified,updated_at=excluded.updated_at",
            params![uid, screen_name, avatar, profile_url, verified, captured],
        )?;
        Ok(())
    }).await.map_err(database_error)
}

async fn capture_post(state: &AppState, item: &Value, captured: i64) -> ApiResult<bool> {
    let id = required_number(item, "id")?;
    let uid = required_number(&item["user"], "id")?;
    let mblogid = item["mblogid"]
        .as_str()
        .ok_or_else(|| upstream_error("微博响应缺少 mblogid。"))?
        .to_owned();
    let created = weibo_timestamp(string(&item["created_at"]))?;
    let (content, raw) = captured_text(state, item).await?;
    let source = strip_tags(string(&item["source"]));
    let region = string(&item["region_name"]).to_owned();
    let pics = captured_pics(&item["pic_infos"]).to_string();
    let (video_cover, video_page) = captured_video(item);
    let (video_cover, video_page) = (video_cover.to_owned(), video_page.to_owned());
    let quote = &item["retweeted_status"];
    let retweet = if quote.is_object() {
        let (content, raw) = captured_text(state, quote).await?;
        let (cover, page) = captured_video(quote);
        let date = string(&quote["created_at"]);
        let date = if date.trim().is_empty() {
            0
        } else {
            weibo_timestamp(date)?
        };
        json!({"post_id":to_int(&quote["id"]),"mblogid":string(&quote["mblogid"]),
            "content":content,"content_raw":raw,"uid":to_int(&quote["user"]["id"]),
            "screen_name":string(&quote["user"]["screen_name"]),"created_at":date,
            "pics":captured_pics(&quote["pic_infos"]),"video_cover_url":cover,"video_page_url":page}).to_string()
    } else {
        String::new()
    };
    let reposts = to_int(&item["reposts_count"]);
    let comments = to_int(&item["comments_count"]);
    let attitudes = to_int(&item["attitudes_count"]);
    state.db.run(move |db| {
        db.execute(
            "INSERT OR IGNORE INTO posts (mblogid,post_id,uid,content,content_raw,source,region,pics_json,
                video_cover_url,video_page_url,retweeted_json,reposts_count,comments_count,attitudes_count,
                created_at,saved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            params![mblogid,id,uid,content,raw,source,region,pics,video_cover,video_page,retweet,
                reposts,comments,attitudes,created,captured]
        ).map(|changed| changed > 0)
    }).await.map_err(database_error)
}

fn weibo_timestamp(value: &str) -> ApiResult<i64> {
    Timestamp::strptime("%a %b %d %H:%M:%S %z %Y", value)
        .map(Timestamp::as_millisecond)
        .map_err(|_| upstream_error("微博创建时间格式无效。"))
}

async fn captured_text(state: &AppState, item: &Value) -> ApiResult<(String, String)> {
    if item["isLongText"].as_bool().unwrap_or_default() {
        let id = string(&item["mblogid"]);
        let long = long_text(state, id).await?;
        if to_int(&long["ok"]) != 1 {
            return Err(upstream_error(format!("长文响应失败：mblogId = {id}。")));
        }
        if long["data"].is_object() {
            return Ok((
                string(&long["data"]["longTextContent"]).to_owned(),
                string(&long["data"]["longTextContent_raw"]).to_owned(),
            ));
        }
    }
    Ok((
        string(&item["text"]).to_owned(),
        string(&item["text_raw"]).to_owned(),
    ))
}

fn captured_pics(pictures: &Value) -> Value {
    let result: Vec<_> = pictures.as_object().into_iter().flatten().map(|(pid, picture)| {
        let thumbnail = &picture["thumbnail"];
        let original = ["largest","original"].iter()
            .map(|key| &picture[key])
            .find(|image| !string(&image["url"]).trim().is_empty())
            .unwrap_or(&picture["large"]);
        let media = |image: &Value| json!({"url":string(&image["url"]),"w":to_int(&image["width"]),"h":to_int(&image["height"])});
        json!({"pid":pid,"thumbnail":media(thumbnail),"original":media(original)})
    }).collect();
    json!(result)
}

fn captured_video(item: &Value) -> (&str, &str) {
    let page = &item["page_info"];
    let cover = string(&page["page_pic"]);
    let url = string(&page["media_info"]["h5_url"]);
    if !cover.trim().is_empty() && !url.trim().is_empty() {
        return (cover, url);
    }
    for media in item["mix_media_info"]["items"]
        .as_array()
        .into_iter()
        .flatten()
    {
        if string(&media["type"]) == "video" {
            let data = &media["data"];
            let cover = string(&data["page_pic"]);
            let url = string(&data["media_info"]["h5_url"]);
            if !cover.trim().is_empty() || !url.trim().is_empty() {
                return (cover, url);
            }
        }
    }
    (cover, url)
}

fn strip_tags(value: &str) -> String {
    static TAGS: std::sync::LazyLock<regex::Regex> =
        std::sync::LazyLock::new(|| regex::Regex::new(r"<[^>]*>").expect("static regex"));
    TAGS.replace_all(value, "").into_owned()
}

async fn post_id(state: &AppState, mblog_id: String) -> ApiResult<i64> {
    state
        .db
        .run(move |db| {
            db.query_row(
                "SELECT post_id FROM posts WHERE mblogid = ?",
                [mblog_id],
                |row| row.get(0),
            )
            .optional()
        })
        .await
        .map_err(database_error)?
        .ok_or_else(|| WeiboError::new(StatusCode::NOT_FOUND, "本地微博不存在。"))
}

async fn local_like(State(state): State<AppState>, RawQuery(raw): RawQuery) -> ApiResult<Response> {
    let query = query_pairs(raw.as_deref());
    let id = post_id(&state, required(&query, "mblogId")?).await?;
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(query_like(&state, id).await?),
    )
        .into_response())
}

async fn raw_like(
    State(state): State<AppState>,
    RawQuery(raw): RawQuery,
) -> ApiResult<Json<Value>> {
    Ok(Json(
        query_like(&state, required(&query_pairs(raw.as_deref()), "id")?).await?,
    ))
}

async fn set_local_like(State(state): State<AppState>, request: Request) -> ApiResult<StatusCode> {
    let query = post_parameters(request).await?;
    let id = post_id(&state, required(&query, "mblogId")?).await?;
    write_like(&state, id, required(&query, "liked")?).await
}

async fn set_raw_like(State(state): State<AppState>, request: Request) -> ApiResult<StatusCode> {
    let query = post_parameters(request).await?;
    write_like(&state, required(&query, "id")?, required(&query, "liked")?).await
}

async fn post_parameters(request: Request) -> ApiResult<Vec<(String, String)>> {
    let mut parameters = query_pairs(request.uri().query());
    let has_form = request
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.split(';').next() == Some("application/x-www-form-urlencoded"));
    if has_form {
        let body = axum::body::to_bytes(request.into_body(), 2 * 1024 * 1024)
            .await
            .map_err(|_| bad_request("读取请求表单失败。"))?;
        let body = std::str::from_utf8(&body).map_err(|_| bad_request("请求表单格式无效。"))?;
        parameters.extend(query_pairs(Some(body)));
    }
    Ok(parameters)
}

fn positive_post(id: i64) -> ApiResult<()> {
    if id > 0 {
        Ok(())
    } else {
        Err(bad_request("微博数字 ID 必须大于 0。"))
    }
}

async fn query_like(state: &AppState, id: i64) -> ApiResult<Value> {
    positive_post(id)?;
    let query = [("id", id.to_string()), ("locale", "zh-CN".to_owned())];
    let body = like_success(
        weibo::request(
            state,
            Method::GET,
            &format!("{STATUSES_URL}/show"),
            HeaderProfile::Ajax,
            true,
            Retry::RateLimit,
            |request| request.query(&query),
        )
        .await?,
    )
    .await?;
    let status = body["attitudes_status"].as_i64();
    let count = body["attitudes_count"].as_i64();
    if integer(&body["idstr"]) != Some(id)
        || !matches!(status, Some(0 | 1))
        || !count.is_some_and(|count| (0..=i64::from(i32::MAX)).contains(&count))
    {
        return Err(upstream_error("微博点赞状态不完整，请重试。"));
    }
    Ok(json!({"liked":status == Some(1), "count":count}))
}

async fn write_like(state: &AppState, id: i64, liked: bool) -> ApiResult<StatusCode> {
    positive_post(id)?;
    let current = state
        .credential
        .get()
        .ok_or_else(|| WeiboError::new(StatusCode::UNAUTHORIZED, "未登录，请扫码登录后重试。"))?;
    let response = weibo::request(
        state,
        Method::GET,
        "https://weibo.com/",
        HeaderProfile::Ajax,
        false,
        Retry::RateLimit,
        |request| request.header(header::COOKIE, &current),
    )
    .await?;
    let mut cookie = current;
    let mut token = None;
    let status = response.status();
    for value in response.headers().get_all(header::SET_COOKIE) {
        if let Some((name, value)) = value
            .to_str()
            .ok()
            .and_then(|header| header.split(';').next())
            .and_then(|pair| pair.split_once('='))
        {
            if matches!(name, "XSRF-TOKEN" | "WBPSESS") {
                cookie.push_str(&format!("; {name}={value}"));
            }
            if name == "XSRF-TOKEN" {
                let escaped = value
                    .replace('+', "%2B")
                    .replace('&', "%26")
                    .replace('#', "%23");
                token = query_pairs(Some(&format!("token={escaped}")))
                    .into_iter()
                    .next()
                    .map(|(_, value)| value);
            }
        }
    }
    let token = token
        .filter(|_| status == StatusCode::OK)
        .ok_or_else(|| upstream_error("无法获取微博点赞验证信息，请重新登录后重试。"))?;
    let action = if liked { "setLike" } else { "cancelLike" };
    let form = [("id", id.to_string())];
    like_success(
        weibo::request(
            state,
            Method::POST,
            &format!("{STATUSES_URL}/{action}"),
            HeaderProfile::Ajax,
            false,
            Retry::Once,
            |request| {
                request
                    .header(header::COOKIE, &cookie)
                    .header(header::ORIGIN, "https://weibo.com")
                    .header("x-xsrf-token", &token)
                    .form(&form)
            },
        )
        .await?,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn like_success(response: reqwest::Response) -> ApiResult<Value> {
    let status = response.status();
    let contents = weibo::text(response).await?;
    let body: Value = serde_json::from_str(&contents)
        .map_err(|_| upstream_error("微博点赞接口返回无效响应，请稍后重试。"))?;
    if status != StatusCode::OK || to_int(&body["ok"]) <= 0 {
        let code = to_int(&body["error_code"]);
        return Err(upstream_error(if matches!(code, 20062 | 20067) {
            "微博要求安全验证，请前往微博网页版完成验证后重试。"
        } else {
            "微博点赞接口请求失败，请稍后重试。"
        }));
    }
    Ok(body)
}
