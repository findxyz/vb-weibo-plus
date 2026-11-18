use std::{
    env,
    ffi::OsString,
    fs,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Arc,
    time::Duration,
};

use axum::{
    Extension, Json, Router,
    extract::State,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tempfile::TempDir;
use tokio::{
    net::TcpStream,
    sync::Mutex,
    time::{sleep, timeout},
};
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async, tungstenite::Message};

use crate::{
    AppState,
    weibo::{self, WeiboError},
};

const CHAT_URL: &str = "https://api.weibo.com/chat";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);
const COMMAND_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone, Default)]
struct LoginSession {
    active: Arc<Mutex<Option<Browser>>>,
    in_progress: Arc<Mutex<()>>,
}

pub fn routes() -> Router<AppState> {
    login_routes(LoginSession::default())
}

fn login_routes(session: LoginSession) -> Router<AppState> {
    Router::new()
        .route("/weibo/login/qr", post(qr))
        .route("/weibo/login/qr/image", get(qr_image))
        .route("/weibo/login/status", get(status))
        .layer(Extension(session))
}

async fn status(State(state): State<AppState>) -> Json<Value> {
    Json(json!({"valid": weibo::group_list(&state).await.is_ok()}))
}

#[derive(Serialize)]
struct LoginResponse {
    sub: String,
    subp: String,
    #[serde(rename = "SSOLoginState")]
    sso_login_state: String,
    #[serde(rename = "ALF")]
    alf: String,
}

async fn qr(
    State(state): State<AppState>,
    Extension(session): Extension<LoginSession>,
) -> Result<Json<LoginResponse>, WeiboError> {
    tokio::spawn(async move { session.login(&state).await })
        .await
        .map_err(|_| WeiboError::internal("扫码登录失败。"))?
        .map(Json)
}

async fn qr_image(Extension(session): Extension<LoginSession>) -> Response {
    let image = timeout(Duration::from_secs(2), session.capture_qr()).await;
    match image {
        Ok(Ok(Some(bytes))) => ([(header::CONTENT_TYPE, "image/png")], bytes).into_response(),
        _ => StatusCode::NO_CONTENT.into_response(),
    }
}

impl LoginSession {
    async fn login(&self, state: &AppState) -> Result<LoginResponse, WeiboError> {
        let _session = self
            .in_progress
            .try_lock()
            .map_err(|_| WeiboError::new(StatusCode::CONFLICT, "扫码登录正在进行。"))?;
        let url = weibo::upstream_url(state, CHAT_URL)?;
        let mut browser = Browser::launch(state).await?;
        browser.navigate(url.as_str()).await?;
        *self.active.lock().await = Some(browser);
        let response = timeout(state.config.qr_timeout, self.poll_login()).await;
        self.active.lock().await.take();
        let response = response.map_err(|_| WeiboError::internal("扫码登录超时"))??;
        let credential = format!(
            "SUBP={}; ALF={}; SSOLoginState={}; SUB={}",
            response.subp, response.alf, response.sso_login_state, response.sub
        );
        let holder = state.credential.clone();
        let written = tokio::task::spawn_blocking(move || holder.set(Some(credential))).await;
        if !matches!(written, Ok(Ok(()))) {
            eprintln!("写入登录凭据失败，仍在本次会话中使用。");
        }
        weibo::sync_groups(state).await?;
        Ok(response)
    }

    async fn poll_login(&self) -> Result<LoginResponse, WeiboError> {
        loop {
            sleep(Duration::from_millis(500)).await;
            let mut active = self.active.lock().await;
            let browser = active
                .as_mut()
                .ok_or_else(|| WeiboError::internal("扫码登录会话已关闭。"))?;
            let cookies = browser.cookies().await?;
            let mut values = LoginCookies::default();
            for cookie in cookies {
                if cookie.domain != ".weibo.com" {
                    continue;
                }
                match cookie.name.as_str() {
                    "SUB" => values.sub = Some(cookie.value),
                    "SUBP" => values.subp = Some(cookie.value),
                    "SSOLoginState" => values.sso_login_state = Some(cookie.value),
                    "ALF" => values.alf = Some(cookie.value),
                    _ => {}
                }
            }
            if let Some(response) = values.confirm()? {
                return Ok(response);
            }
        }
    }

