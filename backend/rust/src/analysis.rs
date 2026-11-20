use axum::extract::{Form, FromRequest, Path, Query, Request, State};
use axum::http::{StatusCode, header};
use axum::response::sse::{Event, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use futures_util::stream;
use jiff::{Timestamp, ZonedDateTime, civil::Date};
use rusqlite::{OptionalExtension, Row, params};
use serde::Serialize;
use serde_json::{Value, json};
use std::convert::Infallible;
use std::fmt::Write;
use std::str::FromStr;
use tokio::sync::mpsc;

use crate::{AppState, DbError, shanghai};

pub(crate) fn routes() -> Router<AppState> {
    Router::new()
        .route("/chat/analyses", get(list).post(analyze))
        .route("/chat/analyses/stream", axum::routing::post(analyze_stream))
        .route("/chat/analyses/{id}", get(detail))
}

struct AnalysisError {
    status: StatusCode,
    message: String,
}

impl AnalysisError {
    fn invalid(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }

    fn failed(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: message.into(),
        }
    }

    fn upstream(error: impl std::fmt::Display) -> Self {
        Self::failed(format!("调用 AI 失败：{error}"))
    }
}

impl From<DbError> for AnalysisError {
    fn from(_: DbError) -> Self {
        Self::failed("分析记录数据库操作失败。")
    }
}

impl IntoResponse for AnalysisError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({"code": self.status.as_u16(), "msg": self.message})),
        )
            .into_response()
    }
}

struct AnalysisInput {
    gid: i64,
    date: Date,
    prompt: String,
}

type Parameters = Vec<(String, String)>;

fn parameter<'a>(params: &'a Parameters, name: &str) -> Option<&'a str> {
    params
        .iter()
        .find(|(key, _)| key == name)
        .map(|(_, value)| value.as_str())
}

fn required(params: &Parameters, name: &str) -> Result<String, AnalysisError> {
    parameter(params, name)
        .map(str::to_owned)
        .ok_or_else(|| AnalysisError::invalid(format!("缺少参数 {name}。")))
}

fn number<T: FromStr>(value: &str, name: &str) -> Result<T, AnalysisError> {
    value
        .trim()
        .parse()
        .map_err(|_| AnalysisError::invalid(format!("参数 {name} 格式错误。")))
}

async fn input(request: Request, state: &AppState) -> Result<AnalysisInput, AnalysisError> {
    let Query(mut params) = Query::<Parameters>::try_from_uri(request.uri())
        .map_err(|_| AnalysisError::invalid("查询参数格式错误。"))?;
    let is_form = request
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .is_some_and(|value| {
            value
                .trim()
                .eq_ignore_ascii_case("application/x-www-form-urlencoded")
        });
    if is_form {
        let Form(form) = Form::<Parameters>::from_request(request, state)
            .await
            .map_err(|_| AnalysisError::invalid("表单参数格式错误。"))?;
        params.extend(form);
    }

    let gid = number(&required(&params, "gid")?, "gid")?;
    let date = Date::strptime("%Y-%m-%d", &required(&params, "date")?)
        .map_err(|_| AnalysisError::invalid("参数 date 格式错误。"))?;
    let prompt = required(&params, "prompt")?;
    Ok(AnalysisInput { gid, date, prompt })
}

fn validate_gid(gid: i64) -> Result<(), AnalysisError> {
    if gid <= 0 {
        return Err(AnalysisError::invalid("gid 必须大于 0。"));
    }
    Ok(())
}

fn shanghai_time(milliseconds: i64) -> Result<ZonedDateTime, AnalysisError> {
    shanghai::local_time(milliseconds).ok_or_else(|| AnalysisError::failed("本地记录时间无效。"))
}

async fn analyze(
    State(state): State<AppState>,
    request: Request,
) -> Result<Json<AnalysisView>, AnalysisError> {
    let input = input(request, &state).await?;
    Ok(Json(run_analysis(&state, input, None).await?))
}

