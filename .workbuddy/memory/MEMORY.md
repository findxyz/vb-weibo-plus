
## 构建与运行约定
- 本机没有 mvn/mvnw，项目由用户的 IDE 构建；**不要手动用 javac 覆盖 target/classes**（曾因漏 -parameters 导致 Spring 接口 500，用户明确要求构建交给他们）
- 静态资源改动后需同步到 target/classes/static 才能在已编译产物上生效
- /post/ 与 /chat/ 路径 404 是项目原本无 welcome page，页面访问 /post/index.html 与 /chat/index.html
- 沙箱会拦截 rm 删除文件，需用 python os.remove 并申请沙箱外执行

## 前端约定
- post 页面（/post/index.html）采用手绘线框风格（Wireframe），设计令牌在 post.css 的 :root 中；用户要求去掉所有 wireframe 装饰元素（便签、胶带、图例、标题徽章）
- 给元素设置 hidden 属性时，若该元素 CSS 里写了 display，必须补一条 [hidden] { display: none } 规则，否则 hidden 不生效
- CSS 文件中的非 ASCII 字符（如 content 伪元素文本）必须用 Unicode 转义（如 \6765\81EA）或文件头加 @charset "UTF-8"：本项目 CSS 以无 charset 的 text/css 返回，浏览器默认按 Latin-1 解码会乱码
