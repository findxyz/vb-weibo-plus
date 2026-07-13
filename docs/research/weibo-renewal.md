# 微博二维码登录与续期调研

调研日期：2026-07-13

## 结论

当前 `/weibo/login/renew` 不适用于项目使用的二维码登录态。问题不只是调用太早；当前二维码登录生成的 `SUBP` 缺少旧版更新器要求的 `et` 字段，因此无论等待多久，该更新器都不会认为凭证进入续期窗口。

新浪一方 `ssologin.js` 会先调用 `getCookieExpireTime()`：

- 无过期时间时返回 `retcode=6102`，不请求 `updatetgt.php`。
- 已过期时返回 `retcode=6203`。
- 尚未进入更新时间窗口时返回 `retcode=6110` 或 `6111`。
- 只有前置检查全部通过才调用 `updatetgt.php` 和跨域同步链。

当前项目跳过了这些前置检查，直接调用旧接口链。认证实测表明，这会使原凭证在数秒后失效，却不会返回新的 `.weibo.com` `SUB` 或 `SUBP`。

因此，当前可靠方案是禁用 `/renew`，在业务接口返回 HTTP 401 时重新扫码登录。进一步的一方资源追踪表明，`passport.weibo.com/wbsso/login` 是消费登录票据的应用登录交换，不是可独立调用的刷新接口；匿名访客流程本身也会生成 `SRF`／`SRT`，所以它们的存在不能证明账户可恢复，更不能证明能够续期。当前没有找到已验证的现代续期协议，不能继续修补现有 `updatetgt → crossdomain` 实现。

## 浏览器上下文探针

使用一次性 Playwright 探针进行了三轮只读扫码验证。探针不调用续期接口，不保存 Cookie 值，只输出名称、Domain、过期差值和登录期间访问的 SSO 路径。

### 实际 Cookie 集合

每轮二维码登录稳定得到 15 个 Cookie，主要包括：

- `.weibo.com`：`SUB`、`SUBP`、`SSOLoginState`、`ALF` 及页面辅助 Cookie。
- `.weibo.cn`：`SSOLoginState`、`ALF`。
- `.passport.weibo.com`：`SRF`、HttpOnly 的 `SRT`。
- `.krcom.cn`：`SUB`、`SUBP`、`ALF`。

没有 `sina.com.cn` 域 Cookie，也没有 `SUP` 或 `SUR`。这推翻了早期基于旧页面样本提出的 `SUP`／`SUR` 假设。

当前 `LoginApi` 调用 `ctx.cookies()` 后只保留 `.weibo.com` 四字段，因此会丢弃 `SRF`、`SRT` 和其他域状态。不过，保存完整 Cookie Jar 只是在后续验证访客恢复链时避免提前丢失输入，不能据此认定 `SRF`／`SRT` 能够续期。

### 实际登录请求

扫码登录期间稳定观察到以下关键请求：

```text
GET login.sina.com.cn/sso/qrcode/image
GET login.sina.com.cn/sso/qrcode/check
GET login.sina.com.cn/sso/login.php
GET passport.weibo.com/wbsso/login
```

登录过程没有调用：

```text
login.sina.com.cn/sso/updatetgt.php
login.sina.com.cn/sso/crossdomain.php
```

这说明仓库文档中的四步“续期链”不是当前二维码登录实际执行的登录步骤。

## 现代登录与访客恢复资源追踪

### 已证实

#### `wbsso/login` 属于持票登录交换

