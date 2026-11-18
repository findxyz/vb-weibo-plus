use axum::{
    Json,
    extract::{Query, Request, State, rejection::QueryRejection},
    http::StatusCode,
};
use reqwest::Method;
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::collections::BTreeSet;
use std::sync::LazyLock;
use std::time::Duration;

use super::{
    bad_request, database, datetime, now, number, optional_number, post_parameters, query_value,
    store, string, upstream, validate_gid,
};
use crate::{
    AppState, post,
    weibo::{self, HeaderProfile, Retry, SOURCE, WeiboError},
};

const MESSAGES_URL: &str = "https://api.weibo.com/webim/groupchat/query_messages.json";
const SEND_URL: &str = "https://api.weibo.com/webim/groupchat/send_message.json";
static HISTORICAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    #[serde(rename = "fetchedCount")]
    pub fetched: usize,
    #[serde(rename = "insertedCount")]
    pub inserted: usize,
    #[serde(rename = "ignoredCount")]
    pub ignored: usize,
}

#[derive(Deserialize)]
pub(super) struct GroupQuery {
    gid: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SinceQuery {
    gid: i64,
    since_time: String,
    #[serde(default, deserialize_with = "optional_number")]
    before_mid: Option<i64>,
}

#[derive(Deserialize)]
pub(super) struct MessageKey {
    gid: i64,
    mid: i64,
}

#[derive(Deserialize)]
pub(super) struct AttitudeQuery {
    gid: i64,
    mids: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RawMessageQuery {
    id: i64,
    #[serde(default, deserialize_with = "optional_number")]
    max_mid: Option<i64>,
}

#[derive(Deserialize)]
struct SendText {
    #[serde(alias = "id")]
    gid: i64,
    content: String,
}

pub(super) async fn sync_group_route(
    State(state): State<AppState>,
) -> Result<Json<Value>, WeiboError> {
    weibo::sync_groups(&state).await?;
    let records = state.db.run(store::group_records).await.map_err(database)?;
    Ok(Json(Value::Array(records)))
}

pub(super) async fn raw_group_list(
    State(state): State<AppState>,
) -> Result<Json<weibo::GroupList>, WeiboError> {
    Ok(Json(weibo::group_list(&state).await?))
}

pub(super) async fn raw_group_messages(
    State(state): State<AppState>,
    query: Result<Query<RawMessageQuery>, QueryRejection>,
) -> Result<Json<Value>, WeiboError> {
    let query = query_value(query)?;
    let response = group_messages(&state, query.id, query.max_mid).await?;
    let messages = response["messages"]
        .as_array()
        .map(|messages| messages.iter().map(project_message).collect::<Vec<_>>());
    Ok(Json(json!({
        "result": response["result"].as_bool().unwrap_or_default(),
        "messages": messages,
        "ts": number(&response["ts"]).unwrap_or_default()
    })))
}

pub(super) async fn raw_group_send(
    State(state): State<AppState>,
    request: Request,
) -> Result<Json<Value>, WeiboError> {
    let query: SendText = post_parameters(request).await?;
    let response = send_upstream(&state, query.gid, &query.content).await?;
    Ok(Json(json!({
        "result": response["result"].as_bool().unwrap_or_default(),
        "mid": number(&response["mid"]).or_else(|| number(&response["id"])),
        "gid": number(&response["gid"]), "content": optional_string(&response["content"]),
        "media_type": number(&response["media_type"]), "time": number(&response["time"]),
        "ts": number(&response["ts"])
    })))
}

pub(super) async fn send_text(
    State(state): State<AppState>,
    request: Request,
) -> Result<Json<SaveResult>, WeiboError> {
    let query: SendText = post_parameters(request).await?;
    validate_gid(query.gid)?;
    if query.content.trim().is_empty() {
        return Err(bad_request("消息内容不能为空。"));
    }
    if send_upstream(&state, query.gid, &query.content).await?["result"].as_bool() != Some(true) {
        return Err(upstream("消息发送失败：result != true。"));
    }
    let result = save_incremental(&state, query.gid).await.map_err(|_| {
        WeiboError::new(
            StatusCode::CONFLICT,
            "消息已发出，但本地同步失败，稍后会自动补全。",
        )
    })?;
    Ok(Json(result))
}

pub(super) async fn incremental_route(
    State(state): State<AppState>,
    request: Request,
) -> Result<Json<SaveResult>, WeiboError> {
    let query: GroupQuery = post_parameters(request).await?;
    Ok(Json(save_incremental(&state, query.gid).await?))
}

pub(super) async fn since_route(
    State(state): State<AppState>,
    request: Request,
) -> Result<StatusCode, WeiboError> {
    let query: SinceQuery = post_parameters(request).await?;
    let cutoff = datetime(&query.since_time)?;
    if let Ok(lease) = HISTORICAL.try_lock() {
        tokio::spawn(async move {
            let _lease = lease;
            if let Err(error) = save_history(&state, query.gid, cutoff, query.before_mid).await {
                eprintln!("群历史采集失败：{error}。");
            }
        });
    }
    Ok(StatusCode::NO_CONTENT)
}

pub(super) async fn attitudes(
    State(state): State<AppState>,
    query: Result<Query<AttitudeQuery>, QueryRejection>,
) -> Result<Json<Value>, WeiboError> {
    let query = query_value(query)?;
    validate_gid(query.gid)?;
    let mut wanted = query
        .mids
        .split(',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(|part| {
            part.parse::<i64>()
                .map_err(|_| bad_request("mids 必须是逗号分隔的消息 ID。"))
        })
        .collect::<Result<BTreeSet<_>, _>>()?;
    let mut result = Map::new();
    let Some(last) = wanted.last() else {
        return Ok(Json(Value::Object(result)));
    };
    let mut cursor = last.saturating_add(1);
    for _ in 0..10 {
        let response = group_messages(&state, query.gid, Some(cursor)).await?;
        let messages = checked_messages(&response)?;
        let Some(first) = messages.first() else { break };
        for message in messages {
            let mid = message_id(message)?;
            if wanted.remove(&mid) {
                let attitudes = message["attitude_info"]["attitudes"]
                    .as_array()
                    .map(|values| values.iter().map(project_attitude).collect::<Vec<_>>())
                    .unwrap_or_default();
                result.insert(mid.to_string(), json!(attitudes));
            }
        }
        let next = message_id(first)?;
        if wanted.is_empty() || next == cursor {
            break;
        }
        cursor = next;
    }
    Ok(Json(Value::Object(result)))
}

pub(super) async fn weibo_text(
    State(state): State<AppState>,
    query: Result<Query<MessageKey>, QueryRejection>,
) -> Result<Json<Value>, WeiboError> {
    let query = query_value(query)?;
    validate_gid(query.gid)?;
    let local = state
        .db
        .run(move |db| {
            db.query_row(
                "SELECT media_type, url_objects FROM messages WHERE gid=? AND mid=?",
                [query.gid, query.mid],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        store::json_column(row, 1, json!([]))?,
                    ))
                },
            )
            .optional()
        })
        .await
        .map_err(database)?
        .ok_or_else(|| WeiboError::new(StatusCode::NOT_FOUND, "本地群消息不存在。"))?;
    let status = &local.1[0]["status"];
    if local.0 != 14 || !status.is_object() {
        return Err(bad_request("该消息不是微博分享。"));
    }
    if status["isLongText"].as_bool() != Some(true) {
        return Ok(Json(json!({"text": string(&status["text"])})));
    }
    let id = string(&status["idstr"]);
    if id.trim().is_empty() {
        return Err(WeiboError::new(
            StatusCode::NOT_FOUND,
            "本地微博分享缺少微博 ID。",
        ));
    }
    let response = post::long_text(&state, &id).await?;
    if number(&response["ok"]) != Some(1) || !response["data"].is_object() {
        return Err(upstream("微博全文暂不可用。"));
    }
    let data = &response["data"];
    let mut text = string(&data["longTextContent_raw"]);
    if text.is_empty() {
        text = string(&data["longTextContentRaw"]);
    }
    if text.trim().is_empty() {
        static BREAKS: LazyLock<regex::Regex> =
            LazyLock::new(|| regex::Regex::new(r"(?i)<br\s*/?>").unwrap());
        static TAGS: LazyLock<regex::Regex> =
            LazyLock::new(|| regex::Regex::new(r"<[^>]+>").unwrap());
        let html = string(&data["longTextContent"]);
        let with_breaks = BREAKS.replace_all(&html, "\n");
        let stripped = TAGS.replace_all(&with_breaks, "");
        text = html_escape::decode_html_entities(&stripped).into_owned();
    }
    if text.trim().is_empty() {
        return Err(upstream("微博全文暂不可用。"));
    }
    Ok(Json(json!({"text": text})))
}

