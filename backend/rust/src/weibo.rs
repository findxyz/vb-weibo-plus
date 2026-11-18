use std::fmt::Write;
use std::time::Duration;

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use reqwest::{Method, RequestBuilder, Url, header};
use rusqlite::params;
use serde::{Deserialize, Deserializer, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};

use crate::AppState;

pub const SOURCE: &str = "209678993";
pub const USER_AGENT: &str = concat!(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
    " Chrome/126.0.0.0 Safari/537.36"
);
const CONTACTS_URL: &str = "https://api.weibo.com/webim/2/direct_messages/contacts.json";

#[derive(Clone, Debug, thiserror::Error)]
#[error("{msg}")]
pub struct WeiboError {
    pub status: StatusCode,
    pub msg: String,
}

impl WeiboError {
    pub fn new(status: StatusCode, msg: impl Into<String>) -> Self {
        Self {
            status,
            msg: msg.into(),
        }
    }

    pub fn internal(msg: impl Into<String>) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, msg)
    }

    pub fn upstream(msg: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_GATEWAY, msg)
    }
}

impl IntoResponse for WeiboError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({"code": self.status.as_u16(), "msg": self.msg})),
        )
            .into_response()
    }
}

#[derive(Clone, Copy)]
pub enum HeaderProfile {
    Ajax,
    WebIm,
    WebImSend,
    MsGet,
    VideoUpload,
    Direct,
}

impl HeaderProfile {
    fn apply(self, request: RequestBuilder) -> RequestBuilder {
        let referer = match self {
            Self::WebImSend => "https://api.weibo.com/chat",
            Self::MsGet => "https://web.im.weibo.com/",
            Self::VideoUpload => "https://api.weibo.com/",
            _ => "https://weibo.com/",
        };
        let request = request
            .header(header::USER_AGENT, USER_AGENT)
            .header(header::REFERER, referer);
        match self {
            Self::Ajax => request.header("X-Requested-With", "XMLHttpRequest"),
            Self::MsGet => request.header(header::ORIGIN, "https://web.im.weibo.com"),
            Self::VideoUpload => request.header(header::ORIGIN, "https://api.weibo.com"),
            _ => request,
        }
    }
}

#[derive(Clone, Copy)]
pub enum Retry {
    RateLimit,
    Once,
}

pub async fn request(
    state: &AppState,
    method: Method,
    url: &str,
    headers: HeaderProfile,
    authenticated: bool,
    retry: Retry,
    prepare: impl Fn(RequestBuilder) -> RequestBuilder,
) -> Result<reqwest::Response, WeiboError> {
    let url = upstream_url(state, url)?;
    let credential =
        if authenticated {
            Some(state.credential.get().ok_or_else(|| {
                WeiboError::new(StatusCode::UNAUTHORIZED, "未登录，无可用 Cookie")
            })?)
        } else {
            None
        };
    let mut delays = match retry {
        Retry::RateLimit => [4, 16, 64].as_slice().iter(),
        Retry::Once => [].as_slice().iter(),
    };
    loop {
        let mut builder = headers.apply(state.http.request(method.clone(), url.clone()));
        if let Some(credential) = &credential {
            builder = builder.header(header::COOKIE, credential);
        }
        let response = prepare(builder)
            .send()
            .await
            .map_err(|_| WeiboError::upstream("微博请求超时或连接失败，请稍后重试。"))?;
        match response.status() {
            StatusCode::TOO_MANY_REQUESTS => match delays.next() {
                Some(&seconds) => {
                    drop(response);
                    tokio::time::sleep(Duration::from_secs(seconds)).await;
                }
                None => {
                    return Err(WeiboError::new(
                        StatusCode::TOO_MANY_REQUESTS,
                        match retry {
                            Retry::RateLimit => format!("微博接口限流，重试 3 次仍失败：{url}"),
                            Retry::Once => "微博接口限流，请稍后重试。".to_owned(),
                        },
                    ));
                }
            },
            StatusCode::URI_TOO_LONG => {
                return Err(WeiboError::new(
                    StatusCode::URI_TOO_LONG,
                    format!("URI 过长（414）：{url}"),
                ));
            }
            StatusCode::FOUND => {
                let location = response
                    .headers()
                    .get(header::LOCATION)
                    .and_then(|value| value.to_str().ok());
                if let Some(location) = location.filter(|location| is_login_redirect(location)) {
                    return Err(WeiboError::new(
                        StatusCode::UNAUTHORIZED,
                        format!("Credential 失效，302 跳转登录：{location}"),
                    ));
                }
                return Err(WeiboError::internal(format!(
                    "非预期的 302 重定向：{}",
                    location.unwrap_or("null")
                )));
            }
            _ => return Ok(response),
        }
    }
}

