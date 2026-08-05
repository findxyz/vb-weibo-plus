
## 构建与运行约定
- 本机没有 mvn/mvnw，项目由用户的 IDE 构建；**不要手动用 javac 覆盖 target/classes**（曾因漏 -parameters 导致 Spring 接口 500，用户明确要求构建交给他们）
- 静态资源改动后需同步到 target/classes/static 才能在已编译产物上生效
- /post/ 与 /chat/ 路径 404 是项目原本无 welcome page，页面访问 /post/index.html 与 /chat/index.html
- 沙箱会拦截 rm 删除文件，需用 python os.remove 并申请沙箱外执行