async fn group_messages(
    state: &AppState,
    gid: i64,
    max_mid: Option<i64>,
) -> Result<Value, WeiboError> {
    let mut query = vec![("id", gid.to_string()), ("count", "50".into())];
    if let Some(max_mid) = max_mid {
        query.push(("max_mid", max_mid.to_string()));
    }
    query.extend([
        ("convert_emoji", "1".into()),
        ("query_sender", "1".into()),
        ("source", SOURCE.into()),
        ("t", now().to_string()),
    ]);
    let response = weibo::request(
        state,
        Method::GET,
        MESSAGES_URL,
        HeaderProfile::WebIm,
        true,
        Retry::RateLimit,
        |request| request.query(&query),
    )
    .await?;
    weibo::json(response).await
}

async fn send_upstream(state: &AppState, gid: i64, content: &str) -> Result<Value, WeiboError> {
    let mut form = vec![("id", gid.to_string()), ("source", SOURCE.into())];
    if !content.is_empty() {
        form.insert(1, ("content", content.to_owned()));
    }
    let response = weibo::request(
        state,
        Method::POST,
        SEND_URL,
        HeaderProfile::WebImSend,
        true,
        Retry::RateLimit,
        |request| request.form(&form),
    )
    .await?;
    weibo::json(response).await
}

