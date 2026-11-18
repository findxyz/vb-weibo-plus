use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

#[derive(Clone)]
pub struct Credential {
    path: PathBuf,
    value: Arc<RwLock<Option<String>>>,
}

impl Credential {
    pub fn load(path: &Path) -> Self {
        let value = match fs::read_to_string(path) {
            Ok(contents) => {
                let cleaned = contents.replace(['\r', '\n'], "");
                let trimmed = cleaned.trim_matches(|character| character <= '\u{20}');
                (!trimmed.is_empty()).then(|| trimmed.to_owned())
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => None,
            Err(error) => {
                eprintln!("读取登录凭据失败：{}，登录态置空。", error.kind());
                None
            }
        };
        Self {
            path: path.into(),
            value: Arc::new(RwLock::new(value)),
        }
    }

    pub fn get(&self) -> Option<String> {
        self.value.read().unwrap().clone()
    }

    pub fn set(&self, value: Option<String>) -> io::Result<()> {
        let mut current = self.value.write().unwrap();
        *current = value;
        let directory = self
            .path
            .parent()
            .filter(|directory| !directory.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        let mut replacement = tempfile::NamedTempFile::new_in(directory)?;
        replacement.write_all(current.as_deref().unwrap_or_default().as_bytes())?;
        replacement
            .persist(&self.path)
            .map(|_| ())
            .map_err(|error| error.error)
    }
}
