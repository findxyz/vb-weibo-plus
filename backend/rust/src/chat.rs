mod capture;
mod push;
mod store;

pub use capture::{SaveResult, save_incremental};
pub use push::start_background;

use axum::{
    Json, Router,
    body::to_bytes,
    extract::{Query, Request, State, rejection::QueryRejection},
    http::{StatusCode, Uri, header},
    routing::{get, post},
};
use jiff::{Timestamp, civil::DateTime};
use serde::{Deserialize, Deserializer, de::DeserializeOwned};
use serde_json::{Value, json};

use crate::{AppState, DbError, shanghai, weibo::WeiboError};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/chat/groups", get(groups))
        .route("/chat/groups/sync", post(capture::sync_group_route))
        .route("/chat/messages", get(messages))
        .route("/chat/messages/cursor", get(cursor))
        .route("/chat/messages/weiboText", get(capture::weibo_text))
        .route("/chat/messages/send", post(capture::send_text))
        .route("/chat/attitudes", get(capture::attitudes))
        .route("/chat/incremental", post(capture::incremental_route))
        .route("/chat/since", post(capture::since_route))
        .route("/weibo/group/list", get(capture::raw_group_list))
        .route("/weibo/group/messages", get(capture::raw_group_messages))
        .route("/weibo/group/send", post(capture::raw_group_send))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MessageQuery {
    gid: i64,
    start: Option<String>,
    end: Option<String>,
    sender_name: Option<String>,
    keyword: Option<String>,
    page: i64,
    size: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorQuery {
    gid: i64,
    #[serde(default, deserialize_with = "optional_number")]
    before_created_at: Option<i64>,
    #[serde(default, deserialize_with = "optional_number")]
    before_mid: Option<i64>,
    #[serde(default, deserialize_with = "optional_number")]
    after_created_at: Option<i64>,
    #[serde(default, deserialize_with = "optional_number")]
    after_mid: Option<i64>,
    size: i64,
}

async fn groups(State(state): State<AppState>) -> Result<Json<Value>, WeiboError> {
    let groups = state.db.run(store::list_groups).await.map_err(database)?;
    Ok(Json(Value::Array(groups)))
}

async fn messages(
    State(state): State<AppState>,
    query: Result<Query<MessageQuery>, QueryRejection>,
) -> Result<Json<Value>, WeiboError> {
    let query = query_value(query)?;
    validate_gid(query.gid)?;
    if query.page < 1 {
        return Err(bad_request("page 必须大于等于 1。"));
    }
    validate_size(query.size)?;
    let start = optional_datetime(query.start.as_deref())?;
    let end = optional_datetime(query.end.as_deref())?;
    if let (Some(start), Some(end)) = (start, end)
        && start > end
    {
        return Err(bad_request("start 不能晚于 end。"));
    }
    let page = state
        .db
        .run(move |connection| store::query_messages(connection, query, start, end))
        .await
        .map_err(database)?;
    Ok(Json(page))
}

async fn cursor(
    State(state): State<AppState>,
    query: Result<Query<CursorQuery>, QueryRejection>,
) -> Result<Json<Value>, WeiboError> {
    let query = query_value(query)?;
    validate_gid(query.gid)?;
    if query.before_created_at.is_some() != query.before_mid.is_some() {
        return Err(bad_request(
            "beforeCreatedAt 和 beforeMid 必须同时提供或同时省略。",
        ));
    }
    if query.after_created_at.is_some() != query.after_mid.is_some() {
        return Err(bad_request(
            "afterCreatedAt 和 afterMid 必须同时提供或同时省略。",
        ));
    }
    if query.before_created_at.is_some() && query.after_created_at.is_some() {
        return Err(bad_request("before 游标和 after 游标不能同时提供。"));
    }
    validate_size(query.size)?;
    let page = state
        .db
        .run(move |connection| store::query_cursor(connection, query))
        .await
        .map_err(database)?;
    Ok(Json(page))
}

fn validate_gid(gid: i64) -> Result<(), WeiboError> {
    if gid <= 0 {
        return Err(bad_request("gid 必须大于 0。"));
    }
    Ok(())
}

fn validate_size(size: i64) -> Result<(), WeiboError> {
    if !(1..=100).contains(&size) {
        return Err(bad_request("size 必须介于 1 和 100 之间。"));
    }
    Ok(())
}

fn optional_datetime(value: Option<&str>) -> Result<Option<i64>, WeiboError> {
    value
        .filter(|value| !value.is_empty())
        .map(datetime)
        .transpose()
}

fn datetime(value: &str) -> Result<i64, WeiboError> {
    let time = DateTime::strptime("%Y-%m-%d %H:%M:%S", value)
        .map_err(|_| bad_request("日期时间格式无效。"))?;
    shanghai::milliseconds(time).ok_or_else(|| bad_request("日期时间无效。"))
}

fn optional_number<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<String>::deserialize(deserializer)?;
    value
        .filter(|value| !value.is_empty())
        .map(|value| value.parse().map_err(serde::de::Error::custom))
        .transpose()
}

fn query_value<T>(query: Result<Query<T>, QueryRejection>) -> Result<T, WeiboError> {
    query
        .map(|Query(value)| value)
        .map_err(|_| bad_request("请求参数无效。"))
}

async fn post_parameters<T: DeserializeOwned>(request: Request) -> Result<T, WeiboError> {
    let is_form = request
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|media_type| media_type.to_str().ok())
        .is_some_and(|media_type| media_type.starts_with("application/x-www-form-urlencoded"));
    if !is_form {
        return query_value(Query::try_from_uri(request.uri()));
    }
    let (parts, body) = request.into_parts();
    let bytes = to_bytes(body, 21 * 1024 * 1024)
        .await
        .map_err(|_| bad_request("请求参数无效。"))?;
    let body = std::str::from_utf8(&bytes).map_err(|_| bad_request("请求参数无效。"))?;
    let query = parts.uri.query().unwrap_or_default();
    let uri = format!("/?{query}&{body}")
        .parse::<Uri>()
        .map_err(|_| bad_request("请求参数无效。"))?;
    query_value(Query::try_from_uri(&uri))
}

fn bad_request(message: &'static str) -> WeiboError {
    WeiboError::new(StatusCode::BAD_REQUEST, message)
}

fn upstream(message: &'static str) -> WeiboError {
    WeiboError::new(StatusCode::BAD_GATEWAY, message)
}

fn database(_: DbError) -> WeiboError {
    WeiboError::new(
        StatusCode::INTERNAL_SERVER_ERROR,
        "读取或保存群聊数据失败。",
    )
}

fn now() -> i64 {
    Timestamp::now().as_millisecond()
}

fn number(value: &Value) -> Option<i64> {
    value.as_i64().or_else(|| value.as_str()?.parse().ok())
}

fn string(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Number(_) | Value::Bool(_) => value.to_string(),
        _ => String::new(),
    }
}

fn empty_group(gid: i64) -> Value {
    json!({"gid": gid, "name": "", "avatar": "", "memberCount": 0,
        "maxMember": 0, "ownerId": 0, "admins": [], "summary": "", "groupType": 0})
}