fn checked_messages(response: &Value) -> Result<&[Value], WeiboError> {
    if response["result"].as_bool() != Some(true) {
        return Err(upstream("群消息响应失败：result != true。"));
    }
    response["messages"]
        .as_array()
        .map(Vec::as_slice)
        .ok_or_else(|| upstream("群消息响应缺少 messages。"))
}

fn message_id(message: &Value) -> Result<i64, WeiboError> {
    number(&message["id"])
        .or_else(|| number(&message["idstr"]))
        .ok_or_else(|| upstream("群消息响应缺少消息 mid。"))
}

fn message_time(message: &Value) -> i64 {
    let time = number(&message["time"]).unwrap_or_default();
    if time < 1_000_000_000_000 {
        time.saturating_mul(1000)
    } else {
        time
    }
}

pub async fn save_incremental(state: &AppState, gid: i64) -> Result<SaveResult, WeiboError> {
    validate_gid(gid)?;
    let saved_at = now();
    let (_, boundary) = group_bounds(state, gid, saved_at).await?;
    let mut cursor = None;
    let mut total = SaveResult::default();
    loop {
        let response = group_messages(state, gid, cursor).await?;
        let messages = checked_messages(&response)?;
        let Some(first) = messages.first() else { break };
        let (saved, reached) = capture_page(state, messages, gid, saved_at, |mid, _| {
            boundary > 0 && mid <= boundary
        })
        .await?;
        total.fetched += saved.fetched;
        total.inserted += saved.inserted;
        total.ignored += saved.ignored;
        if boundary == 0 || reached {
            break;
        }
        let next = Some(message_id(first)?);
        if cursor == next {
            break;
        }
        cursor = next;
    }
    refresh_group_range(state, gid).await?;
    Ok(total)
}

async fn save_history(
    state: &AppState,
    gid: i64,
    cutoff: i64,
    before_mid: Option<i64>,
) -> Result<(), WeiboError> {
    validate_gid(gid)?;
    let saved_at = now();
    let (min_mid, _) = group_bounds(state, gid, saved_at).await?;
    let mut cursor = before_mid.or((min_mid > 0).then_some(min_mid));
    loop {
        let response = group_messages(state, gid, cursor).await?;
        let messages = checked_messages(&response)?;
        let Some(first) = messages.first() else { break };
        let (_, reached) =
            capture_page(state, messages, gid, saved_at, |_, time| time < cutoff).await?;
        if reached {
            break;
        }
        let next = Some(message_id(first)?);
        if cursor == next {
            break;
        }
        cursor = next;
        let delay = 200 + (now() as u64 % 1801);
        tokio::time::sleep(Duration::from_millis(delay)).await;
    }
    refresh_group_range(state, gid).await
}

