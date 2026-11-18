use axum::body::{Body, to_bytes};
use axum::http::{HeaderMap, Request, StatusCode, header};
use axum::response::Response;
use axum::routing::post;
use axum::{Json, Router};
use serde_json::{Value, json};
use std::time::Duration;
use tempfile::TempDir;
use tower::ServiceExt;
use weibo_plus::{AppState, Config, app};

const DAY_START: i64 = 1_786_032_000_000;

async fn fixture(upstream: Router) -> (TempDir, Router) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let directory = tempfile::tempdir().unwrap();
    let config = Config {
        database_path: directory.path().join("weibo.db"),
        cookie_file: directory.path().join(".weibo_cookie.txt"),
        frontend_dir: directory.path().join("frontend"),
        auto_sync_gids: Vec::new(),
        ai_base_url: format!("http://{address}/"),
        ai_api_key: "test-analysis-key".into(),
        ai_model: "test-analysis-model".into(),
        ai_timeout: Duration::from_secs(3),
        ..Config::default()
    };
    let state = AppState::new(config.clone()).await.unwrap();
    let db = rusqlite::Connection::open(config.database_path).unwrap();
    for (mid, gid, time, sender, text, kind) in [
        (1, 1, DAY_START - 1, Some("Excluded"), Some("before"), None),
        (2, 1, DAY_START, Some("Alice"), Some("at start"), None),
        (3, 1, DAY_START + 86_399_999, None, None, Some("Image")),
        (
            4,
            1,
            DAY_START + 86_399_999,
            Some("Bob"),
            Some("last"),
            None,
        ),
        (5, 1, DAY_START + 86_400_000, None, Some("tomorrow"), None),
        (6, 2, DAY_START, None, Some("other group"), None),
    ] {
        db.execute(
            "INSERT INTO messages (mid, gid, created_at, saved_at, sender_name, text,
                 msg_type_name) VALUES (?1, ?2, ?3, 0, ?4, ?5, COALESCE(?6, ''))",
            rusqlite::params![mid, gid, time, sender, text, kind],
        )
        .unwrap();
    }
    (directory, app(state))
}

async fn response(router: &Router, request: Request<Body>) -> Response {
    router.clone().oneshot(request).await.unwrap()
}

async fn json_response(response: Response) -> Value {
    serde_json::from_slice(&to_bytes(response.into_body(), 65536).await.unwrap()).unwrap()
}

async fn get(router: &Router, path: &str) -> Response {
    response(router, Request::get(path).body(Body::empty()).unwrap()).await
}

async fn submit(router: &Router, path: &str, form: &'static str) -> Response {
    response(
        router,
        Request::post(path)
            .header(
                header::CONTENT_TYPE,
                "application/x-www-form-urlencoded;charset=UTF-8",
            )
            .body(Body::from(form))
            .unwrap(),
    )
    .await
}

#[tokio::test]
async fn analysis_uses_shanghai_day_and_persists_result() {
    let upstream = Router::new().route(
        "/v1/chat/completions",
        post(async |headers: HeaderMap, Json(request): Json<Value>| {
            assert_eq!(headers["authorization"], "Bearer test-analysis-key");
            assert_eq!(
                request,
                json!({
                    "stream": false,
                    "model": "test-analysis-model",
                    "messages": [
                        {"role": "system", "content": "请用中文回复分析结果。"},
                        {"role": "user", "content": "Take notes\n\n以下是群聊消息：\n\n[23:59] Bob: last\n[23:59] 未知: [Image]\n[00:00] Alice: at start\n"}
                    ]
                })
            );
            Json(json!({"choices":[{"message": {"content": "## Result"}}]}))
        }),
    );
    let (_directory, router) = fixture(upstream).await;

    let created = submit(
        &router,
        "/chat/analyses?gid=1",
        "date=2026-08-07&prompt=Take+notes",
    )
    .await;
    assert_eq!(created.status(), StatusCode::OK);
    let created = json_response(created).await;
    assert_eq!(created["messageCount"], 3);
    assert_eq!(created["date"], "2026-08-07");
    assert_eq!(created["gid"], 1);
    assert_eq!(created["prompt"], "Take notes");
    assert_eq!(created["result"], "## Result");

    let detail = get(&router, &format!("/chat/analyses/{}", created["id"])).await;
    assert_eq!(detail.status(), StatusCode::OK);
    assert_eq!(json_response(detail).await, created);

    let list = json_response(get(&router, "/chat/analyses?gid=1").await).await;
    assert_eq!(
        list,
        json!({"page": 1, "size": 20, "total": 1, "items": [{
            "id": created["id"], "messageCount": 3, "date": "2026-08-07",
            "promptPreview": "Take notes", "createdAt": created["createdAt"]
        }]})
    );
}

