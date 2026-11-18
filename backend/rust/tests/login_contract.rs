use std::sync::{Arc, Mutex};

use axum::{
    Router,
    body::{Body, to_bytes},
    extract::{OriginalUri, State},
    http::{HeaderMap, Request, StatusCode},
    routing::{get, post},
};
use serde_json::{Value, json};
use tempfile::TempDir;
use tokio::net::TcpListener;
use tower::ServiceExt;
use weibo_plus::weibo::{HeaderProfile, Retry, request};
use weibo_plus::{AppState, Config, app};

#[derive(Default)]
struct ContactsFixture {
    requests: Mutex<Vec<(HeaderMap, String)>>,
    expired: Mutex<bool>,
}

async fn launch_fixture() -> (String, Arc<ContactsFixture>, tokio::task::JoinHandle<()>) {
    let fixture = Arc::new(ContactsFixture::default());
    let upstream = Router::new()
        .route("/webim/2/direct_messages/contacts.json", get(contacts))
        .with_state(fixture.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    (format!("http://{address}"), fixture, task)
}

async fn contacts(
    State(fixture): State<Arc<ContactsFixture>>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
) -> axum::Json<Value> {
    fixture
        .requests
        .lock()
        .unwrap()
        .push((headers, uri.to_string()));
    let expired = *fixture.expired.lock().unwrap();
    axum::Json(if expired {
        json!({"error_code": 21301, "error": "relogin!"})
    } else {
        json!({"totalNumber": 0, "contacts": []})
    })
}

async fn test_state(root: &TempDir, weibo_origin: String) -> AppState {
    AppState::new(Config {
        database_path: root.path().join("test-weibo.db"),
        cookie_file: root.path().join("test-weibo-cookie.txt"),
        weibo_origin: Some(weibo_origin),
        auto_sync_gids: Vec::new(),
        ..Config::default()
    })
    .await
    .unwrap()
}

async fn status(router: &Router) -> Value {
    let response = router
        .clone()
        .oneshot(
            Request::get("/weibo/login/status")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    serde_json::from_slice(&to_bytes(response.into_body(), 1024).await.unwrap()).unwrap()
}

#[tokio::test]
async fn status_checks_contacts_using_saved_credential() {
    let root = tempfile::tempdir().unwrap();
    let credential = "SUBP=test-subp; ALF=test-alf; SSOLoginState=test-sso; SUB=test-sub";
    std::fs::write(root.path().join("test-weibo-cookie.txt"), credential).unwrap();
    let (upstream, fixture, task) = launch_fixture().await;
    let router = app(test_state(&root, upstream).await);

    assert_eq!(status(&router).await, json!({"valid": true}));
    *fixture.expired.lock().unwrap() = true;
    assert_eq!(status(&router).await, json!({"valid": false}));
    let requests = fixture.requests.lock().unwrap();
    assert_eq!(requests.len(), 2);
    let (headers, uri) = &requests[0];
    assert_eq!(headers["cookie"], credential);
    assert_eq!(headers["referer"], "https://weibo.com/");
    assert!(uri.contains("source=209678993"));
    assert!(uri.contains("add_virtual_user=3,4"));
    task.abort();
}

#[tokio::test]
async fn qr_image_returns_no_content_before_login() {
    let root = tempfile::tempdir().unwrap();
    let router = app(test_state(&root, "http://127.0.0.1:1".to_owned()).await);
    let response = router
        .oneshot(
            Request::get("/weibo/login/qr/image")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert!(
        to_bytes(response.into_body(), 1024)
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn write_requests_surface_rate_limit_without_replaying_the_write() {
    let requests = Arc::new(Mutex::new(Vec::new()));
    let upstream = Router::new().route(
        "/ajax/statuses/setLike",
        post({
            let requests = requests.clone();
            move |headers: HeaderMap, body: String| {
                let requests = requests.clone();
                async move {
                    requests.lock().unwrap().push((headers, body));
                    StatusCode::TOO_MANY_REQUESTS
                }
            }
        }),
    );
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let root = tempfile::tempdir().unwrap();
    let state = test_state(&root, format!("http://{address}")).await;
    state
        .credential
        .set(Some("SUB=test-sub".to_owned()))
        .unwrap();
    let error = request(
        &state,
        reqwest::Method::POST,
        "https://weibo.com/ajax/statuses/setLike",
        HeaderProfile::Ajax,
        true,
        Retry::Once,
        |builder| builder.form(&[("id", "123")]),
    )
    .await
    .unwrap_err();
    assert_eq!(error.status, StatusCode::TOO_MANY_REQUESTS);
    let requests = requests.lock().unwrap();
    assert_eq!(requests.len(), 1);
    let (headers, body) = &requests[0];
    assert_eq!(headers["cookie"], "SUB=test-sub");
    assert_eq!(headers["x-requested-with"], "XMLHttpRequest");
    assert_eq!(body, "id=123");
    task.abort();
}
