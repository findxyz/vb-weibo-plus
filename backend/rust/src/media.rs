use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::time::Duration;

use axum::body::Body;
use axum::extract::{Multipart, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::Response;
use axum::routing::{get, post};
use axum::{Json, Router};
use reqwest::multipart::{Form, Part};
use reqwest::{Method, Url};
use rusqlite::{OptionalExtension, params};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::weibo::{self, HeaderProfile, Retry, SOURCE, WeiboError};
use crate::{AppState, chat, post as weibo_post};

const MEDIA_URL: &str = "https://upload.api.weibo.com/2/mss/msget";
const IMAGE_UPLOAD: &str = "https://api.weibo.com/webim/uploadx.json";
const SEND_URL: &str = "https://api.weibo.com/webim/groupchat/send_message.json";
const FILE_LIMIT: usize = 20 * 1024 * 1024;

type ApiResult<T> = Result<T, WeiboError>;

pub(crate) fn routes() -> Router<AppState> {
    Router::new()
        .route("/chat/media", get(chat_media))
        .route("/chat/image", get(chat_image))
        .route("/chat/messages/sendImage", post(send_image))
        .route("/chat/messages/sendVideo", post(send_video))
        .route("/post/image", get(post_image))
        .route("/post/videoCover", get(post_cover))
        .route("/post/video", get(post_video))
        .route("/weibo/group/media", get(raw_media))
        .route("/weibo/media/image", get(raw_direct))
        .route("/weibo/media/video", get(raw_direct))
}

fn bad(message: &str) -> WeiboError {
    WeiboError::new(StatusCode::BAD_REQUEST, message)
}
fn missing(message: &str) -> WeiboError {
    WeiboError::new(StatusCode::NOT_FOUND, message)
}

fn content_type(response: &reqwest::Response) -> HeaderValue {
    response
        .headers()
        .get(header::CONTENT_TYPE)
        .cloned()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| HeaderValue::from_static("application/octet-stream"))
}

fn has_length(response: &reqwest::Response) -> Option<u64> {
    response
        .headers()
        .get(header::CONTENT_LENGTH)?
        .to_str()
        .ok()?
        .parse()
        .ok()
}

fn byte_response(
    status: StatusCode,
    content_type: HeaderValue,
    content: axum::body::Bytes,
    cached: bool,
) -> ApiResult<Response> {
    let mut builder = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, content.len());
    if cached {
        builder = builder.header(header::CACHE_CONTROL, "max-age=86400, private");
    }
    builder
        .body(Body::from(content))
        .map_err(|error| WeiboError::internal(error.to_string()))
}

async fn group_media(
    state: &AppState,
    fid: &str,
    image_type: Option<&str>,
    range_header: Option<&str>,
) -> ApiResult<reqwest::Response> {
    let mut params = vec![("fid", fid), ("source", SOURCE)];
    if let Some(image_type) = image_type.filter(|value| !value.trim().is_empty()) {
        params.push(("imageType", image_type));
    }
    let url = weibo::with_query(MEDIA_URL, &params);
    weibo::request(
        state,
        Method::GET,
        &url,
        HeaderProfile::MsGet,
        true,
        Retry::RateLimit,
        |request| {
            if let Some(range) = range_header {
                request
                    .header(header::RANGE, range)
                    .header(header::ACCEPT_ENCODING, "identity")
            } else {
                request
            }
        },
    )
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawMedia {
    fid: String,
    image_type: Option<String>,
}

async fn raw_media(
    State(state): State<AppState>,
    Query(query): Query<RawMedia>,
) -> ApiResult<Response> {
    let response = group_media(&state, &query.fid, query.image_type.as_deref(), None).await?;
    raw_response(response).await
}

#[derive(Deserialize)]
struct MediaUrl {
    url: String,
}

async fn direct(state: &AppState, url: &str) -> ApiResult<reqwest::Response> {
    weibo::request(
        state,
        Method::GET,
        url,
        HeaderProfile::Direct,
        false,
        Retry::RateLimit,
        |request| request,
    )
    .await
}

async fn raw_direct(
    State(state): State<AppState>,
    Query(query): Query<MediaUrl>,
) -> ApiResult<Response> {
    raw_response(direct(&state, &query.url).await?).await
}

async fn raw_response(response: reqwest::Response) -> ApiResult<Response> {
    let status = response.status();
    let mut headers = response.headers().clone();
    let connection_headers = headers
        .get_all(header::CONNECTION)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(','))
        .filter_map(|name| header::HeaderName::from_bytes(name.trim().as_bytes()).ok())
        .collect::<Vec<_>>();
    for name in connection_headers {
        headers.remove(name);
    }
    for name in [
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "content-length",
    ] {
        headers.remove(name);
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| WeiboError::upstream("微博媒体下载失败。"))?;
    let mut downstream = Response::new(Body::from(bytes));
    *downstream.status_mut() = status;
    *downstream.headers_mut() = headers;
    Ok(downstream)
}

