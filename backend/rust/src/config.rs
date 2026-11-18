use std::env;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::time::Duration;

const ENV_OPTIONS: &[(&str, &str)] = &[
    ("SERVER_ADDRESS", "server.address"),
    ("SERVER_PORT", "server.port"),
    ("WEIBO_PORT", "server.port"),
    ("WEIBO_DATABASE_PATH", "weibo.database-path"),
    ("WEIBO_COOKIE_FILE", "weibo.cookie-file"),
    ("WEIBO_FRONTEND_DIR", "weibo.frontend-dir"),
    ("WEIBO_QR_TIMEOUT", "weibo.qr-timeout-seconds"),
    ("WEIBO_AUTO_SYNC_GIDS", "weibo.chat.auto-sync-gids"),
    (
        "WEIBO_SYNC_GROUP_FIXED_DELAY",
        "weibo.chat.sync-group-fixed-delay",
    ),
    ("WEIBO_FFMPEG_PATH", "weibo.media.ffmpeg-path"),
    ("WEIBO_AI_BASE_URL", "weibo.ai.base-url"),
    ("WEIBO_AI_API_KEY", "weibo.ai.api-key"),
    ("WEIBO_AI_MODEL", "weibo.ai.model"),
    ("WEIBO_AI_TIMEOUT", "weibo.ai.timeout-seconds"),
    ("WEIBO_AI_SYSTEM_PROMPT", "weibo.ai.system-prompt"),
    ("SPRINGDOC_API_DOCS_ENABLED", "springdoc.api-docs.enabled"),
    (
        "SPRINGDOC_SWAGGER_UI_ENABLED",
        "springdoc.swagger-ui.enabled",
    ),
];

#[derive(Clone)]
pub struct Config {
    pub bind: SocketAddr,
    pub database_path: PathBuf,
    pub cookie_file: PathBuf,
    pub frontend_dir: PathBuf,
    pub ffmpeg_path: PathBuf,
    pub auto_sync_gids: Vec<i64>,
    pub sync_group_fixed_delay: Duration,
    pub qr_timeout: Duration,
    pub ai_base_url: String,
    pub ai_api_key: String,
    pub ai_model: String,
    pub ai_timeout: Duration,
    pub ai_system_prompt: String,
    pub openapi_enabled: bool,
    pub swagger_ui_enabled: bool,
    pub weibo_origin: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            bind: SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 18080),
            database_path: "weibo.db".into(),
            cookie_file: ".weibo_cookie.txt".into(),
            frontend_dir: if cfg!(feature = "embed-frontend") {
                PathBuf::new()
            } else {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../frontend/dist")
            },
            ffmpeg_path: "ffmpeg".into(),
            auto_sync_gids: vec![4761715839862414, 5046020575330655],
            sync_group_fixed_delay: Duration::from_secs(60),
            qr_timeout: Duration::from_secs(300),
            ai_base_url: String::new(),
            ai_api_key: String::new(),
            ai_model: "deepseek-v4-flash".into(),
            ai_timeout: Duration::from_secs(120),
            ai_system_prompt: "请用中文回复分析结果。".into(),
            openapi_enabled: false,
            swagger_ui_enabled: false,
            weibo_origin: None,
        }
    }
}

impl Config {
    pub fn load() -> Result<Self, String> {
        let mut config = Self::default();
        #[cfg(feature = "embed-frontend")]
        {
            let executable = env::current_exe().map_err(|error| error.to_string())?;
            if let Some(directory) = executable.parent() {
                config.database_path = directory.join(config.database_path);
                config.cookie_file = directory.join(config.cookie_file);
            }
        }
        for (variable, key) in ENV_OPTIONS {
            if let Ok(value) = env::var(variable) {
                config.apply(key, &value)?;
            }
        }
        for argument in env::args().skip(1) {
            let (key, value) = argument
                .strip_prefix("--")
                .and_then(|argument| argument.split_once('='))
                .ok_or_else(|| "配置参数应使用 --名称=值 格式。".to_owned())?;
            config.apply(key, value)?;
        }
        Ok(config)
    }

    fn apply(&mut self, key: &str, value: &str) -> Result<(), String> {
        let invalid = || format!("配置值格式错误：{key}。");
        match key {
            "server.port" => self.bind.set_port(value.parse().map_err(|_| invalid())?),
            "server.address" => self.bind.set_ip(value.parse().map_err(|_| invalid())?),
            "weibo.database-path" => self.database_path = value.into(),
            "weibo.cookie-file" => self.cookie_file = value.into(),
            "weibo.frontend-dir" => self.frontend_dir = value.into(),
            "weibo.qr-timeout-seconds" => {
                self.qr_timeout = Duration::from_secs(value.parse().map_err(|_| invalid())?)
            }
            "weibo.chat.auto-sync-gids" => {
                self.auto_sync_gids = value
                    .split(',')
                    .map(str::trim)
                    .filter(|part| !part.is_empty())
                    .map(str::parse)
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|_| invalid())?;
                self.auto_sync_gids.sort_unstable();
                self.auto_sync_gids.dedup();
            }
            "weibo.chat.sync-group-fixed-delay" => {
                self.sync_group_fixed_delay = parse_duration(value).ok_or_else(invalid)?;
                if self.sync_group_fixed_delay.is_zero() {
                    return Err(invalid());
                }
            }
            "weibo.media.ffmpeg-path" => self.ffmpeg_path = value.into(),
            "weibo.ai.base-url" => self.ai_base_url = value.into(),
            "weibo.ai.api-key" => self.ai_api_key = value.into(),
            "weibo.ai.model" => self.ai_model = value.into(),
            "weibo.ai.timeout-seconds" => {
                self.ai_timeout = Duration::from_secs(value.parse().map_err(|_| invalid())?)
            }
            "weibo.ai.system-prompt" => self.ai_system_prompt = value.into(),
            "springdoc.api-docs.enabled" => {
                self.openapi_enabled = value.parse().map_err(|_| invalid())?
            }
            "springdoc.swagger-ui.enabled" => {
                self.swagger_ui_enabled = value.parse().map_err(|_| invalid())?
            }
            _ => return Err(format!("未知配置项：{key}。")),
        }
        Ok(())
    }
}

fn parse_duration(value: &str) -> Option<Duration> {
    let (amount, millis) = if let Some(amount) = value.strip_suffix("ms") {
        (amount, 1)
    } else if let Some(amount) = value.strip_suffix('s') {
        (amount, 1_000)
    } else if let Some(amount) = value.strip_suffix('m') {
        (amount, 60_000)
    } else if let Some(amount) = value.strip_suffix('h') {
        (amount, 3_600_000)
    } else {
        (value, 1)
    };
    let amount: u64 = amount.parse().ok()?;
    amount.checked_mul(millis).map(Duration::from_millis)
}
