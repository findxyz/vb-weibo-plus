use std::{
    collections::BTreeSet,
    sync::{Arc, Mutex},
    time::Duration,
};

use futures_util::{SinkExt, StreamExt};
use reqwest::{Method, Url};
use serde_json::{Value, json};
use tokio::{
    net::TcpStream,
    sync::Notify,
    time::{Instant, sleep, sleep_until, timeout, timeout_at},
};
use tokio_tungstenite::{
    MaybeTlsStream, WebSocketStream, connect_async,
    tungstenite::{Message, client::IntoClientRequest, http::header},
};

use crate::{
    AppState,
    weibo::{self, HeaderProfile, Retry, SOURCE, USER_AGENT, WeiboError},
};

use super::capture::save_incremental;

const PROFILE_URL: &str = "https://api.weibo.com/webim/query_primary_info.json";
const SOCKET_URL: &str = "wss://web.im.weibo.com/im";
const INITIAL_DELAY: Duration = Duration::from_secs(5);
const RECONNECT_DELAY: Duration = Duration::from_secs(60);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const STALE_AFTER: Duration = Duration::from_secs(200);

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub fn start_background(state: AppState) {
    let startup = state.clone();
    tokio::spawn(async move {
        report("启动时同步群列表", weibo::sync_groups(&startup).await);
    });
    if state.config.auto_sync_gids.is_empty() {
        return;
    }
    let captures = Arc::new(CaptureQueue::default());
    tokio::spawn(capture_groups(state.clone(), captures.clone()));
    tokio::spawn(maintain_socket(state, captures));
}

#[derive(Default)]
struct CaptureQueue {
    pending: Mutex<BTreeSet<i64>>,
    available: Notify,
}

impl CaptureQueue {
    fn add(&self, gid: i64) {
        if self.pending.lock().unwrap().insert(gid) {
            self.available.notify_one();
        }
    }

    fn remove(&self, gid: i64) {
        self.pending.lock().unwrap().remove(&gid);
    }

    async fn next(&self) -> i64 {
        loop {
            if let Some(gid) = self.pending.lock().unwrap().pop_first() {
                return gid;
            }
            self.available.notified().await;
        }
    }
}

async fn capture_groups(state: AppState, captures: Arc<CaptureQueue>) {
    let mut scheduled_at = Instant::now() + INITIAL_DELAY;
    loop {
        tokio::select! {
            biased;
            _ = sleep_until(scheduled_at) => {
                report("群消息增量同步", scheduled_capture(&state, &captures).await);
                scheduled_at = Instant::now() + state.config.sync_group_fixed_delay;
            }
            gid = captures.next() => {
                let label = format!("群消息推送后补拉：gid = {gid}");
                report(&label, save_incremental(&state, gid).await);
            }
        }
    }
}