fn is_login_redirect(location: &str) -> bool {
    ["login.sina.com.cn", "passport.weibo.com", "weibo.com/login"]
        .iter()
        .any(|domain| location.contains(domain))
}

pub(crate) fn upstream_url(state: &AppState, url: &str) -> Result<Url, WeiboError> {
    let url = Url::parse(url).map_err(|_| WeiboError::internal("微博请求地址格式错误。"))?;
    if let Some(origin) = &state.config.weibo_origin {
        let mut destination =
            Url::parse(origin).map_err(|_| WeiboError::internal("微博请求地址格式错误。"))?;
        destination.set_path(url.path());
        destination.set_query(url.query());
        Ok(destination)
    } else {
        Ok(url)
    }
}

pub fn with_query<K: AsRef<str>, V: AsRef<str>>(url: &str, params: &[(K, V)]) -> String {
    let (base, fragment) = url
        .split_once('#')
        .map_or((url, None), |(base, part)| (base, Some(part)));
    let mut output = base.to_owned();
    let mut separator = if base.contains('?') { '&' } else { '?' };
    for (name, value) in params {
        let value = value.as_ref();
        if value.is_empty() {
            continue;
        }
        output.push(separator);
        separator = '&';
        write_query_component(&mut output, name.as_ref());
        output.push('=');
        write_query_component(&mut output, value);
    }
    if let Some(fragment) = fragment {
        output.push('#');
        output.push_str(fragment);
    }
    output
}

fn write_query_component(output: &mut String, value: &str) {
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || b"-._~!$'()*+,;:@/?".contains(&byte) {
            output.push(byte as char);
        } else {
            write!(output, "%{byte:02X}").expect("writing into a string is infallible");
        }
    }
}

pub async fn text(response: reqwest::Response) -> Result<String, WeiboError> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|_| WeiboError::upstream("读取微博响应失败。"))?;
    if status == StatusCode::OK
        && let Ok(value) = serde_json::from_str(&body)
    {
        check_expiry(&value)?;
    }
    Ok(body)
}

pub async fn json<T: DeserializeOwned>(response: reqwest::Response) -> Result<T, WeiboError> {
    let body = text(response).await?;
    serde_json::from_str(&body)
        .map_err(|error| WeiboError::internal(format!("响应反序列化失败：{error}")))
}

fn check_expiry(value: &Value) -> Result<(), WeiboError> {
    if value.get("error_code").and_then(parse_i64) == Some(21301) {
        return Err(WeiboError::new(
            StatusCode::UNAUTHORIZED,
            "Cookie 失效：error_code=21301, error=relogin!",
        ));
    }
    if value.get("error").and_then(Value::as_str) == Some("relogin!") {
        return Err(WeiboError::new(
            StatusCode::UNAUTHORIZED,
            "Cookie 失效：error=relogin!",
        ));
    }
    Ok(())
}

#[derive(Deserialize, Serialize)]
pub struct GroupList {
    #[serde(rename = "totalNumber", default, deserialize_with = "java_i32")]
    pub total_number: i32,
    pub contacts: Option<Vec<Option<Contact>>>,
}

#[derive(Deserialize, Serialize)]
pub struct Contact {
    pub user: Option<GroupUser>,
}