async fn chat_image(Query(query): Query<MediaUrl>) -> ApiResult<Response> {
    chat_image_response(&query.url, false).await
}

async fn chat_image_response(url: &str, cached: bool) -> ApiResult<Response> {
    let url = Url::parse(url).map_err(|_| bad("图片 URL 格式不正确。"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(bad("图片 URL 仅支持 HTTP 或 HTTPS。"));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(bad("图片 URL 格式不正确。"));
    }
    let host = url.host_str().ok_or_else(|| bad("图片 URL 格式不正确。"))?;
    let port = url.port_or_known_default().unwrap_or(80);
    let addresses: Vec<_> = tokio::net::lookup_host((host.trim_matches(['[', ']']), port))
        .await
        .map_err(|_| bad("图片地址无法解析。"))?
        .collect();
    if addresses.is_empty() {
        return Err(bad("图片地址无法解析。"));
    }
    if addresses.iter().any(|address| !public_ip(address.ip())) {
        return Err(bad("图片 URL 不允许指向本机或内网地址。"));
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .resolve_to_addrs(host, &addresses)
        .no_proxy()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|_| WeiboError::upstream("图片获取失败。"))?;
    let response = client
        .get(url)
        .header(header::USER_AGENT, "curl/8.14.1")
        .header(header::ACCEPT, "*/*")
        .send()
        .await
        .map_err(|_| WeiboError::upstream("图片获取失败。"))?;
    if !response.status().is_success() {
        return Err(WeiboError::upstream(format!(
            "图片获取失败，上游状态码：{}。",
            response.status().as_u16()
        )));
    }
    let kind = content_type(&response);
    let bytes = response
        .bytes()
        .await
        .map_err(|_| WeiboError::upstream("图片获取失败。"))?;
    byte_response(StatusCode::OK, kind, bytes, cached)
}

fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            !ip.is_unspecified()
                && !ip.is_loopback()
                && !ip.is_private()
                && !ip.is_link_local()
                && !ip.is_multicast()
                && ip.octets()[0] != 0
        }
        IpAddr::V6(ip) => match ip.to_ipv4_mapped() {
            Some(mapped) => public_ip(mapped.into()),
            None => {
                !ip.is_unspecified()
                    && !ip.is_loopback()
                    && !ip.is_unique_local()
                    && !ip.is_unicast_link_local()
                    && !ip.is_multicast()
                    && ip.segments()[0] & 0xffc0 != 0xfec0
            }
        },
    }
}

#[derive(Deserialize)]
struct ChatMedia {
    gid: i64,
    mid: i64,
    variant: String,
    #[serde(default)]
    retweeted: bool,
}

struct LocalMedia {
    kind: i64,
    fid: String,
    cover: String,
    text: String,
}

impl LocalMedia {
    fn video(&self) -> bool {
        self.kind == 10 || (self.kind == 13 && !self.text.contains("收到红包消息"))
    }
}

fn require_fid(fid: &str) -> ApiResult<&str> {
    if fid.trim().is_empty() {
        Err(missing("本地群消息媒体引用不存在。"))
    } else {
        Ok(fid)
    }
}

