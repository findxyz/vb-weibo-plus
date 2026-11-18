mod config;
mod credential;
mod db;
mod static_files;

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
        Ok(Self {
            config,
            db,
            credential,
            http,
        })
    }
}

pub fn app(state: AppState) -> Router {
    static_files::configure(Router::new(), &state.config.frontend_dir)
        .layer(DefaultBodyLimit::max(21 * 1024 * 1024))
        .with_state(state)
}
