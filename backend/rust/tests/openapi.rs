use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use tower::ServiceExt;
use weibo_plus::{AppState, Config, app};

#[tokio::test]
async fn swagger_is_opt_in_and_documents_the_browser_api() {
    let temp = tempfile::tempdir().unwrap();
    let mut config = Config {
        database_path: temp.path().join("java.db"),
        cookie_file: temp.path().join(".weibo_cookie.txt"),
        ..Config::default()
    };
    let request = |uri| Request::builder().uri(uri).body(Body::empty()).unwrap();
    let default_app = app(AppState::new(config.clone()).await.unwrap());
    let response = default_app.oneshot(request("/v3/api-docs")).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);

    config.openapi_enabled = true;
    config.swagger_ui_enabled = true;
    let router = app(AppState::new(config).await.unwrap());
    let docs = router
        .clone()
        .oneshot(request("/v3/api-docs"))
        .await
        .unwrap();
    assert_eq!(docs.status(), StatusCode::OK);
    let docs = axum::body::to_bytes(docs.into_body(), 1024 * 1024)
        .await
        .unwrap();
    let schema: serde_json::Value = serde_json::from_slice(&docs).unwrap();
    assert_eq!(schema["info"]["title"], "vb-weibo-plus");
    assert!(schema["paths"]["/post/list"].is_object());
    assert!(schema["paths"]["/chat/messages"].is_object());
    assert!(schema["paths"]["/weibo/blog/mymblog"].is_null());

    let link = router
        .clone()
        .oneshot(request("/swagger-ui.html"))
        .await
        .unwrap();
    assert_eq!(link.headers()[header::LOCATION], "/swagger-ui/index.html");
    let page = router
        .oneshot(request("/swagger-ui/index.html"))
        .await
        .unwrap();
    assert_eq!(page.status(), StatusCode::OK);
}