async fn scheduled_capture(state: &AppState, captures: &CaptureQueue) -> Result<(), WeiboError> {
    let groups = state
        .db
        .run(|connection| {
            connection
                .prepare("SELECT gid FROM groups ORDER BY updated_at DESC, gid DESC")?
                .query_map([], |row| row.get::<_, i64>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()
        })
        .await
        .map_err(|error| WeiboError::internal(format!("读取自动同步群列表失败：{error}")))?;
    for gid in groups {
        if state.config.auto_sync_gids.contains(&gid) {
            captures.remove(gid);
            save_incremental(state, gid).await?;
        }
    }
    Ok(())
}

async fn maintain_socket(state: AppState, captures: Arc<CaptureQueue>) {
    sleep(INITIAL_DELAY).await;
    let mut sequence = 0;
    loop {
        let credential = current_credential(&state);
        if let Some(credential) = credential.as_deref() {
            report(
                "微博 WebSocket",
                connect_and_receive(&state, &captures, credential, &mut sequence).await,
            );
        }
        tokio::select! {
            _ = sleep(RECONNECT_DELAY) => {},
            _ = credential_changed(&state, credential.as_deref()) => {},
        }
    }
}

fn current_credential(state: &AppState) -> Option<String> {
    state
        .credential
        .get()
        .filter(|value| !value.trim().is_empty())
}

async fn credential_changed(state: &AppState, previous: Option<&str>) {
    while current_credential(state).as_deref() == previous {
        sleep(Duration::from_secs(1)).await;
    }
}

async fn connect_and_receive(
    state: &AppState,
    captures: &CaptureQueue,
    credential: &str,
    sequence: &mut u64,
) -> Result<(), WeiboError> {
    let Some(uid) = push_uid(state).await? else {
        return Ok(());
    };
    if current_credential(state).as_deref() != Some(credential) {
        return Ok(());
    }
    let mut socket = open_socket(socket_url(state)?, credential).await?;
    let result = receive(state, &mut socket, captures, uid, credential, sequence).await;
    let _ = timeout(Duration::from_secs(1), socket.close(None)).await;
    result
}

async fn push_uid(state: &AppState) -> Result<Option<i64>, WeiboError> {
    let timestamp = jiff::Timestamp::now().as_millisecond().to_string();
    let url = weibo::with_query(PROFILE_URL, &[("source", SOURCE), ("t", &timestamp)]);
    let response = weibo::request(
        state,
        Method::GET,
        &url,
        HeaderProfile::WebIm,
        true,
        Retry::RateLimit,
        |builder| builder,
    )
    .await?;
    let profile: Value = weibo::json(response).await?;
    if !is_true(&profile["websocket_gray"]) {
        return Ok(None);
    }
    let uid = positive_id(&profile["profile"]["id"])
        .ok_or_else(|| WeiboError::upstream("微博账号 UID 缺失。"))?;
    Ok(Some(uid))
}

fn socket_url(state: &AppState) -> Result<Url, WeiboError> {
    let mut url = weibo::upstream_url(state, SOCKET_URL)?;
    let scheme = match (url.scheme(), url.host_str()) {
        ("wss" | "https", _) => "wss",
        ("ws" | "http", Some("127.0.0.1" | "localhost" | "[::1]")) => "ws",
        _ => return Err(WeiboError::internal("微博 WebSocket 地址必须使用 TLS。")),
    };
    url.set_scheme(scheme)
        .map_err(|_| WeiboError::internal("微博 WebSocket 地址格式错误。"))?;
    Ok(url)
}

async fn open_socket(url: Url, credential: &str) -> Result<Socket, WeiboError> {
    let mut request = url.as_str().into_client_request().map_err(socket_error)?;
    request.headers_mut().insert(
        header::ORIGIN,
        header::HeaderValue::from_static("https://api.weibo.com"),
    );
    request.headers_mut().insert(
        header::USER_AGENT,
        header::HeaderValue::from_static(USER_AGENT),
    );
    request.headers_mut().insert(
        header::COOKIE,
        header::HeaderValue::from_str(credential)
            .map_err(|_| WeiboError::internal("微博登录凭据无法用于 WebSocket。"))?,
    );
    let (socket, _) = timeout(CONNECT_TIMEOUT, connect_async(request))
        .await
        .map_err(socket_error)?
        .map_err(socket_error)?;
    Ok(socket)
}

async fn receive(
    state: &AppState,
    socket: &mut Socket,
    captures: &CaptureQueue,
    uid: i64,
    credential: &str,
    sequence: &mut u64,
) -> Result<(), WeiboError> {
    send(
        socket,
        sequence,
        json!({
            "channel": "/meta/handshake", "version": "1.0", "minimumVersion": "1.0",
            "supportedConnectionTypes": ["websocket", "long-polling", "callback-polling"],
            "advice": {"timeout": 60_000, "interval": 0}
        }),
    )
    .await?;
    let subscription = format!("/im/{uid}");
    let mut client_id = None::<String>;
    let mut stale_at = Instant::now() + STALE_AFTER;
    let changed = credential_changed(state, Some(credential));
    tokio::pin!(changed);
    loop {
        let incoming = tokio::select! {
            _ = &mut changed => return Ok(()),
            result = timeout_at(stale_at, socket.next()) => result,
        }
        .map_err(|_| WeiboError::upstream("微博 WebSocket 连接已超时。"))?;
        let Some(incoming) = incoming else {
            return Ok(());
        };
        let message = incoming.map_err(socket_error)?;
        let Message::Text(payload) = message else {
            if matches!(message, Message::Close(_)) {
                return Ok(());
            }
            continue;
        };
        stale_at = Instant::now() + STALE_AFTER;
        let frames = match serde_json::from_str::<Vec<Value>>(payload.as_str()) {
            Ok(frames) => frames,
            Err(error) => {
                eprintln!("微博 WebSocket 消息解析失败：{error}");
                continue;
            }
        };
        let mut groups = BTreeSet::new();
        for frame in frames {
            match frame["channel"].as_str() {
                Some("/meta/handshake") => {
                    if !is_true(&frame["successful"]) {
                        return Err(bayeux_error("握手"));
                    }
                    if client_id.is_some() {
                        continue;
                    }
                    let id = frame["clientId"]
                        .as_str()
                        .filter(|id| !id.is_empty())
                        .ok_or_else(|| bayeux_error("握手"))?;
                    send(socket, sequence, json!({"channel": "/meta/subscribe", "subscription": subscription, "clientId": id})).await?;
                    send(socket, sequence, json!({"channel": "/meta/connect", "clientId": id, "connectionType": "websocket", "advice": {"timeout": 0}})).await?;
                    client_id = Some(id.to_owned());
                }
                Some("/meta/subscribe") => {
                    if !is_true(&frame["successful"]) {
                        return Err(bayeux_error("订阅"));
                    }
                }
                Some("/meta/connect") => {
                    if !is_true(&frame["successful"]) {
                        return Err(bayeux_error("连接"));
                    }
                    let id = client_id.as_deref().ok_or_else(|| bayeux_error("连接"))?;
                    send(socket, sequence, json!({"channel": "/meta/connect", "clientId": id, "connectionType": "websocket"})).await?;
                }
                Some(channel)
                    if channel == subscription
                        && frame["data"]["type"].as_str() == Some("groupchat") =>
                {
                    if let Some(gid) = positive_id(&frame["data"]["info"]["gid"])
                        .filter(|gid| state.config.auto_sync_gids.contains(gid))
                    {
                        groups.insert(gid);
                    }
                }
                _ => {}
            }
        }
        for gid in groups {
            captures.add(gid)
        }
    }
}

async fn send(socket: &mut Socket, sequence: &mut u64, mut frame: Value) -> Result<(), WeiboError> {
    *sequence += 1;
    frame["id"] = json!(sequence.to_string());
    timeout(
        CONNECT_TIMEOUT,
        socket.send(Message::Text(json!([frame]).to_string().into())),
    )
    .await
    .map_err(socket_error)?
    .map_err(socket_error)
}

fn positive_id(value: &Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_str()?.parse().ok())
        .filter(|id| *id > 0)
}

