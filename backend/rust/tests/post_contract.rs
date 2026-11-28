use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::response::Response;
use axum::{
    Json, Router,
    extract::{Query, State},
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

#[tokio::test]
async fn history_range_reports_progress_conflict_partial_failure_and_zero_success() {
    use std::{collections::HashMap, sync::Arc, time::Duration};
    use tokio::sync::Notify;

    let started = Arc::new(Notify::new());
    let release = Arc::new(Notify::new());
    let upstream = Router::new().route(
        "/ajax/statuses/searchProfile",
        get({
            let (started, release) = (started.clone(), release.clone());
            move |Query(query): Query<HashMap<String, String>>| {
                let (started, release) = (started.clone(), release.clone());
                async move {
                    if query["uid"] == "7" && query["starttime"] == "1783612800" {
                        if query["page"] == "1" {
                            started.notify_one();
                            release.notified().await;
                            return Json(json!({"ok":1,"data":{"list":[{
                                "id":512,"mblogid":"captured","user":{"id":7,"screen_name":"示例"},
                                "created_at":"Fri Jul 10 08:00:00 +0800 2026","text":"已保存"
                            }]}}));
                        }
                    } else if query["uid"] == "7" {
                        return Json(json!({"ok":0,"msg":"模拟失败"}));
                    }
                    Json(json!({"ok":1,"data":{"list":[]}}))
                }
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let temp = tempfile::tempdir().unwrap();
    let config = Config {
        database_path: temp.path().join("history.db"),
        cookie_file: temp.path().join("cookie.txt"),
        weibo_origin: Some(origin),
        ..Config::default()
    };
    let state = AppState::new(config.clone()).await.unwrap();
    state.credential.set(Some("SUB=fixture".into())).unwrap();
    let router = app(state);
    let status_request = || Request::get("/post/range").body(Body::empty()).unwrap();
    let submit = |uid| {
        Request::post(format!(
            "/post/range?uid={uid}&start=2026-07-10%2000:00:00&end=2026-07-11%2023:59:59"
        ))
        .body(Body::empty())
        .unwrap()
    };

    let idle = router.clone().oneshot(status_request()).await.unwrap();
    assert_eq!(idle.status(), StatusCode::NO_CONTENT);
    assert_eq!(idle.headers()["cache-control"], "no-store");
    let accepted = router.clone().oneshot(submit(7)).await.unwrap();
    assert_eq!(accepted.status(), StatusCode::NO_CONTENT);
    tokio::time::timeout(Duration::from_secs(5), started.notified())
        .await
        .unwrap();
    let (_, running) = json_response(router.clone(), "/post/range").await;
    assert_eq!(running["phase"], "RUNNING");
    assert_eq!(running["uid"], 7);
    assert_eq!(running["start"], "2026-07-10");
    assert_eq!(running["end"], "2026-07-11");
    assert_eq!(running["currentDate"], "2026-07-10");
    let conflict = router.clone().oneshot(submit(8)).await.unwrap();
    assert_eq!(conflict.status(), StatusCode::CONFLICT);
    release.notify_one();

    let terminal = |router: axum::Router| async move {
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                let (_, task) = json_response(router.clone(), "/post/range").await;
                if matches!(task["phase"].as_str(), Some("SUCCEEDED" | "FAILED")) {
                    break task;
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .unwrap()
    };
    let failure = terminal(router.clone()).await;
    assert_eq!(failure["phase"], "FAILED");
    assert_eq!(failure["uid"], 7);
    assert_eq!(failure["currentDate"], "2026-07-11");
    assert_eq!(failure["insertedCount"], 1);
    assert_eq!(failure["failureReason"], "微博请求失败。");
    let (_, list) = json_response(router.clone(), "/post/list?uids=7").await;
    assert_eq!(list["items"][0]["mblogId"], "captured");

    let accepted = router.clone().oneshot(submit(8)).await.unwrap();
    assert_eq!(accepted.status(), StatusCode::NO_CONTENT);
    let success = terminal(router).await;
    assert_eq!(success["phase"], "SUCCEEDED");
    assert_eq!(success["uid"], 8);
    assert_eq!(success["insertedCount"], 0);
    assert_eq!(success["fetchedCount"], 0);
    let restarted = app(AppState::new(config).await.unwrap());
    assert_eq!(
        restarted.oneshot(status_request()).await.unwrap().status(),
        StatusCode::NO_CONTENT
    );
    server.abort();
}
