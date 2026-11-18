use weibo_plus::{AppState, Config, app, start_background};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = Config::load()?;
    let bind = config.bind;
    let open_browser = config.open_browser;
    let state = AppState::new(config).await?;
    let listener = tokio::net::TcpListener::bind(bind).await?;
    let address = listener.local_addr()?;
    let host = if address.ip().is_unspecified() {
        format!("127.0.0.1:{}", address.port())
    } else {
        address.to_string()
    };
    let url = format!("http://{host}/chat/index.html");
    println!("服务已启动：{url}");
    if open_browser {
        open_default_browser(&url);
    }
    start_background(state.clone());
    axum::serve(listener, app(state))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}

fn open_default_browser(url: &str) {
    #[cfg(windows)]
    if let Err(error) = std::process::Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn()
    {
        eprintln!("打开浏览器失败：{error}");
    }
    #[cfg(not(windows))]
    let _ = url;
}
