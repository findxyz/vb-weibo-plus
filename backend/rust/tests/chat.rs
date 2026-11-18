use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use serde_json::{Value, json};
use tower::ServiceExt;
use weibo_plus::{AppState, Config, app};

#[tokio::test]
async fn preserved_messages_are_paginated_in_both_directions_without_duplicate_boundaries() {
    let directory = tempfile::tempdir().unwrap();
    let state = AppState::new(Config {
        database_path: directory.path().join("weibo.db"),
        cookie_file: directory.path().join(".weibo_cookie.txt"),
        ..Config::default()
    })
    .await
    .unwrap();
    state
        .db
        .run(|db| {
            db.execute_batch(
                "INSERT INTO groups (gid, name, min_mid, max_mid) VALUES (2, '群聊', 1, 4);
        INSERT INTO messages (mid, gid, text, sender_name, created_at, saved_at, fid, media_type)
        VALUES (1, 2, 'hello_1', 'A', 10, 100, '', 0), (2, 2, 'hello_2', 'A', 20, 100, '', 0),
            (3, 2, '', 'B', 20, 100, 'opaque:3', 1), (4, 2, 'helloB', 'B', 30, 100, '', 0);",
            )
        })
        .await
        .unwrap();
    let router = app(state);
    let page = response(&router, "/chat/messages/cursor?gid=2&size=2").await;
    assert_eq!(page["group"]["name"], "群聊");
    assert_eq!(page["items"][0]["mid"], 4);
    assert_eq!(
        page["items"][1]["originalUrl"],
        "/chat/media?gid=2&mid=3&variant=original"
    );
    assert!(page["items"][1].get("fid").is_none());
    assert_eq!(page["nextBeforeCreatedAt"], 20);
    assert_eq!(page["nextBeforeMid"], 3);
    let older = response(
        &router,
        "/chat/messages/cursor?gid=2&size=2&beforeCreatedAt=20&beforeMid=3",
    )
    .await;
    assert_eq!(older["items"][0]["mid"], 2);
    assert_eq!(older["items"][1]["mid"], 1);
    assert_eq!(older["hasMore"], false);
    let newer = response(
        &router,
        "/chat/messages/cursor?gid=2&size=2&afterCreatedAt=10&afterMid=1",
    )
    .await;
    assert_eq!(newer["items"][0]["mid"], 3);
    assert_eq!(newer["items"][1]["mid"], 2);
    assert_eq!(newer["nextAfterMid"], 3);
    let history = response(&router, "/chat/messages?gid=2&page=1&size=1&keyword=hello_").await;
    assert_eq!(history["total"], 2);
    assert_eq!(history["items"][0]["mid"], 2);
    let groups = response(&router, "/chat/groups").await;
    assert_eq!(
        (
            groups[0]["latestSenderName"].clone(),
            groups[0]["messageCount"].clone()
        ),
        (json!("B"), json!(4))
    );
}

async fn response(router: &axum::Router, uri: &str) -> Value {
    let response = router
        .clone()
        .oneshot(Request::get(uri).body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    serde_json::from_slice(&to_bytes(response.into_body(), 32 * 1024).await.unwrap()).unwrap()
}

#[tokio::test]
async fn historical_sticker_uses_the_same_origin_image_proxy() {
    let directory = tempfile::tempdir().unwrap();
    let state = AppState::new(Config {
        database_path: directory.path().join("weibo.db"),
        cookie_file: directory.path().join("test-weibo-cookie.txt"),
        ..Config::default()
    })
    .await
    .unwrap();
    let original = "http://wx2.sinaimg.cn/large/sticker.jpg?size=large&name=a%20b";
    let pic_infos = json!([{"original_pic": original}]).to_string();
    state
        .db
        .run(move |db| {
            db.execute(
                "INSERT INTO messages (mid, gid, media_type, pic_infos, created_at, saved_at)
                 VALUES (7, 3, 15, ?, 10, 20)",
                [pic_infos],
            )
        })
        .await
        .unwrap();
    let router = app(state);

    for route in [
        "/chat/messages?gid=3&page=1&size=10",
        "/chat/messages/cursor?gid=3&size=10",
    ] {
        let body = response(&router, route).await;
        let item = &body["items"][0];
        let preview = item["previewUrl"].as_str().unwrap();
        assert!(preview.starts_with("/chat/image?"), "{preview}");
        let parsed = reqwest::Url::parse(&format!("http://localhost{preview}")).unwrap();
        assert_eq!(
            parsed.query_pairs().next().unwrap(),
            ("url".into(), original.into())
        );
        assert_eq!(item["originalUrl"], preview);
    }
}
