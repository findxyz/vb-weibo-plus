use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::time::Duration;

const SCHEMA: &str = include_str!("schema.sql");

#[derive(Clone)]
pub struct Db {
    path: PathBuf,
}

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error(transparent)]
    Task(#[from] tokio::task::JoinError),
}

impl Db {
    pub async fn open(path: &Path) -> Result<Self, DbError> {
        let db = Self { path: path.into() };
        db.run(|connection| {
            connection.pragma_update(None, "journal_mode", "WAL")?;
            let transaction = connection.transaction()?;
            transaction.execute_batch(SCHEMA)?;
            transaction.commit()
        })
        .await?;
        Ok(db)
    }

    pub async fn run<T, F>(&self, operation: F) -> Result<T, DbError>
    where
        T: Send + 'static,
        F: FnOnce(&mut Connection) -> rusqlite::Result<T> + Send + 'static,
    {
        let path = self.path.clone();
        let result = tokio::task::spawn_blocking(move || {
            let mut connection = Connection::open(path)?;
            connection.busy_timeout(Duration::from_secs(5))?;
            operation(&mut connection)
        })
        .await??;
        Ok(result)
    }
}
