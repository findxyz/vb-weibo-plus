use axum::body::{Body, Bytes, to_bytes};
use axum::http::{HeaderMap, Request, StatusCode, header};
use axum::{
    Json, Router,
    extract::State,
    routing::{get, post},
};
use serde_json::json;
use tower::ServiceExt;
use weibo_plus::{AppState, Config, app};

#[tokio::test]
async fn group_video_range_checks_content_range_and_supports_suffix() {
    let upstream = Router::new().route(
        "/2/mss/msget",
        get(|headers: HeaderMap| async move {
            match headers
                .get(header::RANGE)
                .and_then(|value| value.to_str().ok())
            {
                Some("bytes=0-0") => (
                    StatusCode::PARTIAL_CONTENT,
                    [(header::CONTENT_RANGE, "bytes 0-0/5")],
                    "a",
                ),
                Some("bytes=3-4") => (
                    StatusCode::OK,
                    [(header::CONTENT_RANGE, "bytes 3-4/5")],
                    "de",
                ),
                Some("bytes=10-") => (
                    StatusCode::RANGE_NOT_SATISFIABLE,
                    [(header::CONTENT_RANGE, "bytes */5")],
                    "",
                ),
                _ => (
                    StatusCode::OK,
                    [(header::CONTENT_RANGE, "bytes 0-4/5")],
                    "abcde",
                ),
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let upstream_origin = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let temp = tempfile::tempdir().unwrap();
    let state = AppState::new(Config {
        database_path: temp.path().join("java.db"),
        cookie_file: temp.path().join(".weibo_cookie.txt"),
        weibo_origin: Some(upstream_origin),
        ..Config::default()
    })
    .await
    .unwrap();
    state.credential.set(Some("SUB=fixture".into())).unwrap();
    state
        .db
        .run(|db| {
            db.execute_batch(
                "INSERT INTO messages(mid, gid, media_type, fid, created_at, saved_at)
         VALUES (7, 3, 10, 'opaque-file', 1, 2);",
            )
        })
        .await
        .unwrap();
    let router = app(state);
    let request = |range| {
        Request::builder()
            .uri("/chat/media?gid=3&mid=7&variant=video")
            .header(header::RANGE, range)
            .body(Body::empty())
            .unwrap()
    };
    let suffix = router.clone().oneshot(request("bytes=-2")).await.unwrap();
    assert_eq!(suffix.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(suffix.headers()[header::CONTENT_RANGE], "bytes 3-4/5");
    assert_eq!(suffix.headers()[header::ACCEPT_RANGES], "bytes");
    assert_eq!(&to_bytes(suffix.into_body(), 10).await.unwrap()[..], b"de");
    let out_of_range = router.clone().oneshot(request("bytes=10-")).await.unwrap();
    assert_eq!(out_of_range.status(), StatusCode::RANGE_NOT_SATISFIABLE);
    assert_eq!(out_of_range.headers()[header::CONTENT_RANGE], "bytes */5");
    let invalid = router.oneshot(request("bytes=2-3")).await.unwrap();
    assert_eq!(invalid.status(), StatusCode::BAD_GATEWAY);
    server.abort();
}

#[tokio::test]
async fn image_send_uploads_once_and_returns_conflict_when_capture_fails() {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    let sends = Arc::new(AtomicUsize::new(0));
    let upstream = Router::new()
        .route(
            "/webim/fileplatform/init.json",
            post(|form: String| async move {
                assert!(form.contains("type=dm_attachment_pic"));
                assert!(form.contains("name=example.png"));
                Json(json!({"fileToken":"fixture-token", "length":0}))
            }),
        )
        .route(
            "/webim/uploadx.json",
            post(|multipart: String| async move {
                assert!(multipart.contains("filename=\"example.png\""));
                assert!(
                    multipart
                        .to_ascii_lowercase()
                        .contains("content-type: image/png")
                );
                assert!(multipart.contains("fixture-token"));
                Json(json!({"fid":987}))
            }),
        )
        .route(
            "/webim/groupchat/send_message.json",
            post(
                |State(sends): State<Arc<AtomicUsize>>, form: String| async move {
                    assert!(form.contains("fids=987"));
                    assert!(form.contains("media_type=1"));
                    sends.fetch_add(1, Ordering::SeqCst);
                    Json(json!({"result":true}))
                },
            ),
        )
        .route(
            "/webim/groupchat/query_messages.json",
            get(|| async { Json(json!({"result":false})) }),
        )
        .with_state(sends.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let temp = tempfile::tempdir().unwrap();
    let state = AppState::new(Config {
        database_path: temp.path().join("weibo.db"),
        cookie_file: temp.path().join("test-weibo-cookie.txt"),
        weibo_origin: Some(origin),
        ..Config::default()
    })
    .await
    .unwrap();
    state.credential.set(Some("SUB=fixture".into())).unwrap();
    let body = concat!(
        "--fixture\r\nContent-Disposition: form-data; name=\"gid\"\r\n\r\n8\r\n",
        "--fixture\r\nContent-Disposition: form-data; name=\"file\"; filename=\"example.png\"\r\n",
        "Content-Type: image/png\r\n\r\npng-fixture\r\n--fixture--\r\n",
    );
    let request = Request::post("/chat/messages/sendImage")
        .header(
            header::CONTENT_TYPE,
            "multipart/form-data; boundary=fixture",
        )
        .body(Body::from(body))
        .unwrap();
    let response = app(state).oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::CONFLICT);
    assert_eq!(sends.load(Ordering::SeqCst), 1);
    server.abort();
}

#[tokio::test]
#[ignore = "requires locally installed ffmpeg and ffprobe"]
async fn video_send_probes_uploads_a_png_cover_and_sends_the_video() {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    let video = include_bytes!("../../../frontend/tests/fixtures/history-video.mp4");
    let sends = Arc::new(AtomicUsize::new(0));
    let upstream = Router::new()
        .route(
            "/webim/uploadx.json",
            post(|body: Bytes| async move {
                let body = String::from_utf8_lossy(&body);
                assert!(body.contains("name=\"imageName\""));
                assert!(
                    body.to_ascii_lowercase()
                        .contains("content-type: image/png")
                );
                Json(json!({"fid":11}))
            }),
        )
        .route(
            "/webim/2/multimedia/init.json",
            post(|form: String| async move {
                assert!(form.contains("type=dm_attachment_video"));
                assert!(form.contains("duration%22%3A3"));
                Json(json!({"fileToken":"video-token","auth":"fixture-auth","length":0}))
            }),
        )
        .route(
            "/2/multimedia/upload.json",
            post(|headers: HeaderMap, body: Bytes| async move {
                assert_eq!(headers["x-up-auth"], "fixture-auth");
                assert_eq!(headers[header::CONTENT_TYPE], "application/octet-stream");
                assert_eq!(
                    &body[..],
                    &include_bytes!("../../../frontend/tests/fixtures/history-video.mp4")[..]
                );
                Json(json!({"fid":22}))
            }),
        )
        .route(
            "/webim/groupchat/send_message.json",
            post(
                |State(sends): State<Arc<AtomicUsize>>, form: String| async move {
                    assert!(form.contains("fids=22"));
                    assert!(form.contains("media_type=10"));
                    assert!(form.contains("video_pic_fid%22%3A11"));
                    sends.fetch_add(1, Ordering::SeqCst);
                    Json(json!({"result":true}))
                },
            ),
        )
        .route(
            "/webim/groupchat/query_messages.json",
            get(|| async { Json(json!({"result":true,"messages":[]})) }),
        )
        .with_state(sends.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
    let temp = tempfile::tempdir().unwrap();
    let state = AppState::new(Config {
        database_path: temp.path().join("weibo.db"),
        cookie_file: temp.path().join("test-weibo-cookie.txt"),
        weibo_origin: Some(origin),
        ..Config::default()
    })
    .await
    .unwrap();
    state.credential.set(Some("SUB=fixture".into())).unwrap();
    let mut body = Vec::new();
    body.extend_from_slice(b"--fixture\r\nContent-Disposition: form-data; name=\"file\"; filename=\"example.mp4\"\r\nContent-Type: video/mp4\r\n\r\n");
    body.extend_from_slice(video);
    body.extend_from_slice(b"\r\n--fixture--\r\n");
    let request = Request::post("/chat/messages/sendVideo?gid=8")
        .header(
            header::CONTENT_TYPE,
            "multipart/form-data; boundary=fixture",
        )
        .body(Body::from(body))
        .unwrap();
    let response = app(state).oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(sends.load(Ordering::SeqCst), 1);
    server.abort();
}