#[derive(Deserialize, Serialize)]
pub struct GroupUser {
    #[serde(default, deserialize_with = "java_optional_i64")]
    pub id: Option<i64>,
    #[serde(rename = "type", default, deserialize_with = "java_i32")]
    pub kind: i32,
    pub name: Option<String>,
    #[serde(default, deserialize_with = "java_i32")]
    pub member_count: i32,
    #[serde(default, deserialize_with = "java_i32")]
    pub max_member_count: i32,
    pub avatar_large: Option<String>,
    #[serde(default, deserialize_with = "java_optional_i64")]
    pub creator: Option<i64>,
    #[serde(default, deserialize_with = "java_optional_i64_list")]
    pub admins: Option<Vec<Option<i64>>>,
    #[serde(alias = "description")]
    pub summary: Option<String>,
    #[serde(default, deserialize_with = "java_i32")]
    pub group_type: i32,
}

fn parse_i64(value: &Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_str()?.trim().parse().ok())
}

fn java_i32<'de, D: Deserializer<'de>>(deserializer: D) -> Result<i32, D::Error> {
    java_optional_i64(deserializer)?
        .unwrap_or(0)
        .try_into()
        .map_err(serde::de::Error::custom)
}

fn java_optional_i64<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<i64>, D::Error> {
    let value = Value::deserialize(deserializer)?;
    if value.is_null() || value.as_str().is_some_and(|text| text.trim().is_empty()) {
        return Ok(None);
    }
    parse_i64(&value)
        .map(Some)
        .ok_or_else(|| serde::de::Error::custom("expected an integer"))
}

fn java_optional_i64_list<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Vec<Option<i64>>>, D::Error> {
    use serde::de::IntoDeserializer as _;

    let values = Option::<Vec<Value>>::deserialize(deserializer)?;
    values
        .map(|values| {
            values
                .into_iter()
                .map(|value| {
                    java_optional_i64(value.into_deserializer()).map_err(serde::de::Error::custom)
                })
                .collect::<Result<Vec<_>, _>>()
        })
        .transpose()
}

pub async fn group_list(state: &AppState) -> Result<GroupList, WeiboError> {
    let timestamp = chrono::Utc::now().timestamp_millis().to_string();
    let url = with_query(
        CONTACTS_URL,
        &[
            ("source", SOURCE),
            ("t", &timestamp),
            ("count", "50"),
            ("special_source", "3"),
            ("add_virtual_user", "3,4"),
            ("is_include_group", "0"),
            ("need_back", "0,0"),
            ("is_include_folder", "1"),
        ],
    );
    let response = request(
        state,
        Method::GET,
        &url,
        HeaderProfile::WebIm,
        true,
        Retry::RateLimit,
        |builder| builder,
    )
    .await?;
    json(response).await
}

pub async fn sync_groups(state: &AppState) -> Result<(), WeiboError> {
    let contacts = group_list(state)
        .await?
        .contacts
        .ok_or_else(|| WeiboError::upstream("群列表响应缺少 contacts。"))?;
    let users: Vec<_> = contacts
        .into_iter()
        .flatten()
        .filter_map(|contact| contact.user)
        .filter(|user| user.kind == 2)
        .map(|user| {
            let id = user
                .id
                .ok_or_else(|| WeiboError::internal("群标识不能为空。"))?;
            Ok((id, user))
        })
        .collect::<Result<_, WeiboError>>()?;
    let timestamp = chrono::Utc::now().timestamp_millis();
    state.db.run(move |connection| {
        let transaction = connection.transaction()?;
        for (id, user) in users {
            let admins = user.admins.map_or_else(|| "[]".to_owned(), |admins| json!(admins).to_string());
            transaction.execute(
                "INSERT INTO groups (gid, name, avatar, member_count, max_member, owner_id,
                    admins, summary, group_type, min_mid, max_mid, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, 0, ?10, ?10)
                 ON CONFLICT(gid) DO UPDATE SET name = excluded.name, avatar = excluded.avatar,
                    member_count = excluded.member_count, max_member = excluded.max_member,
                    owner_id = excluded.owner_id, admins = excluded.admins, summary = excluded.summary,
                    group_type = excluded.group_type, updated_at = excluded.updated_at",
                params![id, user.name.unwrap_or_default(), user.avatar_large.unwrap_or_default(),
                    user.member_count, user.max_member_count, user.creator.unwrap_or_default(),
                    admins, user.summary.unwrap_or_default(), user.group_type, timestamp],
            )?;
        }
        transaction.commit()
    }).await.map_err(|error| WeiboError::internal(format!("保存群列表失败：{error}")))
}