async fn group_bounds(state: &AppState, gid: i64, saved_at: i64) -> Result<(i64, i64), WeiboError> {
    state
        .db
        .run(move |db| {
            db.execute(
                "INSERT OR IGNORE INTO groups (gid, created_at, updated_at) VALUES (?1, ?2, ?2)",
                params![gid, saved_at],
            )?;
            db.query_row(
                "SELECT COALESCE(min_mid,0), COALESCE(max_mid,0) FROM groups WHERE gid=?",
                [gid],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
        })
        .await
        .map_err(database)
}

async fn refresh_group_range(state: &AppState, gid: i64) -> Result<(), WeiboError> {
    state.db.run(move |db| db.execute("UPDATE groups SET min_mid=COALESCE((SELECT MIN(mid) FROM messages WHERE gid=?1), 0), max_mid=COALESCE((SELECT MAX(mid) FROM messages WHERE gid=?1), 0) WHERE gid=?1", [gid])).await.map_err(database)?;
    Ok(())
}

async fn capture_page(
    state: &AppState,
    messages: &[Value],
    gid: i64,
    saved_at: i64,
    boundary: impl Fn(i64, i64) -> bool,
) -> Result<(SaveResult, bool), WeiboError> {
    let mut records = Vec::new();
    let mut reached = false;
    for message in messages {
        let mid = message_id(message)?;
        let time = message_time(message);
        if boundary(mid, time) {
            reached = true;
        } else if !matches!(number(&message["type"]), Some(332 | 9999)) {
            records.push(CapturedMessage::new(message, gid, mid, time));
        }
    }
    let inserted = state.db.run(move |db| {
        let transaction = db.transaction()?;
        let mut inserted = 0;
        {
            let mut statement = transaction.prepare("INSERT OR IGNORE INTO messages (mid,gid,msg_type,msg_type_name,media_type,sender_id,sender_name,sender_avatar,text,fid,video_cover_fid,media_orig_url,url_objects,pic_infos,template,template_data,recall_mids,recall_by,created_at,saved_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)")?;
            for record in records {
                inserted += statement.execute(params![record.mid,record.gid,record.kind,message_type_name(record.kind),record.media_type,record.sender_id,record.sender_name,record.sender_avatar,record.text,record.fid,record.video_cover,record.media_url,record.urls,record.pics,record.template,record.template_data,record.recall_mids,record.recall_by,record.created_at,saved_at])?;
            }
        }
        transaction.commit()?;
        Ok(inserted)
    }).await.map_err(database)?;
    Ok((
        SaveResult {
            fetched: messages.len(),
            inserted,
            ignored: messages.len() - inserted,
        },
        reached,
    ))
}

struct CapturedMessage {
    mid: i64,
    gid: i64,
    kind: i64,
    media_type: i64,
    sender_id: i64,
    sender_name: String,
    sender_avatar: String,
    text: String,
    fid: String,
    video_cover: String,
    media_url: String,
    urls: String,
    pics: String,
    template: String,
    template_data: String,
    recall_mids: String,
    recall_by: String,
    created_at: i64,
}

impl CapturedMessage {
    fn new(message: &Value, gid: i64, mid: i64, time: i64) -> Self {
        let sender = &message["from_user"];
        let sender_name = string(&sender["screen_name"]);
        let sender_avatar = string(&sender["avatar_large"]);
        let sender_avatar = sender_avatar
            .split('?')
            .next()
            .unwrap_or_default()
            .to_owned();
        let first_fid = message["fids"]
            .as_array()
            .and_then(|fids| fids.first())
            .unwrap_or(&message["fid"]);
        let metadata = &message["data"];
        let template_data = [&message["template_data"], metadata]
            .into_iter()
            .find(|node| node.is_object())
            .map_or_else(|| "{}".into(), ToString::to_string);
        let recalls = if message["recall_mids"].is_null() {
            &metadata["ids"]
        } else {
            &message["recall_mids"]
        };
        let recall_mids = to_array(recalls)
            .iter()
            .map(|id| {
                if id.is_null() {
                    "null".into()
                } else {
                    string(id)
                }
            })
            .collect::<Vec<_>>();
        let kind = number(&message["type"]).unwrap_or_default();
        let recall_by = if !message["recall_by"].is_null() {
            string(&message["recall_by"])
        } else if let Some(name) = metadata.get("recall_sender_name") {
            string(name)
        } else if kind == 331 {
            sender_name.clone()
        } else {
            String::new()
        };
        Self {
            mid,
            gid: number(&message["gid"]).unwrap_or(gid),
            kind,
            media_type: number(&message["media_type"]).unwrap_or_default(),
            sender_id: number(&sender["id"])
                .or_else(|| number(&message["from_uid"]))
                .unwrap_or_default(),
            sender_name,
            sender_avatar,
            text: string(&message["content"]),
            fid: string(first_fid),
            video_cover: string(&message["annotations"]["video_pic_fid"]),
            media_url: string(&message["media_orig_url"]),
            urls: json!(to_array(&message["url_objects"])).to_string(),
            pics: json!(to_array(&message["pic_infos"])).to_string(),
            template: string(&message["template"]),
            template_data,
            recall_mids: json!(recall_mids).to_string(),
            recall_by,
            created_at: time,
        }
    }
}

fn to_array(value: &Value) -> Vec<&Value> {
    match value {
        Value::Array(values) => values.iter().collect(),
        Value::Null => Vec::new(),
        _ => vec![value],
    }
}

fn optional_string(value: &Value) -> Option<String> {
    (!value.is_null()).then(|| string(value))
}

fn project_attitude(attitude: &Value) -> Value {
    if attitude.is_null() {
        return Value::Null;
    }
    json!({"name": optional_string(&attitude["name"]), "count": number(&attitude["count"]).unwrap_or_default(), "selected": number(&attitude["selected"]).unwrap_or_default()})
}

fn project_message(message: &Value) -> Value {
    if message.is_null() {
        return Value::Null;
    }
    let sender = &message["from_user"];
    let sender = (!sender.is_null()).then(|| json!({"id": number(&sender["id"]), "screen_name": optional_string(&sender["screen_name"]), "avatar_large": optional_string(&sender["avatar_large"])}));
    let annotations = &message["annotations"];
    let annotations = (!annotations.is_null())
        .then(|| json!({"video_pic_fid": optional_string(&annotations["video_pic_fid"])}));
    let attitudes = &message["attitude_info"];
    let attitudes = (!attitudes.is_null()).then(|| json!({"attitudes": attitudes["attitudes"].as_array().map(|values| values.iter().map(project_attitude).collect::<Vec<_>>())}));
    json!({
        "id": number(&message["id"]).or_else(|| number(&message["idstr"])), "gid": number(&message["gid"]),
        "type": number(&message["type"]).unwrap_or_default(), "from_uid": number(&message["from_uid"]), "from_user": sender,
        "content": optional_string(&message["content"]), "media_type": number(&message["media_type"]).unwrap_or_default(),
        "time": number(&message["time"]).unwrap_or_default(), "fids": message["fids"].as_array().map(|fids| fids.iter().map(optional_string).collect::<Vec<_>>()),
        "fid": optional_string(&message["fid"]), "annotations": annotations, "media_orig_url": optional_string(&message["media_orig_url"]),
        "url_objects": message["url_objects"], "pic_infos": message["pic_infos"], "template": optional_string(&message["template"]),
        "template_data": message["template_data"], "data": message["data"], "recall_mids": message["recall_mids"],
        "recall_by": optional_string(&message["recall_by"]), "attitude_info": attitudes,
    })
}

fn message_type_name(kind: i64) -> String {
    match kind {
        100 => "微博分享",
        320 => "邀请入群",
        321 => "普通消息",
        322 => "新人入群",
        323 => "退群",
        324 => "被踢出群",
        325 => "群名修改",
        327 => "群主转让",
        331 => "消息撤回",
        332 => "协议同步",
        333 => "免打扰变更",
        335 => "群信息更新",
        337 => "管理员变更",
        421 => "入群申请",
        429 => "被移出群",
        499 => "群通知",
        9999 => "态度更新",
        _ => return format!("未知（{kind}）"),
    }
    .to_owned()
}