fn is_true(value: &Value) -> bool {
    value.as_bool().unwrap_or_else(|| {
        value.as_str() == Some("true") || value.as_i64().is_some_and(|number| number != 0)
    })
}

fn socket_error(error: impl std::fmt::Display) -> WeiboError {
    WeiboError::upstream(format!("微博 WebSocket 连接失败：{error}"))
}

fn bayeux_error(stage: &str) -> WeiboError {
    WeiboError::upstream(format!("微博 WebSocket {stage}失败。"))
}

fn report<T>(label: &str, result: Result<T, WeiboError>) {
    if let Err(error) = result {
        eprintln!("{label}失败：{error}");
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use axum::{Json, Router, extract::Query, routing::get};
    use tokio::net::TcpListener;
    use tokio_tungstenite::{
        accept_hdr_async,
        tungstenite::handshake::server::{Request, Response},
    };

    use super::*;
    use crate::Config;

    #[tokio::test]
    async fn startup_sync_then_scheduled_capture_only_visits_configured_known_groups() {
        let messages = Arc::new(Mutex::new(Vec::new()));
        let upstream = Router::new()
            .route(
                "/webim/2/direct_messages/contacts.json",
                get(|| async {
                    Json(json!({"totalNumber": 2, "contacts": [
                        {"user": {"id": 101, "type": 2, "name": "测试群甲"}},
                        {"user": {"id": 202, "type": 2, "name": "测试群乙"}}
                    ]}))
                }),
            )
            .route(
                "/webim/query_primary_info.json",
                get(|| async { Json(json!({"websocket_gray": false})) }),
            )
            .route(
                "/webim/groupchat/query_messages.json",
                get({
                    let messages = messages.clone();
                    move |Query(query): Query<HashMap<String, String>>| {
                        let messages = messages.clone();
                        async move {
                            messages.lock().unwrap().push(query["id"].clone());
                            Json(json!({"result": true, "messages": []}))
                        }
                    }
                }),
            );
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let fixture = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
        let root = tempfile::tempdir().unwrap();
        let state = AppState::new(Config {
            database_path: root.path().join("test-weibo.db"),
            cookie_file: root.path().join("test-weibo-cookie.txt"),
            auto_sync_gids: vec![101, 303],
            weibo_origin: Some(format!("http://{address}")),
            ..Config::default()
        })
        .await
        .unwrap();
        state
            .credential
            .set(Some("SUB=offline-test".into()))
            .unwrap();
        start_background(state);
        timeout(Duration::from_secs(9), async {
            while messages.lock().unwrap().is_empty() {
                sleep(Duration::from_millis(50)).await;
            }
        })
        .await
        .unwrap();
        sleep(Duration::from_millis(100)).await;
        assert_eq!(*messages.lock().unwrap(), vec!["101".to_owned()]);
        fixture.abort();
    }

    #[tokio::test]
    #[allow(clippy::result_large_err)]
    async fn subscribes_and_coalesces_pushes_for_selected_groups() {
        let root = tempfile::tempdir().unwrap();
        let state = AppState::new(Config {
            database_path: root.path().join("test-weibo.db"),
            cookie_file: root.path().join("test-weibo-cookie.txt"),
            auto_sync_gids: vec![101],
            ..Config::default()
        })
        .await
        .unwrap();
        let cookie = "SUB=offline-test";
        state.credential.set(Some(cookie.to_owned())).unwrap();
        assert_eq!(socket_url(&state).unwrap().as_str(), SOCKET_URL);

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let fixture = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = accept_hdr_async(stream, |request: &Request, response: Response| {
                assert_eq!(request.uri().path(), "/im");
                assert_eq!(request.headers()[header::COOKIE], "SUB=offline-test");
                assert_eq!(request.headers()[header::ORIGIN], "https://api.weibo.com");
                Ok(response)
            })
            .await
            .unwrap();
            assert_eq!(
                next_frame(&mut socket).await,
                json!({
                    "id": "1", "channel": "/meta/handshake", "version": "1.0",
                    "minimumVersion": "1.0", "advice": {"timeout": 60_000, "interval": 0},
                    "supportedConnectionTypes": ["websocket", "long-polling", "callback-polling"]
                })
            );
            fixture_send(
                &mut socket,
                json!([
                    {"channel": "/meta/handshake", "successful": true, "clientId": "fixture-tool"}
                ]),
            )
            .await;
            assert_eq!(
                next_frame(&mut socket).await,
                json!({
                    "id": "2", "channel": "/meta/subscribe", "clientId": "fixture-tool", "subscription": "/im/123"
                })
            );
            assert_eq!(
                next_frame(&mut socket).await,
                json!({
                    "id": "3", "channel": "/meta/connect", "clientId": "fixture-tool", "connectionType": "websocket", "advice": {"timeout": 0}
                })
            );
            fixture_send(
                &mut socket,
                json!([
                    {"channel": "/meta/subscribe", "successful": true},
                    {"channel": "/meta/connect", "successful": true},
                    {"channel": "/im/123", "data": {"type": "groupchat", "info": {"gid":101}}},
                    {"channel": "/im/123", "data": {"type": "groupchat", "info": {"gid":"101"}}},
                    {"channel": "/im/123", "data": {"type": "groupchat", "info": {"gid":202}}},
                    {"channel": "/im/500", "data": {"type": "groupchat", "info": {"gid":101}}}
                ]),
            )
            .await;
            assert_eq!(
                next_frame(&mut socket).await,
                json!({
                    "id": "4", "channel": "/meta/connect", "clientId": "fixture-tool", "connectionType": "websocket"
                })
            );
            while socket.next().await.is_some_and(|message| message.is_ok()) {}
        });
        let captures = Arc::new(CaptureQueue::default());
        let active_state = state.clone();
        let active_captures = captures.clone();
        let active_socket = tokio::spawn(async move {
            let url = Url::parse(&format!("ws://{address}/im")).unwrap();
            let mut socket = open_socket(url, cookie).await.unwrap();
            let result = receive(
                &active_state,
                &mut socket,
                &active_captures,
                123,
                cookie,
                &mut 0,
            )
            .await;
            let _ = socket.close(None).await;
            result.unwrap();
        });

        assert_eq!(
            timeout(Duration::from_secs(3), captures.next())
                .await
                .unwrap(),
            101
        );
        assert!(
            timeout(Duration::from_millis(100), captures.next())
                .await
                .is_err()
        );
        state
            .credential
            .set(Some("SUB=new-test".to_owned()))
            .unwrap();
        timeout(Duration::from_secs(3), active_socket)
            .await
            .unwrap()
            .unwrap();
        timeout(Duration::from_secs(3), fixture)
            .await
            .unwrap()
            .unwrap();
    }

    async fn next_frame(socket: &mut WebSocketStream<TcpStream>) -> Value {
        let message = socket.next().await.unwrap().unwrap();
        let frames: Vec<Value> = serde_json::from_str(message.to_text().unwrap()).unwrap();
        assert_eq!(frames.len(), 1);
        frames.into_iter().next().unwrap()
    }

    async fn fixture_send(socket: &mut WebSocketStream<TcpStream>, frames: Value) {
        socket
            .send(Message::Text(frames.to_string().into()))
            .await
            .unwrap();
    }
}
