#![cfg_attr(
    all(windows, feature = "desktop", not(debug_assertions)),
    windows_subsystem = "windows"
)]

#[cfg(all(windows, feature = "desktop"))]
mod desktop;

use weibo_plus::{AppState, Config, app, start_background};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = Config::load();
    #[cfg(all(windows, feature = "desktop"))]
    let show_error = config.as_ref().map_or(true, |config| config.open_browser);
    let result = match config {
        Ok(config) => run(config).await,
        Err(error) => Err(error.into()),
    };
    #[cfg(all(windows, feature = "desktop"))]
    if show_error && let Err(error) = &result {
        desktop::show_error(&error.to_string());
    }
    result
}

async fn run(config: Config) -> Result<(), Box<dyn std::error::Error>> {
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
    start_background(state.clone());
    let router = app(state);
    if open_browser {
        #[cfg(all(windows, feature = "desktop"))]
        {
            let server = tokio::spawn(async move { axum::serve(listener, router).await });
            let result = desktop::run(&url);
            server.abort();
            let _ = server.await;
            return result;
        }
        #[cfg(not(all(windows, feature = "desktop")))]
        open_default_browser(&url);
    }
    axum::serve(listener, router)
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