    async fn capture_qr(&self) -> Result<Option<Vec<u8>>, WeiboError> {
        loop {
            {
                let mut active = self.active.lock().await;
                let Some(browser) = active.as_mut() else {
                    return Ok(None);
                };
                if browser.cookies().await?.iter().any(|cookie| {
                    cookie.domain == ".weibo.com"
                        && cookie.name == "SUB"
                        && !cookie.value.is_empty()
                }) {
                    return Ok(None);
                }
                if let Some(image) = browser.first_image_png().await? {
                    return Ok(Some(image));
                }
            }
            sleep(Duration::from_millis(100)).await;
        }
    }
}

#[derive(Default)]
struct LoginCookies {
    sub: Option<String>,
    subp: Option<String>,
    sso_login_state: Option<String>,
    alf: Option<String>,
}

impl LoginCookies {
    fn confirm(self) -> Result<Option<LoginResponse>, WeiboError> {
        let Some(sub) = self.sub.filter(|value| !value.is_empty()) else {
            return Ok(None);
        };
        let required = |part: Option<String>, name: &str| {
            part.ok_or_else(|| WeiboError::internal(format!("扫码登录不完整，缺少 {name}")))
        };
        let subp = required(self.subp, "SUBP")?;
        let alf = required(self.alf, "ALF")?;
        let sso_login_state = required(self.sso_login_state, "SSOLoginState")?;
        Ok(Some(LoginResponse {
            sub,
            subp,
            alf,
            sso_login_state,
        }))
    }
}

#[derive(Deserialize)]
struct BrowserCookie {
    domain: String,
    name: String,
    value: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Target {
    #[serde(rename = "type")]
    kind: String,
    web_socket_debugger_url: Option<String>,
}

struct Browser {
    socket: WebSocketStream<MaybeTlsStream<TcpStream>>,
    next_id: u64,
    _process: BrowserProcess,
}

struct BrowserProcess {
    child: Child,
    profile: TempDir,
}

impl Drop for BrowserProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Browser {
    async fn launch(state: &AppState) -> Result<Self, WeiboError> {
        let executable = chromium_executable().ok_or_else(|| {
            WeiboError::internal(
                "未找到 Chromium 浏览器，请安装 Chrome 或 Edge，或设置 WEIBO_CHROMIUM_PATH。",
            )
        })?;
        let profile = tempfile::tempdir().map_err(browser_error)?;
        let mut profile_arg = OsString::from("--user-data-dir=");
        profile_arg.push(profile.path());
        let child = Command::new(executable)
            .args([
                "--headless=new",
                "--remote-debugging-port=0",
                "--remote-debugging-address=127.0.0.1",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-background-networking",
                "--disable-extensions",
                "--hide-scrollbars",
            ])
            .arg(profile_arg)
            .arg("about:blank")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(browser_error)?;
        let mut process = BrowserProcess { child, profile };
        let endpoint = timeout(STARTUP_TIMEOUT, process.discover_page(state))
            .await
            .map_err(|_| WeiboError::internal("等待扫码浏览器启动超时。"))??;
        let (socket, _) = timeout(COMMAND_TIMEOUT, connect_async(endpoint))
            .await
            .map_err(browser_error)?
            .map_err(browser_error)?;
        Ok(Self {
            socket,
            next_id: 0,
            _process: process,
        })
    }

    async fn navigate(&mut self, url: &str) -> Result<(), WeiboError> {
        let result = self.call("Page.navigate", json!({"url":url})).await?;
        if let Some(message) = result.get("errorText").and_then(Value::as_str) {
            return Err(browser_error(message));
        }
        Ok(())
    }

    async fn cookies(&mut self) -> Result<Vec<BrowserCookie>, WeiboError> {
        let value = self.call("Network.getAllCookies", json!({})).await?;
        serde_json::from_value(value.get("cookies").cloned().unwrap_or_default())
            .map_err(browser_error)
    }

