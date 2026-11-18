use weibo_plus::{AppState, Config, app};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = Config::load()?;
    let bind = config.bind;
    let state = AppState::new(config).await?;
    let listener = tokio::net::TcpListener::bind(bind).await?;
    println!(
        "服务已启动：http://{}/chat/index.html",
        listener.local_addr()?
    );
    axum::serve(listener, app(state))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
