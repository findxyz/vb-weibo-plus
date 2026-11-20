# Rust 质量门禁

在 `backend/rust/` 运行以下命令。CI 固定使用 Rust 1.100.0。本地需安装 `rustfmt`、Clippy 和 `cargo-deny`。

```sh
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
cargo deny --locked --all-features check advisories
```

`cargo test --locked` 包含模块依赖检查。`config`、`credential`、`db` 和 `shanghai` 是底层模块。群聊的 `chat::store` 可以使用上层的查询类型、空群组构造和字符串读取函数。这些模块的导入和限定路径禁止引用 Web 路由、HTTP 客户端和 WebSocket 客户端，允许用 `reqwest::Url` 解析 URL。编译器继续检查模块可见性。依赖扫描读取 Cargo 依赖图及锁文件。

GitHub Actions 在 Linux 上运行上述门禁，在 Windows 上构建前端后，以 `--all-features` 运行 Clippy 和测试，覆盖桌面和内嵌前端代码。在 Windows 本地运行相同命令前，先在 `frontend/` 执行 `npm ci` 和 `npm run build`。