async fn chat_media(
    State(state): State<AppState>,
    Query(query): Query<ChatMedia>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    if query.gid <= 0 {
        return Err(bad("gid 必须大于 0。"));
    }
    if query.variant == "weiboVideo" {
        let source =
            chat::shared_weibo_video_source(&state, query.gid, query.mid, query.retweeted).await?;
        return stream_weibo_video(&state, source, headers.get(header::RANGE)).await;
    }
    if query.variant == "weiboCover" {
        let (image_url, page_url) =
            chat::shared_weibo_cover(&state, query.gid, query.mid, query.retweeted).await?;
        let mut response = chat_image_response(&image_url, true).await?;
        if let Some(value) = page_url.and_then(|url| HeaderValue::from_str(url.as_str()).ok()) {
            response.headers_mut().insert("x-weibo-video-url", value);
        }
        return Ok(response);
    }
    if !matches!(
        query.variant.as_str(),
        "original" | "preview" | "file" | "video"
    ) {
        return Err(bad("variant 必须是 preview 或 original。"));
    }
    let (gid, mid) = (query.gid, query.mid);
    let local = state.db.run(move |db| db.query_row(
        "SELECT coalesce(media_type,0), coalesce(fid,''), coalesce(video_cover_fid,''), coalesce(text,'')
         FROM messages WHERE gid=? AND mid=?",
        params![gid,mid], |row| Ok(LocalMedia {
            kind:row.get(0)?,fid:row.get(1)?,cover:row.get(2)?,text:row.get(3)?,
        })
    ).optional()).await.map_err(|error| WeiboError::internal(error.to_string()))?
        .ok_or_else(|| missing("本地群消息不存在。"))?;
    let mut cached = true;
    let (fid, image_type) = match query.variant.as_str() {
        "video" if !local.video() => return Err(bad("该消息不是视频消息。")),
        "video" => {
            return stream_video(&state, require_fid(&local.fid)?, headers.get(header::RANGE))
                .await;
        }
        "file" if local.kind != 5 => return Err(bad("该消息不是文件消息。")),
        "file" => {
            cached = false;
            (require_fid(&local.fid)?, None)
        }
        "original" if local.kind == 1 => (require_fid(&local.fid)?, Some("origin")),
        "original" => return Err(bad("original 仅支持图片消息。")),
        "preview" if local.kind == 1 => (require_fid(&local.fid)?, Some("compress")),
        "preview" if local.video() => (require_fid(&local.cover)?, None),
        _ => return Err(bad("该消息类型不支持 preview。")),
    };
    let response = group_media(&state, fid, image_type, None).await?;
    if !response.status().is_success() {
        return Err(WeiboError::upstream("群消息媒体下载失败。"));
    }
    let kind = content_type(&response);
    let bytes = response
        .bytes()
        .await
        .map_err(|_| WeiboError::upstream("群消息媒体下载失败。"))?;
    let (kind, bytes) = if cached {
        heic(&state.config.ffmpeg_path, kind, bytes).await?
    } else {
        (kind, bytes)
    };
    byte_response(StatusCode::OK, kind, bytes, cached)
}

#[derive(Clone, Copy)]
enum ByteRange {
    Suffix(u64),
    From(u64, Option<u64>),
}

impl ByteRange {
    fn parse(value: &HeaderValue) -> ApiResult<Self> {
        let value = value
            .to_str()
            .ok()
            .and_then(|value| value.trim().strip_prefix("bytes="))
            .ok_or_else(|| bad("Range 请求格式不正确。"))?;
        if value.contains(',') {
            return Err(bad("仅支持单个 Range 请求。"));
        }
        let (start, end) = value
            .split_once('-')
            .ok_or_else(|| bad("Range 请求格式不正确。"))?;
        if start.is_empty() {
            return end
                .parse::<u64>()
                .ok()
                .filter(|size| *size > 0)
                .map(Self::Suffix)
                .ok_or_else(|| bad("Range 请求格式不正确。"));
        }
        let start = start
            .parse::<u64>()
            .map_err(|_| bad("Range 请求格式不正确。"))?;
        let end = (!end.is_empty())
            .then(|| end.parse::<u64>())
            .transpose()
            .map_err(|_| bad("Range 请求格式不正确。"))?;
        if end.is_some_and(|end| end < start) {
            return Err(bad("Range 请求格式不正确。"));
        }
        Ok(Self::From(start, end))
    }
}

fn content_range(value: Option<&HeaderValue>) -> Option<(u64, u64, u64)> {
    let (range, total) = value?
        .to_str()
        .ok()?
        .strip_prefix("bytes ")?
        .split_once('/')?;
    let (start, end) = range.split_once('-')?;
    Some((start.parse().ok()?, end.parse().ok()?, total.parse().ok()?))
}

fn range_unsatisfied(total: u64) -> ApiResult<Response> {
    Response::builder()
        .status(StatusCode::RANGE_NOT_SATISFIABLE)
        .header(header::CONTENT_RANGE, format!("bytes */{total}"))
        .header(header::ACCEPT_RANGES, "bytes")
        .body(Body::empty())
        .map_err(|error| WeiboError::internal(error.to_string()))
}