async fn analyze_stream(
    State(state): State<AppState>,
    request: Request,
) -> Result<Response, AnalysisError> {
    let input = input(request, &state).await?;
    let (sender, receiver) = mpsc::channel(16);
    tokio::spawn(async move {
        let timeout = state
            .config
            .ai_timeout
            .saturating_add(std::time::Duration::from_secs(60));
        let event =
            match tokio::time::timeout(timeout, run_analysis(&state, input, Some(&sender))).await {
                Ok(Ok(view)) => Event::default().event("done").json_data(view),
                Ok(Err(error)) => Ok(Event::default().event("error").data(error.message)),
                Err(_) => Ok(Event::default().event("error").data("分析响应超时。")),
            };
        if let Ok(event) = event {
            let _ = sender.send(event).await;
        }
    });
    let events = stream::unfold(receiver, |mut receiver| async {
        receiver
            .recv()
            .await
            .map(|event| (Ok::<Event, Infallible>(event), receiver))
    });
    Ok(Sse::new(events).into_response())
}

async fn run_analysis(
    state: &AppState,
    input: AnalysisInput,
    events: Option<&mpsc::Sender<Event>>,
) -> Result<AnalysisView, AnalysisError> {
    let AnalysisInput { gid, date, prompt } = input;
    validate_gid(gid)?;
    if prompt.trim().is_empty() {
        return Err(AnalysisError::invalid("prompt 不能为空。"));
    }
    let invalid_date = || AnalysisError::invalid("参数 date 格式错误。");
    let start = shanghai::start_of_day(date).ok_or_else(invalid_date)?;
    let end = date
        .tomorrow()
        .ok()
        .and_then(shanghai::start_of_day)
        .ok_or_else(invalid_date)?;

    let messages = state
        .db
        .run(move |db| {
            let mut query = db.prepare(
                "SELECT created_at, sender_name, text, msg_type_name
                 FROM messages WHERE gid = ?1 AND created_at >= ?2 AND created_at < ?3
                 ORDER BY created_at DESC, mid DESC",
            )?;
            query
                .query_map(params![gid, start, end], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                    ))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()
        })
        .await?;

    if messages.is_empty() {
        return Err(AnalysisError::invalid("该日期无本地消息，请先同步。"));
    }
    let message_count = messages.len() as i64;
    let mut prompt_text = format!("{prompt}\n\n以下是群聊消息：\n\n");
    for (created_at, sender, text, kind) in messages {
        let when = shanghai_time(created_at)?;
        let sender = sender.as_deref().unwrap_or("未知");
        let text = text
            .filter(|text| !text.trim().is_empty())
            .unwrap_or_else(|| {
                let kind = kind.as_deref().filter(|kind| !kind.trim().is_empty());
                format!("[{}]", kind.unwrap_or("非文本消息"))
            });
        writeln!(prompt_text, "[{}] {sender}: {text}", when.strftime("%H:%M"))
            .expect("writing to String cannot fail");
    }

    let response = ai_response(state, prompt_text, events.is_some()).await?;
    let result = match events {
        Some(sender) => read_ai_stream(response, sender).await?,
        None => read_ai_completion(response).await?,
    };
    let created_at = Timestamp::now().as_millisecond();
    let row = state
        .db
        .run(move |db| {
            db.execute(
                "INSERT INTO analyses (gid, date, prompt, result, message_count, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![gid, start, prompt, result, message_count, created_at],
            )?;
            Ok(StoredAnalysis {
                id: db.last_insert_rowid(),
                gid,
                date: start,
                prompt,
                result,
                message_count,
                created_at,
            })
        })
        .await?;
    row.view()
}

