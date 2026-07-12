# vb-weibo-plus

A single-user, locally-run tool that drives one Weibo account's web credentials via a local Spring Boot web app. The operator QR-scans to log in, then manually invokes Weibo Web/API endpoints through HTTP controllers.

## Language

**Credential**:
The four cookies (SUB/SUBP/SSOLoginState/ALF) obtained from QR login. SUB/SUBP are the unique login tokens (never refreshed by renewal); SSOLoginState and ALF are timestamps refreshed by the renewal chain.
_Avoid_: cookie, token, session

**Renewal**:
The four-step chain (updatetgt -> crossdomain -> refresh passport.weibo.com -> refresh passport.weibo.cn) that refreshes SSOLoginState/ALF on the .weibo.com domain while keeping SUB/SUBP unchanged.
_Avoid_: refresh, keepalive

**Blogger Blog**:
A blogger's Weibo post list identified by uid, fetched via incremental pagination (since_id) or time-range (starttime/endtime).
_Avoid_: mymblog, statuses

**Long Text**:
The full content of a Blogger Blog entry whose isLongText is true, fetched separately by the post's numeric id.
_Avoid_: longtextContent

**Group Message**:
A message in a Weibo group chat identified by gid, paginated by max_mid (oldest-first). Types include text, image, video, link share, animated emoji.
_Avoid_: query_messages
