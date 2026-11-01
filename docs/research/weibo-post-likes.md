# 微博正文点赞与取消点赞调研

调研日期：2026-10-31。

## 结论与范围

当前微博网页版使用 `POST https://weibo.com/ajax/statuses/setLike` 点赞，使用 `POST https://weibo.com/ajax/statuses/cancelLike` 取消点赞。基础参数为微博数字 ID，表单字段名是 `id`。一方页面用响应 JSON 根层的 `ok > 0` 判断成功，并修改 `attitudes_status` 与 `attitudes_count`。

用户已确认接入真实微博账号，支持点赞和取消；按钮只放在外层微博卡片，转发帖的按钮操作转发帖自身，不操作内嵌原文。进入可见区域时查询当前账号已赞状态与当前计数，同一轮阅读内滚动时避免重复查询；点击或重选博主时刷新可见微博的状态与计数，排除正在提交的操作。按后续确认的交互，点击立即切换本地状态与计数，不在写操作后追加查询或显示状态不一致提示，实际状态由下一次独立查询获取。完整范围见 `.scratch/post-likes/PRD.md`。

用户已确认沿用现有接口分层：前端请求本地 `/post` 接口，由 `PostController` 经 `PostService` 调用微博 API 适配层，再由 `WeiboHttpClient` 请求微博。本人已赞状态查询也遵循这条链路；不在 `/post/list` 中混入远程详情查询。`/weibo` 下的微博接口包装用于测试，不作为点赞功能的前端入口。仓库对应的接口文件是 `POST_API.http` 与 `WEIBO_API.http`，分别记录业务接口和微博接口测试入口。

本次只下载一方页面、脚本，并调用只读接口；未发送点赞、取消点赞或其他写请求。因此，接口路径、编码和客户端行为有静态证据，真实写入能否仅凭现有 Credential 与 XSRF 成功仍未验证。当前网页版还会附加设备检测参数，并处理验证码挑战。

## 一方来源