async fn ai_response(
    state: &AppState,
    prompt: String,
    streaming: bool,
) -> Result<reqwest::Response, AnalysisError> {
    let config = &state.config;
    if config.ai_base_url.trim().is_empty() {
        return Err(AnalysisError::failed(
            "AI 未配置，请在 application.yml 中设置 weibo.ai.base-url 和 weibo.ai.api-key",
        ));
    }
    let url = format!(
        "{}/v1/chat/completions",
        config.ai_base_url.trim_end_matches('/')
    );
    let request = state.ai_http.post(url).json(&json!({
        "model": config.ai_model,
        "messages": [
            {"role": "system", "content": config.ai_system_prompt},
            {"role": "user", "content": prompt}
        ],
        "stream": streaming
    }));
    let request = if config.ai_api_key.trim().is_empty() {
        request
    } else {
        request.bearer_auth(&config.ai_api_key)
    };
    let response = if streaming {
        tokio::time::timeout(config.ai_timeout, request.send())
            .await
            .map_err(|_| AnalysisError::failed("AI 响应超时。"))?
    } else {
        request.timeout(config.ai_timeout).send().await
    }
    .map_err(|error| AnalysisError::upstream(error.without_url()))?;
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }

    let body = response
        .text()
        .await
        .map_err(|error| AnalysisError::upstream(error.without_url()))?;
    let status_text = if streaming {
        status.as_u16().to_string()
    } else {
        let name = status
            .canonical_reason()
            .unwrap_or_default()
            .replace(' ', "_");
        format!("{} {}", status.as_u16(), name.to_ascii_uppercase())
    };
    let snippet = body.chars().take(500).collect::<String>();
    let snippet = if !streaming && snippet.is_empty() {
        "空"
    } else {
        &snippet
    };
    Err(AnalysisError::failed(format!(
        "AI 返回错误状态码 {status_text}：{snippet}"
    )))
}

async fn read_ai_completion(response: reqwest::Response) -> Result<String, AnalysisError> {
    let body = response
        .text()
        .await
        .map_err(|error| AnalysisError::upstream(error.without_url()))?;
    if body.trim().is_empty() {
        return Err(AnalysisError::failed("AI 返回空响应"));
    }
    let json: Value = serde_json::from_str(&body).map_err(AnalysisError::upstream)?;
    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or_default();
    if content.trim().is_empty() {
        let snippet: String = body.chars().take(500).collect();
        return Err(AnalysisError::failed(format!("AI 返回内容为空：{snippet}")));
    }
    Ok(content.to_owned())
}

async fn read_ai_stream(
    mut response: reqwest::Response,
    sender: &mpsc::Sender<Event>,
) -> Result<String, AnalysisError> {
    let mut pending = Vec::<u8>::new();
    let mut result = String::new();
    'chunks: while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| AnalysisError::upstream(error.without_url()))?
    {
        pending.extend_from_slice(&chunk);
        let mut start = 0;
        for (index, byte) in pending.iter().enumerate() {
            if matches!(byte, b'\n' | b'\r') {
                if accept_ai_line(&pending[start..index], sender, &mut result).await? {
                    pending.clear();
                    break 'chunks;
                }
                start = index + 1;
            }
        }
        pending.drain(..start);
    }

    if !pending.is_empty() {
        accept_ai_line(&pending, sender, &mut result).await?;
    }
    if result.is_empty() {
        return Err(AnalysisError::failed("AI 返回内容为空"));
    }
    Ok(result)
}

