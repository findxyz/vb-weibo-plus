use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::response::Response;
use axum::{
    Json, Router,
    extract::State,
    http::HeaderMap,
    routing::{get, post},
};
use serde_json::{Value, json};
use tower::ServiceExt;
use weibo_plus::{AppState, Config, app};

async fn json_response(router: axum::Router, uri: &str) -> (StatusCode, Value) {
    let request = Request::builder().uri(uri).body(Body::empty()).unwrap();
    let response: Response = router.oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024)
        .await
        .unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}

#[tokio::test]
async fn java_captured_posts_keep_media_shape_pagination_and_calendar() {
    let temp = tempfile::tempdir().unwrap();
    let config = Config {
        database_path: temp.path().join("java.db"),
        cookie_file: temp.path().join(".weibo_cookie.txt"),
        ..Config::default()
    };
    let state = AppState::new(config).await.unwrap();
    state.db.run(|db| {
        db.execute_batch(
            r#"INSERT INTO bloggers(uid, screen_name, verified) VALUES (7, '示例', 1);
               INSERT INTO posts(mblogid, post_id, uid, content, pics_json, retweeted_json, created_at, saved_at)
                   VALUES ('older', 9007199254740993, 7, 'discount 10%', '[{"pid":"p1","thumbnail":{"w":50,"h":25,"url":"https://a.sinaimg.cn/x"},"original":{"w":100,"h":50,"url":"https://a.sinaimg.cn/o"}}]', '', 1786896000000, 1);
               INSERT INTO posts(mblogid, post_id, uid, content, retweeted_json, created_at, saved_at)
                   VALUES ('newer', 9007199254740994, 7, '', '{"content":"coupon 10%","mblogid":"quoted","uid":22}', 1786896000000, 2);"#,
        )
    }).await.unwrap();
    let router = app(state);

    let (status, response) = json_response(
        router.clone(),
        "/post/list?uids=7&uids=8&keyword=%25&size=1&page=2",
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(response["total"], 2);
    assert_eq!(response["items"][0]["postId"], 9_007_199_254_740_993_i64);
    assert_eq!(response["items"][0]["blogger"]["screenName"], "示例");
    assert_eq!(
        response["items"][0]["pics"][0]["originalUrl"],
        "/post/image?mblogId=older&pid=p1&variant=original"
    );
    assert_eq!(response["items"][0]["pics"][0]["thumbnailWidth"], 50);

    let (_, calendar) = json_response(router.clone(), "/post/calendar?uid=7").await;
    assert_eq!(calendar["months"][0]["count"], 2);
    assert_eq!(calendar["months"][0]["days"][0]["count"], 2);
    assert_eq!(calendar["months"][0]["days"][0]["date"], "2026-08-17");

    let (status, invalid) = json_response(router, "/post/list?uids=7,8").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(
        invalid,
        json!({"code":400,"msg":"uids 必须使用重复查询参数传递。"})
    );
}

#[tokio::test]
async fn captured_long_text_and_like_use_java_requests_without_replaying_writes() {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    let like_writes = Arc::new(AtomicUsize::new(0));
    let upstream = Router::new()
        .route("/ajax/statuses/mymblog", get(|| async { Json(json!({"ok":1,"data":{"list":[{
            "id": 512, "mblogid":"long", "user":{"id":6, "screen_name":"示例"},
            "created_at":"Mon Aug 17 00:00:00 +0800 2026", "text":"简短", "isLongText":true
        }]}})) }))
        .route("/ajax/statuses/longtext", get(|| async { Json(json!({"ok":1,"data":{
            "longTextContent":"<p>完整内容</p>", "longTextContent_raw":"完整内容",
        }})) }))
        .route("/ajax/statuses/show", get(|| async { Json(json!({
            "ok":1,"idstr":"512","attitudes_status":1,"attitudes_count":2,
        })) }))
        .route("/", get(|| async { ([("set-cookie","XSRF-TOKEN=token%2Bvalue; Path=/")], "home") }))
        .route("/ajax/statuses/setLike", post(
            |State(writes): State<Arc<AtomicUsize>>, headers: HeaderMap, body: String| async move {
                assert_eq!(body, "id=512");
                assert_eq!(headers["x-xsrf-token"], "token+value");
                assert_eq!(headers["cookie"], "SUB=fixture; XSRF-TOKEN=token%2Bvalue");
                writes.fetch_add(1, Ordering::SeqCst);
                Json(json!({"ok":1}))
            },
        ))
        .with_state(like_writes.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let temp = tempfile::tempdir().unwrap();
    let state = AppState::new(Config {
        database_path: temp.path().join("java.db"),
        cookie_file: temp.path().join(".weibo_cookie.txt"),
        weibo_origin: Some(origin),
        ..Config::default()
    })
    .await
    .unwrap();
    state.credential.set(Some("SUB=fixture".into())).unwrap();
    let app = app(state);
    let post_form = |uri: &str, form: &'static str| {
        Request::post(uri)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(Body::from(form))
            .unwrap()
    };
    let created = app
        .clone()
        .oneshot(post_form("/post/bloggers", "uid=6"))
        .await
        .unwrap();
    assert_eq!(created.status(), StatusCode::OK);
    let (_, list) = json_response(app.clone(), "/post/list?uids=6").await;
    assert_eq!(list["items"][0]["content"], "<p>完整内容</p>");
    assert_eq!(list["items"][0]["contentRaw"], "完整内容");
    let read = app
        .clone()
        .oneshot(
            Request::get("/post/like?mblogId=long")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(read.status(), StatusCode::OK);
    assert_eq!(read.headers()["cache-control"], "no-store");
    let write = app
        .oneshot(post_form("/post/like", "mblogId=long&liked=true"))
        .await
        .unwrap();
    assert_eq!(write.status(), StatusCode::NO_CONTENT);
    assert_eq!(like_writes.load(Ordering::SeqCst), 1);
    server.abort();
}
