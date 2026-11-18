use axum::{body::Body, http::Request};
use std::fs;
use tower::ServiceExt;
use weibo_plus::{AppState, Config, app};

#[tokio::test]
async fn serves_chat_and_post_from_the_same_origin() {
    let directory = tempfile::tempdir().unwrap();
    let frontend_dir = directory.path().join("frontend");
    for page in ["chat", "post"] {
        let page_dir = frontend_dir.join(page);
        fs::create_dir_all(&page_dir).unwrap();
        fs::write(
            page_dir.join("index.html"),
            format!("<title>{page}</title>"),
        )
        .unwrap();
    }
    let state = AppState::new(Config {
        database_path: directory.path().join("weibo.db"),
        cookie_file: directory.path().join(".weibo_cookie.txt"),
        frontend_dir,
        ..Config::default()
    })
    .await
    .unwrap();
    let router = app(state);
    for page in ["chat", "post"] {
        let response = router
            .clone()
            .oneshot(
                Request::get(format!("/{page}/index.html"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(response.headers()["content-type"], "text/html");
        let body = axum::body::to_bytes(response.into_body(), 1024)
            .await
            .unwrap();
        assert_eq!(body, format!("<title>{page}</title>"));
    }
}

#[tokio::test]
async fn reopens_a_java_database_and_credential_without_conversion() {
    let directory = tempfile::tempdir().unwrap();
    let database_path = directory.path().join("weibo.db");
    let cookie_file = directory.path().join(".weibo_cookie.txt");
    let java_credential = "SUBP=example-subp; ALF=123; SSOLoginState=456; SUB=example-sub";
    fs::write(&cookie_file, format!("  {java_credential}\r\n")).unwrap();
    {
        let java_database = rusqlite::Connection::open(&database_path).unwrap();
        java_database
            .execute_batch(include_str!("../../java/src/main/resources/schema.sql"))
            .unwrap();
        java_database
            .execute(
                "INSERT INTO bloggers (uid, screen_name) VALUES (17, '测试博主')",
                [],
            )
            .unwrap();
    }

    let state = AppState::new(Config {
        database_path: database_path.clone(),
        cookie_file: cookie_file.clone(),
        ..Config::default()
    })
    .await
    .unwrap();
    assert_eq!(state.credential.get().as_deref(), Some(java_credential));
    let blogger = state
        .db
        .run(|connection| {
            connection.query_row(
                "SELECT screen_name FROM bloggers WHERE uid = 17",
                [],
                |row| row.get::<_, String>(0),
            )
        })
        .await
        .unwrap();
    assert_eq!(blogger, "测试博主");
    let replacement = "SUBP=replaced-subp; ALF=123; SSOLoginState=456; SUB=replaced-sub";
    state.credential.set(Some(replacement.to_owned())).unwrap();
    assert_eq!(fs::read_to_string(&cookie_file).unwrap(), replacement);

    let java_database = rusqlite::Connection::open(database_path).unwrap();
    let journal_mode: String = java_database
        .pragma_query_value(None, "journal_mode", |row| row.get(0))
        .unwrap();
    assert_eq!(journal_mode, "wal");
}
