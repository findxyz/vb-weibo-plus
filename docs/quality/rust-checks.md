# Rust 质量门禁

在 `backend/rust/` 本地运行以下命令。已用 Rust 1.100.0 验证，需安装 `rustfmt`、Clippy 和 `cargo-deny`。

```sh
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
cargo deny --locked --all-features check advisories
```

`cargo test --locked` 包含模块依赖边界、OpenAPI 路由一致性及源码零注释检查。`config`、`credential`、`db`、`shanghai` 和 `chat::store` 是底层模块，禁止引用 Web 路由、HTTP 客户端和 WebSocket 客户端（允许用 `reqwest::Url` 解析 URL）；`weibo`、`static_files`、`openapi`、`analysis`、`login`、`post`、`chat` 之间按单向分层隔离；`src/` 下的生产源码与 Java 后端一致，不允许保留注释；`/post/*` 与 `/chat/*` 路由须与 [backend/openapi.json](../../backend/openapi.json) 双向对齐。编译器继续检查模块可见性。依赖扫描读取 Cargo 依赖图及锁文件。

在 Windows 本地检查桌面版时，先在 `frontend/` 执行 `npm ci` 和 `npm run build`，再为 Clippy 和测试命令加上 `--all-features`，覆盖桌面和内嵌前端代码。

开发和测试构建默认关闭调试符号及增量编译，以减少 `target/debug` 的磁盘占用。需要调试符号时，可在当前终端设置 `CARGO_PROFILE_DEV_DEBUG=1`。桌面发布使用固定的 MSVC 工具链，静态链接 WebView2Loader 并有助于复用已有构建产物。