async fn stream_video(
    state: &AppState,
    fid: &str,
    range: Option<&HeaderValue>,
) -> ApiResult<Response> {
    let requested = range.map(ByteRange::parse).transpose()?;
    let requested = match requested {
        Some(ByteRange::Suffix(length)) => {
            let probe = group_media(state, fid, None, Some("bytes=0-0")).await?;
            let Some((0, 0, total)) = content_range(probe.headers().get(header::CONTENT_RANGE))
            else {
                return Err(WeiboError::upstream("群消息视频长度探测响应不正确。"));
            };
            if total == 0 || has_length(&probe) != Some(1) || !probe.status().is_success() {
                return Err(WeiboError::upstream("群消息视频长度探测响应不正确。"));
            }
            Some((total.saturating_sub(length), Some(total - 1)))
        }
        Some(ByteRange::From(start, end)) => Some((start, end)),
        None => None,
    };
    let range_header = requested.map(|(start, end)| {
        format!(
            "bytes={start}-{}",
            end.map(|end| end.to_string()).unwrap_or_default()
        )
    });
    let response = group_media(state, fid, None, range_header.as_deref()).await?;
    let upstream_length = has_length(&response);
    let mut builder = Response::builder()
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_TYPE, content_type(&response));
    if let Some((requested_start, requested_end)) = requested {
        if response.status() == StatusCode::RANGE_NOT_SATISFIABLE {
            let total = response
                .headers()
                .get(header::CONTENT_RANGE)
                .and_then(|value| value.to_str().ok()?.strip_prefix("bytes */")?.parse().ok())
                .ok_or_else(|| WeiboError::upstream("群消息视频范围错误响应缺少完整长度。"))?;
            return range_unsatisfied(total);
        }
        if !response.status().is_success() {
            return Err(WeiboError::upstream("群消息媒体下载失败。"));
        }
        let Some((start, end, total)) =
            content_range(response.headers().get(header::CONTENT_RANGE))
        else {
            if let Some(total) = upstream_length.filter(|total| requested_start >= *total) {
                return range_unsatisfied(total);
            }
            return Err(WeiboError::upstream(
                "群消息视频分片响应缺少有效的 Content-Range。",
            ));
        };
        if end < start
            || end >= total
            || start != requested_start
            || end
                != requested_end
                    .unwrap_or(u64::MAX)
                    .min(total.saturating_sub(1))
        {
            return Err(WeiboError::upstream("群消息视频分片响应与请求范围不一致。"));
        }
        if upstream_length != Some(end - start + 1) {
            return Err(WeiboError::upstream("群消息视频分片响应长度不正确。"));
        }
        builder = builder.status(StatusCode::PARTIAL_CONTENT).header(
            header::CONTENT_RANGE,
            format!("bytes {start}-{end}/{total}"),
        );
    } else if !response.status().is_success() {
        return Err(WeiboError::upstream("群消息媒体下载失败。"));
    }
    let length = upstream_length
        .ok_or_else(|| WeiboError::upstream("群消息视频响应缺少 Content-Length。"))?;
    builder
        .header(header::CONTENT_LENGTH, length)
        .body(Body::from_stream(response.bytes_stream()))
        .map_err(|error| WeiboError::internal(error.to_string()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PostImage {
    mblog_id: String,
    pid: String,
    variant: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PostVideoQuery {
    mblog_id: String,
    #[serde(default)]
    retweeted: bool,
}

struct StoredPostMedia {
    id: i64,
    pictures: Value,
    quoted: Value,
    cover: String,
}

async fn stored_post(state: &AppState, id: String) -> ApiResult<StoredPostMedia> {
    state
        .db
        .run(move |db| {
            db.query_row(
        "SELECT coalesce(pics_json,''), coalesce(retweeted_json,''), coalesce(video_cover_url,''), post_id
         FROM posts WHERE mblogid=?",
        [id],
        |row| Ok(StoredPostMedia {
            pictures: serde_json::from_str(&row.get::<_, String>(0)?).unwrap_or_default(),
            quoted: serde_json::from_str(&row.get::<_, String>(1)?).unwrap_or_default(),
            cover: row.get(2)?,
            id: row.get(3)?,
        }),
    ).optional()
        })
        .await
        .map_err(|error| WeiboError::internal(error.to_string()))?
        .ok_or_else(|| missing("本地微博不存在。"))
}

async fn post_image(
    State(state): State<AppState>,
    Query(query): Query<PostImage>,
) -> ApiResult<Response> {
    if !matches!(query.variant.as_str(), "original" | "thumbnail") {
        return Err(bad("variant 必须是 thumbnail 或 original。"));
    }
    let post = stored_post(&state, query.mblog_id).await?;
    let picture = post
        .pictures
        .as_array()
        .into_iter()
        .flatten()
        .chain(post.quoted["pics"].as_array().into_iter().flatten())
        .find(|picture| picture["pid"].as_str() == Some(&query.pid))
        .ok_or_else(|| missing("本地微博图片不存在。"))?;
    post_media(
        &state,
        picture[query.variant]["url"].as_str().unwrap_or_default(),
        true,
    )
    .await
}

async fn post_cover(
    State(state): State<AppState>,
    Query(query): Query<PostVideoQuery>,
) -> ApiResult<Response> {
    let post = stored_post(&state, query.mblog_id).await?;
    let reference = if query.retweeted {
        if !post.quoted.is_object() {
            return Err(missing("本地转发微博不存在。"));
        }
        post.quoted["video_cover_url"].as_str().unwrap_or_default()
    } else {
        &post.cover
    };
    post_media(&state, reference, false).await
}

async fn post_video(
    State(state): State<AppState>,
    Query(query): Query<PostVideoQuery>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let post = stored_post(&state, query.mblog_id).await?;
    let id = if query.retweeted {
        post.quoted["post_id"]
            .as_i64()
            .filter(|id| *id > 0)
            .ok_or_else(|| missing("本地转发微博不存在。"))?
    } else {
        post.id
    };
    let source = weibo_post::video_source(&state, &id.to_string()).await?;
    stream_weibo_video(&state, source, headers.get(header::RANGE)).await
}

async fn stream_weibo_video(
    state: &AppState,
    source: Url,
    range: Option<&HeaderValue>,
) -> ApiResult<Response> {
    let upstream = weibo::request(
        state,
        Method::GET,
        source.as_str(),
        HeaderProfile::Direct,
        false,
        Retry::RateLimit,
        |request| {
            let request = request.header(header::ACCEPT_ENCODING, "identity");
            if let Some(range) = range {
                request.header(header::RANGE, range)
            } else {
                request
            }
        },
    )
    .await?;
    let status = upstream.status();
    let content_range = upstream.headers().get(header::CONTENT_RANGE);
    if status == StatusCode::RANGE_NOT_SATISFIABLE
        && let Some(range) = content_range
    {
        return Response::builder()
            .status(status)
            .header(header::CONTENT_RANGE, range)
            .body(Body::empty())
            .map_err(|error| WeiboError::internal(error.to_string()));
    }
    if !(status == StatusCode::OK
        || (status == StatusCode::PARTIAL_CONTENT && content_range.is_some()))
        || content_type(&upstream)
            .to_str()
            .ok()
            .and_then(|value| value.split(';').next())
            .is_none_or(|value| !value.eq_ignore_ascii_case("video/mp4"))
    {
        return Err(WeiboError::upstream("微博视频响应不正确。"));
    }
    let mut builder = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "video/mp4")
        .header(header::ACCEPT_RANGES, "bytes");
    for name in [header::CONTENT_LENGTH, header::CONTENT_RANGE] {
        if let Some(value) = upstream.headers().get(&name) {
            builder = builder.header(name, value);
        }
    }
    builder
        .body(Body::from_stream(upstream.bytes_stream()))
        .map_err(|error| WeiboError::internal(error.to_string()))
}

async fn post_media(state: &AppState, reference: &str, cached: bool) -> ApiResult<Response> {
    if reference.trim().is_empty() {
        return Err(missing("本地微博媒体引用不存在。"));
    }
    let response = direct(state, reference).await?;
    if !response.status().is_success() {
        return Err(WeiboError::upstream("微博媒体下载失败。"));
    }
    let kind = content_type(&response);
    let bytes = response
        .bytes()
        .await
        .map_err(|_| WeiboError::upstream("微博媒体下载失败。"))?;
    byte_response(StatusCode::OK, kind, bytes, cached)
}

async fn heic(
    ffmpeg: &Path,
    kind: HeaderValue,
    content: axum::body::Bytes,
) -> ApiResult<(HeaderValue, axum::body::Bytes)> {
    if content.get(4..8) != Some(b"ftyp") || !matches!(content.get(8..12), Some(b"heic" | b"mif1"))
    {
        return Ok((kind, content));
    }
    if !process_output(ffmpeg, &["-version"], 5)
        .await
        .is_ok_and(|output| output.status.success())
    {
        return Ok((HeaderValue::from_static("image/heic"), content));
    }
    let dir = temporary_dir()?;
    let input = dir.path().join("input.heic");
    std::fs::write(&input, &content)
        .map_err(|_| WeiboError::upstream("群消息 HEIC 图片转码失败。"))?;
    let input = input.to_string_lossy();
    let result = process_output(
        ffmpeg,
        &[
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            &input,
            "-frames:v",
            "1",
            "-f",
            "image2pipe",
            "-vcodec",
            "mjpeg",
            "-",
        ],
        30,
    )
    .await
    .map_err(|_| WeiboError::upstream("群消息 HEIC 图片转码失败。"))?;
    if !result.status.success() || result.stdout.is_empty() {
        return Err(WeiboError::upstream("群消息 HEIC 图片转码失败。"));
    }
    Ok((HeaderValue::from_static("image/jpeg"), result.stdout.into()))
}

async fn process_output(
    path: &Path,
    arguments: &[&str],
    timeout: u64,
) -> std::io::Result<std::process::Output> {
    let mut command = tokio::process::Command::new(path);
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command.kill_on_drop(true).args(arguments);
    tokio::time::timeout(Duration::from_secs(timeout), command.output()).await?
}

#[cfg(all(test, windows))]
mod tests {
    use super::process_output;
    use std::path::Path;

    #[tokio::test]
    async fn media_subprocess_does_not_share_a_console() {
        let output = process_output(
            Path::new("powershell.exe"),
            &[
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                r#"Add-Type 'using System.Runtime.InteropServices;
                    public class Kernel {
                        [DllImport("kernel32.dll")]
                        public static extern uint GetConsoleProcessList(uint[] ids, uint count);
                    }';
                    [Console]::WriteLine([Kernel]::GetConsoleProcessList([UInt32[]]::new(1), 1))"#,
            ],
            15,
        )
        .await
        .unwrap();
        assert!(output.status.success());
        let console_processes: u32 = String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse()
            .unwrap();
        assert!(console_processes <= 1);
    }
}

fn temporary_dir() -> ApiResult<tempfile::TempDir> {
    tempfile::tempdir().map_err(|_| WeiboError::internal("无法创建临时目录。"))
}

#[derive(Deserialize)]
struct UploadQuery {
    gid: Option<i64>,
}

struct Upload {
    gid: i64,
    filename: String,
    mime: String,
    data: axum::body::Bytes,
}

async fn parse_upload(query: UploadQuery, mut form: Multipart, video: bool) -> ApiResult<Upload> {
    let mut gid = query.gid;
    let mut upload = None;
    let empty_error = if video {
        "视频文件不能为空。"
    } else {
        "图片文件不能为空。"
    };
    while let Some(part) = form.next_field().await.map_err(multipart_error)? {
        match part.name() {
            Some("gid") if gid.is_none() => {
                gid = Some(
                    part.text()
                        .await
                        .map_err(multipart_error)?
                        .parse()
                        .map_err(|_| bad("gid 格式无效。"))?,
                );
            }
            Some("file") if upload.is_none() => {
                let filename = part
                    .file_name()
                    .filter(|name| !name.trim().is_empty())
                    .unwrap_or(if video { "video.mp4" } else { "image.png" })
                    .to_owned();
                let mime = part.content_type().unwrap_or_default().to_owned();
                let data = part.bytes().await.map_err(multipart_error)?;
                upload = Some((filename, mime, data));
            }
            _ => {}
        }
    }
    let gid = gid
        .filter(|gid| *gid > 0)
        .ok_or_else(|| bad("gid 必须大于 0。"))?;
    let (filename, mime, data) = upload
        .filter(|(_, _, data)| !data.is_empty())
        .ok_or_else(|| bad(empty_error))?;
    if video && mime != "video/mp4" {
        return Err(bad("仅支持 MP4 视频文件。"));
    }
    if !video && !mime.starts_with("image/") {
        return Err(bad("仅支持图片文件。"));
    }
    if Part::text("").mime_str(&mime).is_err() {
        return Err(bad("媒体文件类型格式无效。"));
    }
    if data.len() > FILE_LIMIT {
        return Err(WeiboError::new(
            StatusCode::PAYLOAD_TOO_LARGE,
            "上传文件不能超过 20 MB。",
        ));
    }
    Ok(Upload {
        gid,
        filename,
        mime,
        data,
    })
}

fn multipart_error(error: axum::extract::multipart::MultipartError) -> WeiboError {
    WeiboError::new(error.status(), "上传表单格式不正确或超过请求限制。")
}

async fn send_image(
    State(state): State<AppState>,
    Query(query): Query<UploadQuery>,
    form: Multipart,
) -> ApiResult<Json<chat::SaveResult>> {
    let upload = parse_upload(query, form, false).await?;
    let md5 = format!("{:x}", md5::compute(&upload.data));
    let params = init_params(&upload, &md5, "dm_attachment_pic");
    let init = post_form(
        &state,
        "https://api.weibo.com/webim/fileplatform/init.json",
        &params,
    )
    .await?;
    let token = file_token(&init)?;
    let chunk_size = chunk_size(&init, upload.data.len());
    let gid = upload.gid.to_string();
    let query = [("source", SOURCE), ("is_chunk", "1"), ("selectId", &gid)];
    for (index, piece) in upload.data.chunks(chunk_size).enumerate() {
        let start = (index * chunk_size).to_string();
        let uploaded = weibo::json::<Value>(
            weibo::request(
                &state,
                Method::POST,
                IMAGE_UPLOAD,
                HeaderProfile::WebImSend,
                true,
                Retry::RateLimit,
                |request| {
                    request.query(&query).multipart(
                        Form::new()
                            .part(
                                "file",
                                Part::bytes(piece.to_vec())
                                    .file_name(upload.filename.clone())
                                    .mime_str(&upload.mime)
                                    .expect("validated media type"),
                            )
                            .text("filetoken", token.to_owned())
                            .text("startloc", start.clone())
                            .text("source", SOURCE)
                            .text("filelength", "")
                            .text("filecheck", "")
                            .text("percent", ""),
                    )
                },
            )
            .await?,
        )
        .await?;
        if let Some(fid) = positive_fid(&uploaded) {
            return send_uploaded(&state, upload.gid, fid, None).await;
        }
    }
    Err(WeiboError::internal("图片上传失败：未拿到文件 id。"))
}

async fn send_video(
    State(state): State<AppState>,
    Query(query): Query<UploadQuery>,
    form: Multipart,
) -> ApiResult<Json<chat::SaveResult>> {
    let upload = parse_upload(query, form, true).await?;
    let VideoProbe {
        width,
        height,
        duration,
        cover,
    } = probe_video(&state.config.ffmpeg_path, &upload.data).await?;
    let gid = upload.gid.to_string();
    let cover_result = weibo::json::<Value>(
        weibo::request(
            &state,
            Method::POST,
            IMAGE_UPLOAD,
            HeaderProfile::WebImSend,
            true,
            Retry::RateLimit,
            |request| {
                request
                    .query(&[("source", SOURCE), ("gid", &gid)])
                    .multipart(
                        Form::new().part(
                            "imageName",
                            Part::bytes(cover.clone())
                                .file_name("cover.png")
                                .mime_str("image/png")
                                .expect("static media type"),
                        ),
                    )
            },
        )
        .await?,
    )
    .await?;
    let cover_fid = positive_fid(&cover_result)
        .ok_or_else(|| WeiboError::upstream("视频封面上传失败：未拿到文件 id。"))?;
    let hash = format!("{:x}", md5::compute(&upload.data));
    let mut params = init_params(&upload, &hash, "dm_attachment_video");
    params.push(("mediaprops", format!(
        "{{\"raw_md5\":\"{hash}\",\"video_type\":\"dm_video\",\"screenshot\":0,\"width\":{width},\"height\":{height},\"duration\":{duration},\"dm_video_props\":{{\"togid\":{gid},\"touid\":0,\"gid\":0}}}}"
    )));
    let init = post_form(
        &state,
        "https://api.weibo.com/webim/2/multimedia/init.json",
        &params,
    )
    .await?;
    let token = file_token(&init)?;
    let auth = init["auth"]
        .as_str()
        .filter(|auth| !auth.is_empty())
        .ok_or_else(|| WeiboError::upstream("视频上传失败：缺少上传认证。"))?;
    let chunk_size = chunk_size(&init, upload.data.len());
    let chunks = upload.data.len().div_ceil(chunk_size).to_string();
    for (index, piece) in upload.data.chunks(chunk_size).enumerate() {
        let index_string = index.to_string();
        let start = (index * chunk_size).to_string();
        let piece_hash = format!("{:x}", md5::compute(piece));
        let query = [
            ("name", upload.filename.as_str()),
            ("chunk", &index_string),
            ("chunks", &chunks),
            ("source", SOURCE),
            ("filetoken", token),
            ("startloc", &start),
            ("selectId", &gid),
            ("check", &hash),
            ("sectioncheck", &piece_hash),
        ];
        let result = weibo::json::<Value>(
            weibo::request(
                &state,
                Method::POST,
                "https://up.video.weibocdn.com/2/multimedia/upload.json",
                HeaderProfile::VideoUpload,
                true,
                Retry::RateLimit,
                |request| {
                    request
                        .query(&query)
                        .header("X-Up-Auth", auth)
                        .header(header::CONTENT_TYPE, "application/octet-stream")
                        .body(piece.to_vec())
                },
            )
            .await?,
        )
        .await?;
        if let Some(fid) = positive_fid(&result) {
            return send_uploaded(&state, upload.gid, fid, Some(cover_fid)).await;
        }
    }
    Err(WeiboError::internal("视频上传失败：未拿到文件 id。"))
}

fn init_params(upload: &Upload, md5: &str, kind: &str) -> Vec<(&'static str, String)> {
    vec![
        (
            "extprops",
            format!("{{\"uploadType\":3,\"recipientId\":{}}}", upload.gid),
        ),
        ("length", upload.data.len().to_string()),
        ("name", upload.filename.clone()),
        ("type", kind.to_owned()),
        ("md5", md5.to_owned()),
        ("check", md5.to_owned()),
        ("source", SOURCE.to_owned()),
    ]
}

async fn post_form(state: &AppState, url: &str, params: &[(&str, String)]) -> ApiResult<Value> {
    weibo::json(
        weibo::request(
            state,
            Method::POST,
            url,
            HeaderProfile::WebImSend,
            true,
            Retry::RateLimit,
            |request| request.form(params),
        )
        .await?,
    )
    .await
}

fn file_token(value: &Value) -> ApiResult<&str> {
    value["filetoken"]
        .as_str()
        .or_else(|| value["fileToken"].as_str())
        .filter(|token| !token.is_empty())
        .ok_or_else(|| WeiboError::upstream("上传响应缺少文件 token。"))
}

fn chunk_size(value: &Value, file_length: usize) -> usize {
    value["length"]
        .as_u64()
        .and_then(|length| usize::try_from(length).ok())
        .filter(|length| *length > 0)
        .map(|length| length.saturating_mul(1024).min(file_length))
        .unwrap_or(file_length)
}

fn positive_fid(value: &Value) -> Option<i64> {
    value["fid"]
        .as_i64()
        .or_else(|| value["fid"].as_str()?.parse().ok())
        .filter(|fid| *fid > 0)
}

async fn send_uploaded(
    state: &AppState,
    gid: i64,
    fid: i64,
    cover: Option<i64>,
) -> ApiResult<Json<chat::SaveResult>> {
    let (annotations, content, kind, failure) = match cover {
        Some(cover) => (
            format!("{{\"video_pic_fid\":{cover},\"webchat\":1}}"),
            "分享视频",
            "10",
            "视频消息发送失败：result != true。",
        ),
        None => (
            json!({"webchat":1}).to_string(),
            "分享图片",
            "1",
            "图片消息发送失败：result != true。",
        ),
    };
    let params = [
        ("annotations", annotations),
        ("content", content.to_owned()),
        ("fids", fid.to_string()),
        ("id", gid.to_string()),
        ("return_detail", "1".to_owned()),
        ("media_type", kind.to_owned()),
        ("source", SOURCE.to_owned()),
    ];
    let result = post_form(state, SEND_URL, &params).await?;
    if result["result"] != true {
        return Err(WeiboError::upstream(failure));
    }
    chat::save_incremental(state, gid)
        .await
        .map(Json)
        .map_err(|_| {
            WeiboError::new(
                StatusCode::CONFLICT,
                "消息已发出，但本地同步失败，稍后会自动补全。",
            )
        })
}

struct VideoProbe {
    width: i64,
    height: i64,
    duration: i64,
    cover: Vec<u8>,
}

async fn probe_video(ffmpeg: &Path, data: &[u8]) -> ApiResult<VideoProbe> {
    if !process_output(ffmpeg, &["-version"], 5)
        .await
        .is_ok_and(|output| output.status.success())
    {
        return Err(WeiboError::upstream(
            "未检测到 ffmpeg，无法发送视频。请安装 ffmpeg 并加入 PATH。",
        ));
    }
    let dir = temporary_dir()?;
    let path = dir.path().join("input.mp4");
    std::fs::write(&path, data).map_err(|_| WeiboError::upstream("视频属性探测失败。"))?;
    let path = path.to_string_lossy();
    let ffprobe = if ffmpeg == Path::new("ffmpeg") {
        PathBuf::from("ffprobe")
    } else {
        ffmpeg.with_file_name(
            if ffmpeg
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
            {
                "ffprobe.exe"
            } else {
                "ffprobe"
            },
        )
    };
    let output = process_output(
        &ffprobe,
        &[
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height:format=duration",
            "-of",
            "json",
            &path,
        ],
        30,
    )
    .await
    .map_err(|_| WeiboError::upstream("视频属性探测失败。"))?;
    if !output.status.success() {
        return Err(WeiboError::upstream("视频属性探测失败。"));
    }
    let info: Value = serde_json::from_slice(&output.stdout)
        .map_err(|_| WeiboError::upstream("视频属性探测失败。"))?;
    let width = info["streams"][0]["width"].as_i64().unwrap_or_default();
    let height = info["streams"][0]["height"].as_i64().unwrap_or_default();
    if width <= 0 || height <= 0 {
        return Err(WeiboError::upstream("视频属性探测失败：宽高非法。"));
    }
    let duration = info["format"]["duration"]
        .as_f64()
        .or_else(|| info["format"]["duration"].as_str()?.parse().ok())
        .map(|duration| duration.round() as i64)
        .unwrap_or_default();
    if duration <= 0 {
        return Err(WeiboError::upstream("视频属性探测失败：时长非法。"));
    }
    if duration > 300 {
        return Err(WeiboError::upstream("视频时长超过 5 分钟限制。"));
    }
    let output = process_output(
        ffmpeg,
        &[
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            &path,
            "-frames:v",
            "1",
            "-f",
            "image2pipe",
            "-vcodec",
            "png",
            "-",
        ],
        30,
    )
    .await
    .map_err(|_| WeiboError::upstream("视频封面提取失败。"))?;
    if !output.status.success() || output.stdout.is_empty() {
        return Err(WeiboError::upstream("视频封面提取失败：未得到封面图数据。"));
    }
    Ok(VideoProbe {
        width,
        height,
        duration,
        cover: output.stdout,
    })
}