    async fn first_image_png(&mut self) -> Result<Option<Vec<u8>>, WeiboError> {
        let result = self.call("Runtime.evaluate", json!({
            "expression": "(() => { const image = document.querySelector('img'); if (!image || !image.complete || !image.naturalWidth) return null; const style = getComputedStyle(image); if (style.visibility === 'hidden' || style.visibility === 'collapse') return null; const box = image.getBoundingClientRect(); if (box.width <= 0 || box.height <= 0) return null; return {x: box.left + scrollX, y: box.top + scrollY, width: box.width, height: box.height, scale: 1}; })()",
            "returnByValue": true,
        })).await?;
        let Some(clip) = result
            .pointer("/result/value")
            .filter(|value| value.is_object())
        else {
            return Ok(None);
        };
        let result = self
            .call(
                "Page.captureScreenshot",
                json!({
                    "format": "png", "clip": clip, "captureBeyondViewport": true,
                }),
            )
            .await?;
        result
            .get("data")
            .and_then(Value::as_str)
            .map(|encoded| STANDARD.decode(encoded).map_err(browser_error))
            .transpose()
    }

    async fn call(&mut self, method: &str, params: Value) -> Result<Value, WeiboError> {
        self.next_id += 1;
        let id = self.next_id;
        timeout(COMMAND_TIMEOUT, async {
            let command = json!({"id": id, "method": method, "params": params});
            self.socket
                .send(Message::Text(command.to_string().into()))
                .await
                .map_err(browser_error)?;
            while let Some(message) = self.socket.next().await {
                let Message::Text(data) = message.map_err(browser_error)? else {
                    continue;
                };
                let value: Value = serde_json::from_str(data.as_str()).map_err(browser_error)?;
                if value.get("id").and_then(Value::as_u64) != Some(id) {
                    continue;
                }
                if let Some(error) = value.pointer("/error/message").and_then(Value::as_str) {
                    return Err(browser_error(error));
                }
                return Ok(value.get("result").cloned().unwrap_or_default());
            }
            Err(WeiboError::internal("扫码浏览器已断开。"))
        })
        .await
        .map_err(browser_error)?
    }
}

impl BrowserProcess {
    async fn discover_page(&mut self, state: &AppState) -> Result<String, WeiboError> {
        let port_file = self.profile.path().join("DevToolsActivePort");
        loop {
            if self.child.try_wait().map_err(browser_error)?.is_some() {
                return Err(WeiboError::internal("扫码浏览器启动失败。"));
            }
            if let Ok(contents) = fs::read_to_string(&port_file)
                && let Some(port) = contents
                    .lines()
                    .next()
                    .and_then(|value| value.parse::<u16>().ok())
            {
                let url = format!("http://127.0.0.1:{port}/json/list");
                if let Ok(response) = state.http.get(url).send().await
                    && let Ok(targets) = response.json::<Vec<Target>>().await
                    && let Some(endpoint) = targets
                        .into_iter()
                        .filter(|target| target.kind == "page")
                        .filter_map(|target| target.web_socket_debugger_url)
                        .find(|endpoint| {
                            endpoint.starts_with(&format!("ws://127.0.0.1:{port}/devtools/page/"))
                        })
                {
                    return Ok(endpoint);
                }
            }
            sleep(Duration::from_millis(100)).await;
        }
    }
}

fn browser_error(error: impl std::fmt::Display) -> WeiboError {
    WeiboError::internal(format!("扫码浏览器操作失败：{error}"))
}

fn chromium_executable() -> Option<PathBuf> {
    if let Some(explicit) = env::var_os("WEIBO_CHROMIUM_PATH") {
        let executable = PathBuf::from(explicit);
        return executable.is_file().then_some(executable);
    }
    let mut candidates = Vec::new();
    for variable in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Some(directory) = env::var_os(variable) {
            let root = PathBuf::from(directory);
            candidates.extend([
                root.join("Google/Chrome/Application/chrome.exe"),
                root.join("Microsoft/Edge/Application/msedge.exe"),
                root.join("Chromium/Application/chrome.exe"),
            ]);
        }
    }
    if let Some(path) = env::var_os("PATH") {
        for directory in env::split_paths(&path) {
            candidates.extend(
                [
                    "chrome.exe",
                    "msedge.exe",
                    "chromium",
                    "chromium-browser",
                    "google-chrome",
                    "microsoft-edge",
                ]
                .map(|name| directory.join(name)),
            );
        }
    }
    candidates.into_iter().find(|candidate| candidate.is_file())
}

