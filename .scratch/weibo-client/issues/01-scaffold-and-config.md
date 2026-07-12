Status: ready-for-agent

## What to build

搭建项目脚手架与全局配置，为后续所有切片奠基。端到端验证：Spring Boot 应用能启动，RestTemplate Bean 就绪，异常类与常量类可被引用。

具体范围：
- pom.xml：Spring Boot 3.5.16 + spring-boot-starter-web + httpclient5 + playwright 1.49.0，Java 21
- application.yml：server.port=8080、weibo.cookie-file=.weibo_cookie.txt、weibo.qr-timeout-seconds=300
- WeiboApplication 启动类
- WeiboConfig：RestTemplate Bean（HttpComponentsClientHttpRequestFactory + HttpClientBuilder.disableRedirectHandling）、ObjectMapper Bean（FAIL_ON_UNKNOWN_PROPERTIES=false）、NoOpResponseErrorHandler
- NoOpResponseErrorHandler：禁用 RestTemplate 默认 4xx/5xx 抛异常
- WeiboConstants：USER_AGENT、REFERER_WEIBO、REFERER_WEBIM、X_REQUESTED_WITH、SOURCE、MAX_RETRY=3、LOGIN_DOMAIN_REGEX、COOKIE_FILE，以及五组公共 header（HEADERS_AJAX / HEADERS_WEBIM / HEADERS_MSGET / HEADERS_RENEW / HEADERS_DIRECT）
- 异常体系：WeiboException（基类，带 int errorCode 字段，默认 0）、WeiboCookieExpiredException、WeiboRateLimitException、WeiboUriTooLongException

## Acceptance criteria

- [ ] mvn -DskipTests compile 通过
- [ ] mvn -DskipTests package 产出可执行 jar
- [ ] 应用能启动（java -jar 或 mvn spring-boot:run）
- [ ] RestTemplate Bean 存在且配置了 disableRedirectHandling 与 NoOpResponseErrorHandler
- [ ] 五组 header 常量可被引用，内容符合 PRD 的 header 组表
- [ ] 四个异常类存在，WeiboException 带 errorCode 字段

## Blocked by

None - can start immediately
