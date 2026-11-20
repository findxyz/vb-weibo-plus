mod analysis;
mod chat;
mod config;
mod credential;
mod db;
pub mod login;
mod media;
mod openapi;
mod post;
mod shanghai;
mod static_files;
pub mod weibo;

pub use config::Config;
pub use credential::Credential;
pub use db::{Db, DbError};

use axum::{Router, extract::DefaultBodyLimit};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub db: Db,
    pub credential: Credential,
    pub http: reqwest::Client,
    pub(crate) ai_http: reqwest::Client,
}

#[derive(Debug, thiserror::Error)]
pub enum StartupError {
    #[error(transparent)]
    Database(#[from] DbError),
    #[error(transparent)]
    Http(#[from] reqwest::Error),
    #[error(transparent)]
    CredentialTask(#[from] tokio::task::JoinError),
}

impl AppState {
    pub async fn new(config: Config) -> Result<Self, StartupError> {
        let db = Db::open(&config.database_path).await?;
        let cookie_path = config.cookie_file.clone();
        let credential =
            tokio::task::spawn_blocking(move || Credential::load(&cookie_path)).await?;
        let http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .build()?;
        let ai_http = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .build()?;
        Ok(Self {
            config,
            db,
            credential,
            http,
            ai_http,
        })
    }
}

pub fn app(state: AppState) -> Router {
    let routes = login::routes()
        .merge(chat::routes())
        .merge(post::routes())
        .merge(media::routes())
        .merge(analysis::routes())
        .merge(openapi::routes(&state.config));
    static_files::configure(routes, &state.config.frontend_dir)
        .layer(DefaultBodyLimit::max(21 * 1024 * 1024))
        .with_state(state)
}

pub fn start_background(state: AppState) {
    chat::start_background(state.clone());
    post::spawn_background(state);
}
