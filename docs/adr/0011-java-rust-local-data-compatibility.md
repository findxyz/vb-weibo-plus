# Java 与 Rust 使用兼容的本地数据

Rust 后端作为完整实现加入。用户选择一个后端运行，在停止当前后端后可以切换到另一个，并继续使用已有的 SQLite 和 Credential。

两个实现沿用现有 SQLite 表、字段编码和 Credential 文件格式。保持 Captured Content 的写入规则，以及日期、标识符和 JSON 的读取兼容。测试使用隔离的数据库和 Credential，覆盖 Java 写入后由 Rust 读取，以及 Rust 写入后由 Java 读取。

两个后端各自发布。Java 包保留现有启动方式。Rust 提供 Windows x64 可执行文件并带上同一套 React 产物。停止当前进程后再切换是受支持的使用方式。