- [微博根页](https://weibo.com/)：携带现有 Credential 请求，返回当前页面入口，并下发 `XSRF-TOKEN`、`WBPSESS`。只记录名称，未记录值，也未改写项目凭证文件。
- [当前微博主包](https://h5.sinaimg.cn/m/weibo-pro-next/assets/index-CXp3N9A-.js)：根页实际引用的脚本。下载文本共 6,815,928 个字符，UTF-8 文本 SHA-256 为 `206ea85853c9c347454b5e3b93dd76547d05d09c61fd0b9c090500b65db53638`。
- [设备检测脚本](https://passport.sinaimg.cn/js/fp/1.3.2.umd.js)：根页引入，加载后调用 `window.wbBotDetector.load`。
- [验证加载器](https://js.t.sinajs.cn/static/validate-loader.umd.cjs)：根页引入，业务主包调用其验证码处理入口。
- [微博只读详情接口](https://weibo.com/ajax/statuses/show)：下文记录实际 GET 验证结果。

下列字符偏移从主包文本第 0 个字符起算，用于定位本次版本；包更新后可搜索对应函数名或端点。

## 点赞请求契约：静态证据

| 项目 | 观察结果 | 主包定位 |
| --- | --- | --- |
| 点赞 | `POST /ajax/statuses/setLike` | `feedLike`，字符偏移约 4,148,000；`setLike` 调用约 5,416,054 |
| 取消 | `POST /ajax/statuses/cancelLike` | 同上；`cancelLike` 调用约 5,416,233 |
| 基础参数 | `{id: n.id}`，其他入口使用 `{id: this.data.idstr}` | `feedLike`、`onClickLike` |
| 编码 | `application/x-www-form-urlencoded`，即 `id=<数字字符串>` | 全局 `axios.defaults.headers.post`，约 6,226,271；默认转换约 308,237 |
| 成功判据 | `response.data.ok > 0` | `feedLike`、`setLike`、`cancelLike` |
| 本人已赞 | `attitudes_status`，成功点赞置 `1`，取消置 `0` | 约 5,416,054 |
| 点赞计数 | `attitudes_count`，前端成功后自行加减 `1` | 同上 |

这里的 `response.data` 是 Axios 响应对象的 HTTP 响应体，不表示业务 JSON 存在额外一层 `data`。不能将 `HTTP 200` 单独当作点赞成功，也不能从这些客户端片段推断写响应会返回最新总赞数或完整微博对象。

外层微博与转发原文有独立数字 ID；主包 `feedLike` 按 `n.id` 分别修改外层对象或 `retweeted_status`。本次产品范围只使用外层对象的 ID。传输微博数字 ID 时应使用十进制字符串，避免 JavaScript 数值精度问题；不要把页面短码 `mblogid` 当作已验证的写参数。

部分信息流入口还会附带 `mark`、`rid`、`luicode`、`actLogScene`。另一个卡片入口只传 `{id}`，说明这些字段并非每个客户端调用点都会提供；这不能证明服务端在所有上下文中都不需要它们。

## Credential、XSRF 与风控

### XSRF 的观察结果

1. 携带项目现有四字段 Credential 对 `https://weibo.com/` 发起 GET，HTTP 返回 `200`，响应 Cookie 包含 `XSRF-TOKEN`、`WBPSESS`。
2. 主包的 Axios 默认配置是 `xsrfCookieName: "XSRF-TOKEN"`、`xsrfHeaderName: "X-XSRF-TOKEN"`，约在字符偏移 309,077。
3. 同源请求配置读取该 Cookie，解码后设置请求头，见 `resolveConfig$1`，约 318,000；Cookie 解码逻辑约 316,164。
4. 业务全局设置 `withCredentials = true`、`X-Requested-With: XMLHttpRequest`，以及 POST 表单编码，约 6,226,000。

因此，后端接入应考虑从网页 GET 响应获取辅助 Cookie，并使后续写请求携带匹配的 Cookie 和 XSRF 请求头。现有项目只保存四字段 Credential，不能假定已经具备该辅助状态。全站默认注入 XSRF 不等于本次已经证明点赞接口强制要求 XSRF；本次未做任何写请求对照。

### 设备检测参数与验证码

设备参数在全局 Axios **请求拦截器**中注入，而非每个点赞函数自行生成。主包约 6,226,763 的映射包含：

```js
"/ajax/statuses/setLike": "weibo-like"
```

命中映射且 `window.wbBotDetector.get` 存在时，拦截器调用：

```js
window.wbBotDetector.get({useCache: false, from: "weibo-like"})
```

仅当结果存在非空 `rid` 时，才将其放入表单字段 `fp`；没有检测器、没有 `rid` 或调用抛错时，客户端仍继续请求。映射不包含 `cancelLike`。这表明 `fp` 在客户端是条件附加项，不能据此断言服务端从不要求它。

根页加载设备检测脚本后调用 `load`，选项包含 `from: 'weibo_pc'`、`isTraceMouse: true`、`isTraceKeyboard: true`、`getTimeout: 2000`。本次只查看该调用，未分析、伪造或生成设备参数。

主包约 1,374,997 的 `getCaptchaType` 将 `error_code = 20062` 映射到 `yidun`，将 `20067` 映射到 `alitest`。全局 **响应错误拦截器**针对 POST 请求尝试 `getValidateResult`；成功时通过 `mergePostData` 合并验证结果与服务端 `validate` 数据，再重发原请求；失败或用户关闭时提示验证失败／取消验证。该代码是风控分支的存在证据，不代表已经在本账号或点赞接口触发过这些错误。

目前不能判断正式接入必须使用真实浏览器上下文。可先验证普通 HTTP 接入；若真实写请求要求验证码，应保留明确失败状态并引导用户处理，不伪装成功，不自动绕过验证。

## 查询本人已赞状态：只读实测

主包的详情页 `getWB` 调用 `GET /ajax/statuses/show`，参数为路由中的 `id`、`locale`，另带 `isGetLongText`。其他入口 `fetchWeibodata` 只传 `id`、`locale`，可在字符偏移约 6,096,248 定位。

使用本地数据库最新一条微博作为样本，分别传入其 `mblogid` 和其 `post_id` 的十进制字符串，调用：

```http
GET https://weibo.com/ajax/statuses/show?id=<标识符>&locale=zh-CN
```

两次均获得 HTTP `200`，响应业务 JSON 根对象均满足：

```json
{"ok": 1, "attitudes_status": 0, "attitudes_count": 2}
```

两次响应的 `idstr` 均与本地数字 ID 匹配，`mblogid` 均与本地短码匹配。正文、用户信息、标识符具体值及凭证均未写入调研记录。这验证了当前账号、当前样本可通过只读详情接口查询本人点赞状态，但不证明所有历史帖子、已删除帖子或其他可见性条件都能成功。

详情响应直接包含 `attitudes_status`，不是嵌套在业务 `data` 下。不能用 `attitudes_count > 0` 推断本人已赞；查询失败或字段缺失时也不能当作未点赞。

本次主包中未找到 `/ajax/statuses/batch` 或 `/ajax/statuses/attitude` 端点字符串，只能把逐条详情 GET 作为已有证据支持的方案，不能宣称已找到批量已赞状态查询。是否在可见范围按需查询、缓存多久、刷新时机是什么，属于后续实现选择。普通本地微博列表与 View Refresh 仍应遵守现有领域定义，不因增加点赞而隐式变成远程内容刷新。

## 尚待验证

- 使用现有 Credential、网页 GET 得到的辅助 Cookie 和 XSRF 请求头，能否成功完成真实点赞与取消；未验证 `fp` 在本账号的实际要求。
- 写接口完整成功／失败响应、重复点赞／重复取消的行为、服务端限流以及验证码触发条件。
- 请求超时但服务端可能已处理时的实际结果。当前交互保留点击后的本地显示，不自动核对，直到下一次独立查询再读取实际状态。
- 登录账号变更后本人已赞状态的归属和缓存失效；不可将上一账号的状态继承给新账号。

这些未知项不应由静态脚本推断成已验证契约；实现测试可先覆盖错误传播与状态一致性，真实写验证需要选定具体目标微博。