async fn accept_ai_line(
    line: &[u8],
    sender: &mpsc::Sender<Event>,
    result: &mut String,
) -> Result<bool, AnalysisError> {
    let line = String::from_utf8_lossy(line);
    let Some(payload) = line.strip_prefix("data:").map(str::trim) else {
        return Ok(false);
    };
    if payload == "[DONE]" {
        return Ok(true);
    }
    if !payload.is_empty() {
        let json: Value = serde_json::from_str(payload).map_err(AnalysisError::upstream)?;
        if let Some(delta) = json["choices"][0]["delta"]["content"]
            .as_str()
            .filter(|delta| !delta.is_empty())
        {
            let event = Event::default().event("delta").data(delta);
            sender
                .send(event)
                .await
                .map_err(|_| AnalysisError::failed("推送分析结果失败：连接已关闭。"))?;
            result.push_str(delta);
        }
    }
    Ok(false)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalysisView {
    id: i64,
    gid: i64,
    date: String,
    prompt: String,
    result: String,
    message_count: i64,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalysisSummary {
    id: i64,
    date: String,
    prompt_preview: String,
    message_count: i64,
    created_at: String,
}

#[derive(Serialize)]
struct AnalysisPage {
    items: Vec<AnalysisSummary>,
    page: i32,
    size: i32,
    total: i64,
}

struct StoredAnalysis {
    id: i64,
    gid: i64,
    date: i64,
    prompt: String,
    result: String,
    message_count: i64,
    created_at: i64,
}

impl StoredAnalysis {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            gid: row.get(1)?,
            date: row.get(2)?,
            prompt: row.get(3)?,
            result: row.get(4)?,
            message_count: row.get(5)?,
            created_at: row.get(6)?,
        })
    }

    fn view(self) -> Result<AnalysisView, AnalysisError> {
        Ok(AnalysisView {
            id: self.id,
            gid: self.gid,
            date: shanghai_time(self.date)?.strftime("%Y-%m-%d").to_string(),
            prompt: self.prompt,
            result: self.result,
            message_count: self.message_count,
            created_at: shanghai_time(self.created_at)?
                .strftime("%Y-%m-%d %H:%M:%S")
                .to_string(),
        })
    }
}

async fn list(
    State(state): State<AppState>,
    Query(params): Query<Parameters>,
) -> Result<Json<AnalysisPage>, AnalysisError> {
    let gid = number(&required(&params, "gid")?, "gid")?;
    validate_gid(gid)?;
    let resolved = |key, default| {
        parameter(&params, key)
            .filter(|value| !value.is_empty())
            .unwrap_or(default)
    };
    let page: i32 = number(resolved("page", "1"), "page")?;
    let size: i32 = number(resolved("size", "20"), "size")?;
    if page < 1 {
        return Err(AnalysisError::invalid("page 必须大于等于 1。"));
    }
    if !(1..=100).contains(&size) {
        return Err(AnalysisError::invalid("size 必须介于 1 和 100 之间。"));
    }
    let offset = i64::from(page - 1) * i64::from(size);
    let (entries, total) = state
        .db
        .run(move |db| {
            let mut query = db.prepare(
                "SELECT id, date, prompt, message_count, created_at
                 FROM analyses WHERE gid = ?1 ORDER BY created_at DESC, id DESC LIMIT ?2 OFFSET ?3",
            )?;
            let entries = query
                .query_map(params![gid, size, offset], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, i64>(4)?,
                    ))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            let total = db.query_row(
                "SELECT COUNT(*) FROM analyses WHERE gid = ?1",
                [gid],
                |row| row.get(0),
            )?;
            Ok((entries, total))
        })
        .await?;
    let items = entries
        .into_iter()
        .map(|(id, date, prompt_preview, message_count, created_at)| {
            Ok(AnalysisSummary {
                id,
                date: shanghai_time(date)?.strftime("%Y-%m-%d").to_string(),
                prompt_preview,
                message_count,
                created_at: shanghai_time(created_at)?
                    .strftime("%Y-%m-%d %H:%M:%S")
                    .to_string(),
            })
        })
        .collect::<Result<_, AnalysisError>>()?;
    Ok(Json(AnalysisPage {
        items,
        page,
        size,
        total,
    }))
}

async fn detail(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<AnalysisView>, AnalysisError> {
    let id: i64 = number(&id, "id")?;
    let stored = state
        .db
        .run(move |db| {
            db.query_row(
                "SELECT id, gid, date, prompt, result, message_count, created_at
                 FROM analyses WHERE id = ?1",
                [id],
                StoredAnalysis::from_row,
            )
            .optional()
        })
        .await?
        .ok_or_else(|| AnalysisError::invalid("分析记录不存在。"))?;
    Ok(Json(stored.view()?))
}
