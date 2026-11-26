use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

const SCHEMA: &str = include_str!("schema.sql");

#[derive(Clone)]
pub struct Db {
    path: PathBuf,
    _keepalive: Arc<Mutex<Connection>>,
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
        let path = path.to_path_buf();
        let connection_path = path.clone();
        let connection = tokio::task::spawn_blocking(move || {
            let mut connection = Self::connect(&connection_path)?;
            connection.pragma_update(None, "journal_mode", "WAL")?;
            let transaction = connection.transaction()?;
            transaction.execute_batch(SCHEMA)?;
            transaction.commit()?;
            Ok::<_, rusqlite::Error>(connection)
        })
        .await??;
        Ok(Self {
            path,
            _keepalive: Arc::new(Mutex::new(connection)),
        })
    }

    pub async fn run<T, F>(&self, operation: F) -> Result<T, DbError>
    where
        T: Send + 'static,
        F: FnOnce(&mut Connection) -> rusqlite::Result<T> + Send + 'static,
    {
        let path = self.path.clone();
        let result = tokio::task::spawn_blocking(move || {
            let mut connection = Self::connect(&path)?;
            operation(&mut connection)
        })
        .await??;
        Ok(result)
    }

    fn connect(path: &Path) -> rusqlite::Result<Connection> {
        let connection = Connection::open(path)?;
        connection.busy_timeout(Duration::from_secs(5))?;
        Ok(connection)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn wal_files_stay_until_database_is_dropped() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("weibo.db");
        let wal = dir.path().join("weibo.db-wal");
        let shm = dir.path().join("weibo.db-shm");

        for _ in 0..2 {
            let db = Db::open(&path).await.unwrap();
            assert!(wal.is_file());
            assert!(shm.is_file());
            drop(db);
            assert!(!wal.exists());
            assert!(!shm.exists());
        }
    }
}