[微博聊天页当前业务包](https://h5.sinaimg.cn/m/pcweibochat/js/app.fcf62844.js) 给出了项目所用二维码登录页的完整客户端编排：

- 字符偏移 51091 定义 `login.sina.com.cn/sso/login.php` 请求，固定参数包含 `entry=weibo`、`returntype=TEXT`、`crossdomain=1`、`domain=weibo.com` 和 `savestate=30`。
- 字符偏移 695984 的 `getqrcodeimg()` 获取二维码并轮询检查结果。
- 字符偏移 696990 的 `login(alt)` 把扫码结果中的 `alt` 交给上述 `login.php`。
- 字符偏移 697217 起只消费服务端返回的 `crossDomainUrlList`，逐个访问其中的 URL；客户端没有自行构造刷新请求。

[新浪一方 `ssologin.js`](https://i.sso.sina.com.cn/js/ssologin.js) 在字符偏移 1298 将 `weibo.com` 的 `appLoginURL` 映射为 `https://passport.weibo.com/wbsso/login`。字符偏移 15266 的 `appLogin(ticket, domain, callback)` 明确为该地址提供 `ticket`、`ssosavestate` 和回调；字符偏移 9659 的 `loginCallBack()` 也只有在登录结果包含票据时才调用 `appLogin()`。

扫码实测观察到的 `wbsso/login` 正好出现在 `login.php` 返回跨域 URL 列表之后。另用全新匿名上下文发送无效票据时，`wbsso/login` 返回 `result=false`，且没有下发 Cookie。以上证据共同说明，它是登录票据到微博应用 Cookie 的交换步骤，不是一个依靠现有 `SRF`／`SRT` 或四字段 Cookie 即可调用的刷新端点。

#### `autoLogin()` 不是后台续期器

[新浪一方 `ssologin.js`](https://i.sso.sina.com.cn/js/ssologin.js) 字符偏移 14815 的 `autoLogin(callback, strict)` 有两类行为：

- 当前域仍有 `SUBP` 时，只解码该 Cookie 并立即执行回调，不发网络请求，也不验证服务端是否仍接受它。
- 满足“缺少 `SUBP`，但仍有 `ALF` 或 `SSOLoginState`”等条件时，字符偏移 17153 的 `sinaAutoLogin()` 才把整个页面导航到 `login.sina.com.cn/sso/login.php`，参数为 `gateway=1` 和 `returntype=CROSSDOMAIN_BY_LOCATION`。

聊天业务包字符偏移 53724 检查错误码 `21301`，随后在字符偏移 53840 调用 `autoLogin()`。这并不等于后台刷新现有登录态；只要无效的 `SUBP` 仍留在浏览器中，该函数甚至不会发起恢复请求。

#### `SRF` 的可见读取代码属于当前未启用的分支

匿名访问 `weibo.com` 根地址会跳转到 [微博一方访客页](https://passport.weibo.com/visitor/visitor?entry=miniblog&a=enter&url=https%3A%2F%2Fweibo.com%2F&domain=weibo.com)。当前返回的 HTML 同时定义了 `visitor_origin()` 和 `visitor_gray()` 两套分支，但只有后者被页面入口调用：

- 第 36-55 行定义 `visitor_origin()`：先用 `Store.CookieHelper.get("SRF")` 判断是否调用 `restore()`。
- 第 191-225 行定义 `restore → restore_back`：服务端若返回非空 `alt`，则跳转到 `passport.weibo.com/sso/v2/login?source=visitor_restore&type=3&alt=...`。
- 但是当前真正的页面入口在第 108-110 行，调用的是 `visitor_gray()`，不是 `visitor_origin()`。
- 活跃的 `visitor_gray()` 在第 62-80 行以同源 XHR `POST /visitor/genvisitor2`。请求除浏览器自动携带的匹配 Cookie 外，还包含本地 `tid`、设备检测生成的 `rid`、`request_id` 和 `webdriver` 标志；第 250-263 行的回调在服务端返回非空 `alt` 时，再跳转到同一个 `/sso/v2/login` 恢复入口。

配套的 [访客页基础脚本](https://passport.weibo.com/js/visitor/mini_original.js?v=20161116) 第 913-930 行显示，`postData()` 使用普通同源 `XMLHttpRequest`；同一脚本的 `Store.DB` 会从 IndexedDB、WebSQL、Cookie 和 localStorage 等浏览器存储读取或恢复 `tid`。浏览器会自动携带与 `.passport.weibo.com` 匹配的 Cookie，包括 JavaScript 无法读取的 HttpOnly Cookie，但脚本本身没有点名 `SRT`。[RFC 6265 第 4.1.2.6 节](https://www.rfc-editor.org/rfc/rfc6265#section-4.1.2.6) 规定 HttpOnly Cookie 仍会随 HTTP 请求发送，只对非 HTTP API 隐藏。

全新无 Cookie 的 Playwright 上下文只打开 [微博聊天页](https://api.weibo.com/chat) 并等待 15 秒时，只得到 4 个 `.weibo.com` 页面辅助 Cookie，没有 `SRF`、`SRT` 或任何访客请求。这只能确认聊天页在扫码前没有初始化访客状态。

另用完全无 Cookie 的匿名请求执行访客页公开编排中的 [`POST /visitor/genvisitor2`](https://passport.weibo.com/visitor/genvisitor2)，响应为 HTTP 200，并下发以下 Cookie 元数据：

- `SVB`，Domain 为 `passport.weibo.com`。
- `SUB`、`SUBP`，Domain 为 `.weibo.com`。
- `SRT`，Domain 为 `.passport.weibo.com`，带 HttpOnly。
- `SRF`，Domain 为 `.passport.weibo.com`。

该匿名响应中的 `SRF`／`SRT` 都带 `Max-Age=315360000`；响应体的 `alt` 为空，后续动作为 `cross_domain`，没有进入 `/sso/v2/login`。把这组匿名 `SUB`／`SUBP` 交给项目受保护接口时，HTTP 状态虽然为 200，但业务体返回 `error_code=21301` 和 `Auth failed, Cookie expires or invalid`。因此已经可以确认：匿名访客身份也会产生同名 Cookie，而 Cookie 存在或 HTTP 200 都不能证明保存了可用登录账户。

#### 现代登录包没有公开刷新动作

[当前微博登录页](https://passport.weibo.com/sso/signin?entry=miniblog&source=weibo&url=https%3A%2F%2Fweibo.com%2F) 加载的 [现代登录业务包](https://h5.sinaimg.cn/m/login/assets/pages/login/login-ZbqmGudM.js) 中：

- 字符偏移 62307 调用 `/sso/v2/qrcode/check`；成功后在字符偏移 62676 直接导航到服务端返回的 `data.url`。
- 字符偏移 62826 调用 `/sso/v2/qrcode/image`。
- 字符偏移 79357 的 `/sso/v2/login` 用于账号、短信和多因素登录；返回动作 `goto` 时导航到服务端给出的地址。
- 该业务包出现的业务端点只有 `/sso/v2/web/config`、`qrcode/image`、`qrcode/check`、`login`、`sms/send` 和 `captcha/image`。没有 `refresh`、`renew` 或 `updatetgt` 动作，也没有 `SRF` 或 `SRT` 字符串。

在本次检查的当前一方资源——现代登录业务包、微博聊天业务包、`ssologin.js`、访客页 HTML 及其基础脚本——中，只有访客页未启用分支显式读取 `SRF`，没有任何 JavaScript 显式读取 `SRT`。这项“未发现”只能限定在已检查资源范围内，不能证明服务端不会读取它。

### 推断

- `SRF`／`SRT` 至少承担匿名访客状态的一部分，而不是账户专属的公开刷新凭证。当前访客网关又存在 `genvisitor2 → alt → sso/v2/login` 恢复链，因此它们也可能参与账户恢复；但静态资源和匿名响应都没有证明具体由哪个 Cookie 触发非空 `alt`。
- 当前活跃恢复链很可能把 Cookie 判定放在 `/visitor/genvisitor2` 服务端完成。`SRT` 为 HttpOnly，适合由同源请求自动携带并由服务端读取；这仍是协议结构推断，不是已经验证的 Cookie 语义。
- 由于活跃请求同时带 `tid`、`rid` 和设备检测结果，单独复制 `SRF`／`SRT` 或四字段 Cookie 不等价于复现浏览器恢复上下文。
- 即使访客恢复链能够在本地丢失 `.weibo.com` Cookie 后重建登录态，它也应称为“登录态恢复”或“自动重新登录”，不能在没有自然过期对照前称为“续期”。

### 未知

- `/visitor/genvisitor2` 返回非空 `alt` 的必要条件，以及 `SRF`、`SRT`、设备指纹和服务端会话分别承担什么作用。
- `SRT` 是否可重复使用、是否与设备绑定，以及它与 `.weibo.com` `SUB` 的自然过期时间关系。
- 在 `.weibo.com` Cookie 仅被本地删除、服务端 `SUB` 已自然过期、账号主动退出这三种情形下，访客恢复链的行为是否相同。
- `/sso/v2/login?source=visitor_restore&type=3` 成功后是否会稳定生成新的 `SUB`／`SUBP`，以及重启应用后业务接口是否仍返回无认证错误的预期账号数据。
- 一次隔离的登录态恢复实验等待扫码 300 秒后超时，没有获得新的登录上下文；因此尚未观察到已登录用户的 `visitor_gray` 返回非空 `alt`。
- 当前一方资源中没有证据表明存在可以提前调用、延长现有 `SUB` 服务端寿命的现代续期端点。

## 当前一方脚本验证

二维码页面实际加载 [新浪一方 `ssologin.js`](https://i.sso.sina.com.cn/js/ssologin.js)。下载并检查的脚本包含以下逻辑：

- `isUpdateCookieOnLoad=true`，初始化 10 秒后执行一次 `updateCookie()`。
- `autoUpdateCookieTime=1800`，之后每 30 分钟检查一次。
- `noActiveTime=7200`，在存在有效过期时间的前提下，剩余时间超过 2 小时时不更新。
- `getCookieExpireTime()` 从当前域 `SUBP` 解码结果的 `et` 字段读取时间。
- 缺少 `et` 时不请求 `updatetgt.php`。

登录后页面探针直接读取控制器，结果为：

```text
controller_present = true
controller_domain = sina.com.cn
decoded_SUBP_keys = [evid, flag, lt, nick, status, uid]
expire_type = undefined
updatetgt_observed_after_12s = false
```

这证明当前二维码登录生成的 `SUBP` 没有旧更新器需要的 `et`。等待几小时或几天不会让不存在的字段自动出现，因此“等到窗口再调用当前 `/renew`”不是可行方案。

## 破坏性链路复现

使用新扫码凭证对当前 `/renew` 做了认证对照：

1. 续期前请求受保护接口，返回 HTTP 200。
2. `/renew` 的四步请求均返回业务成功，接口自身返回 HTTP 200。
3. 续期 5 秒后同一受保护接口返回 HTTP 401。
4. 恢复续期前原四字段并重启，仍返回 HTTP 401。

四步响应的 `Set-Cookie` 只有：

- `.weibo.com`：`SSOLoginState`、`ALF`。
- `.weibo.cn`：`SSOLoginState`、`ALF`、`SUB=deleted`、`SUBP=deleted`。

没有新的 `.weibo.com` `SUB` 或 `SUBP`。因此，`ALF` 如何合并是独立缺陷，但不是这次失效的根因。

## 建议

### 当前应做

1. 禁用或删除 `/weibo/login/renew`，避免破坏仍有效的登录态。
2. 保留扫码获取四字段的现有业务流程。
3. 收到 HTTP 401 后重新扫码。
4. 将历史文档中的四步链改称“旧版 SSO Cookie 更新链”，不要描述为当前已验证的续期能力。

### 如果继续研究自动恢复或自然过期

1. 验证时优先克隆一次性持久浏览器 Profile；若使用 BrowserContext storage state，至少要保留带 Domain 属性的 Cookie 和 localStorage，并单独确认访客页依赖的 `tid` 等状态是否被完整还原。任何一种保存方式都只作为恢复实验输入，不能预设它一定能续期。
2. 不再把 `wbsso/login` 当作候选刷新端点；没有服务端签发的有效 `ticket` 时，不调用它。
3. 下一项最小验证应在克隆的一次性浏览器上下文中进行：保留 `.passport.weibo.com` 状态，只在克隆上下文中删除 `.weibo.com` 登录 Cookie，然后访问 `weibo.com`，观察 `visitor_gray` 是否得到非空 `alt`、是否进入 `sso/v2/login?source=visitor_restore`，以及受保护接口是否返回预期账号数据。
4. 上述实验只能证明“本地 Cookie 丢失后的恢复”。要声称“自然过期后自动续期”，还必须等待服务端自然过期或使用专门测试账号完成独立对照。
5. 成功标准必须包括：流程完成后等待至少 5 秒，以及重建浏览器上下文或重启应用后，受保护接口均返回预期账号数据；不能只检查 HTTP 200，还必须确认业务体没有 `error_code=21301` 或其他认证错误。
6. 未达到上述成功标准前，不把候选恢复流程暴露为 `/renew`。

## 安全与清理

- 所有探针只输出 Cookie 名称、Domain、过期差值和非秘密字段名，没有输出 Cookie 值。
- 一方资源追踪使用匿名请求；无效票据对照和匿名 `genvisitor2` 对照都没有携带真实 Cookie，也没有输出新 Cookie 的值。
- 一次性探针、下载的一方脚本副本和页面副本在验证后删除。
- 没有修改生产代码，也没有生成持久化登录凭证。