#[tokio::test]
async fn analysis_stream_emits_deltas_before_completion_and_persists_joined_result() {
    use futures_util::{StreamExt, stream};
    use std::convert::Infallible;
    use std::sync::Arc;
    use tokio::sync::Notify;

    let proceed = Arc::new(Notify::new());
    let upstream = Router::new().route(
        "/v1/chat/completions",
        post({
            let proceed = proceed.clone();
            move |Json(request): Json<Value>| {
                let proceed = proceed.clone();
                async move {
                    assert_eq!(request["stream"], true);
                    let first = "data: {\"choices\":[{\"delta\":{\"content\":\"第一\"}}]}\r\n\r\n";
                    let split = first.find('第').unwrap() + 1;
                    let body = Body::from_stream(stream::unfold(
                        (0, proceed),
                        move |(step, proceed)| async move {
                            let chunk = match step {
                                0 => first.as_bytes()[..split].to_vec(),
                                1 => first.as_bytes()[split..].to_vec(),
                                2 => {
                                    proceed.notified().await;
                                    ("data: {\"choices\":[{\"delta\":{\"content\":\"段\"}}]}\n\n"
                                        .to_owned()
                                        + "data: [DONE]\n\n"
                                        + "data: {\"choices\":[{\"delta\":{\"content\":\"ignored\"}}]}\n")
                                        .into_bytes()
                                }
                                _ => return None,
                            };
                            Some((Ok::<_, Infallible>(chunk), (step + 1, proceed)))
                        },
                    ));
                    ([(header::CONTENT_TYPE, "text/event-stream")], body)
                }
            }
        }),
    );
    let (_directory, router) = fixture(upstream).await;
    let result = submit(
        &router,
        "/chat/analyses/stream",
        "gid=1&date=2026-08-07&prompt=Stream",
    )
    .await;
    assert_eq!(result.status(), StatusCode::OK);
    assert_eq!(result.headers()[header::CONTENT_TYPE], "text/event-stream");

    let mut chunks = result.into_body().into_data_stream();
    let first = tokio::time::timeout(Duration::from_secs(2), chunks.next())
        .await
        .expect("expected a delta while the upstream completion is still pending")
        .unwrap()
        .unwrap();
    let mut events = String::from_utf8(first.to_vec()).unwrap();
    assert!(events.contains("event: delta\ndata: 第一\n\n"));
    proceed.notify_one();
    while let Some(chunk) = chunks.next().await {
        events.push_str(std::str::from_utf8(&chunk.unwrap()).unwrap());
    }
    assert!(events.contains("event: delta\ndata: 段\n\n"));
    assert!(!events.contains("ignored"));
    let done = events.split_once("event: done\ndata: ").unwrap().1;
    let done: Value = serde_json::from_str(done.trim()).unwrap();
    assert_eq!(done["result"], "第一段");
    let detail = get(&router, &format!("/chat/analyses/{}", done["id"])).await;
    assert_eq!(json_response(detail).await, done);
}

#[tokio::test]
async fn analysis_returns_errors_and_never_persists_partial_results() {
    let upstream = Router::new().route(
        "/v1/chat/completions",
        post(async |Json(request): Json<Value>| {
            if request["stream"] == false {
                return (StatusCode::TOO_MANY_REQUESTS, Body::from("rate limited"));
            }
            (
                StatusCode::OK,
                Body::from(
                    "data: {\"choices\":[{\"delta\":{\"content\":\"snippet\"}}]}\n\n\
                     data: invalid JSON\n\n",
                ),
            )
        }),
    );
    let (_directory, router) = fixture(upstream).await;
    let missing = submit(&router, "/chat/analyses", "gid=1&prompt=missing-date").await;
    assert_eq!(missing.status(), StatusCode::BAD_REQUEST);
    let empty = submit(
        &router,
        "/chat/analyses?gid=1&date=2026-08-09&prompt=empty-day",
        "",
    )
    .await;
    assert_eq!(empty.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        json_response(empty).await,
        json!({"code": 400, "msg": "该日期无本地消息，请先同步。"})
    );

    let failed = submit(
        &router,
        "/chat/analyses",
        "gid=1&date=2026-08-07&prompt=test",
    )
    .await;
    assert_eq!(failed.status(), StatusCode::INTERNAL_SERVER_ERROR);
    let error = json_response(failed).await;
    assert_eq!(error["code"], 500);
    assert!(error["msg"].as_str().unwrap().contains("rate limited"));

    let failure_stream = submit(
        &router,
        "/chat/analyses/stream?gid=1&date=2026-08-07&prompt=test",
        "",
    )
    .await;
    assert_eq!(failure_stream.status(), StatusCode::OK);
    let body = to_bytes(failure_stream.into_body(), 65536).await.unwrap();
    let body = std::str::from_utf8(&body).unwrap();
    assert!(body.contains("event: delta\ndata: snippet\n\n"));
    assert!(body.contains("event: error\ndata: 调用 AI 失败："));
    assert!(!body.contains("event: done"));

    let list = json_response(get(&router, "/chat/analyses?gid=1").await).await;
    assert_eq!(
        list,
        json!({"page": 1, "size": 20, "total": 0, "items": []})
    );
}