#[cfg(test)]
mod tests {
    use axum::{
        body::{Body, to_bytes},
        http::Request,
        response::Html,
    };
    use tokio::net::TcpListener;
    use tower::ServiceExt;

    use super::*;
    use crate::Config;

    #[tokio::test]
    #[ignore = "requires a locally installed Chromium browser"]
    async fn qr_serves_png_and_persists_credential_after_browser_login() {
        let upstream = Router::new()
            .route("/chat", get(|| async {
                Html("<img width='64' height='64' src='data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2264%22%20height=%2264%22%3E%3Crect%20width=%2264%22%20height=%2264%22/%3E%3C/svg%3E'>")
            }))
            .route("/webim/2/direct_messages/contacts.json", get(|| async {
                Json(json!({"totalNumber": 1, "contacts": [{"user":{"id": "456", "type": 2, "name": "测试群"}}]}))
            }));
        let upstream_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let upstream_address = upstream_listener.local_addr().unwrap();
        let upstream_task =
            tokio::spawn(async move { axum::serve(upstream_listener, upstream).await.unwrap() });
        let root = tempfile::tempdir().unwrap();
        let cookie_file = root.path().join("test-weibo-cookie.txt");
        let state = AppState::new(Config {
            database_path: root.path().join("test-weibo.db"),
            cookie_file: cookie_file.clone(),
            weibo_origin: Some(format!("http://{upstream_address}")),
            qr_timeout: Duration::from_secs(15),
            ..Config::default()
        })
        .await
        .unwrap();
        let session = LoginSession::default();
        let router = login_routes(session.clone()).with_state(state);
        let qr = tokio::spawn(
            router.clone().oneshot(
                Request::post("/weibo/login/qr")
                    .body(Body::empty())
                    .unwrap(),
            ),
        );
        let image = timeout(Duration::from_secs(18), async {
            loop {
                assert!(!qr.is_finished());
                let response = router
                    .clone()
                    .oneshot(
                        Request::get("/weibo/login/qr/image")
                            .body(Body::empty())
                            .unwrap(),
                    )
                    .await
                    .unwrap();
                if response.status() == StatusCode::OK {
                    break response;
                }
                assert_eq!(response.status(), StatusCode::NO_CONTENT);
                sleep(Duration::from_millis(100)).await;
            }
        })
        .await
        .unwrap();
        assert_eq!(image.headers()[header::CONTENT_TYPE], "image/png");
        let png = to_bytes(image.into_body(), 100_000).await.unwrap();
        assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
        let cookies = ["SUB", "SUBP", "SSOLoginState", "ALF"].map(|name| {
            json!({
                "name": name,
                "value": format!("test-{name}"),
                "url": "https://weibo.com/",
                "domain": ".weibo.com",
            })
        });
        session
            .active
            .lock()
            .await
            .as_mut()
            .unwrap()
            .call("Network.setCookies", json!({"cookies": cookies}))
            .await
            .unwrap();
        let response = qr.await.unwrap().unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let payload: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 1024).await.unwrap()).unwrap();
        assert_eq!(
            payload,
            json!({"sub": "test-SUB", "subp": "test-SUBP", "SSOLoginState": "test-SSOLoginState", "ALF": "test-ALF"})
        );
        assert_eq!(
            fs::read_to_string(cookie_file).unwrap(),
            "SUBP=test-SUBP; ALF=test-ALF; SSOLoginState=test-SSOLoginState; SUB=test-SUB"
        );
        upstream_task.abort();
    }
}
