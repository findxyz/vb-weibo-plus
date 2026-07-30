# vb-weibo-plus

A single-user, locally-run tool that drives one Weibo account's web credentials via a local Spring Boot web app. The operator QR-scans to log in, then manually invokes Weibo Web/API endpoints through HTTP controllers.

## 前置条件

安装与配置见 [README.md](README.md)。

## Language

**Credential**:
The four cookies (SUB/SUBP/SSOLoginState/ALF) obtained from QR login. SUB/SUBP are the unique login tokens; SSOLoginState and ALF are timestamps obtained at QR login.
_Avoid_: cookie, token, session

**Blogger Blog**:
A blogger's Weibo post list identified by uid, fetched via incremental pagination (since_id) or time-range (starttime/endtime).
_Avoid_: mymblog, statuses

**Long Text**:
The full content of a Blogger Blog entry whose isLongText is true, fetched separately by the post's numeric id.
_Avoid_: longtextContent

**Group Message**:
A message in a Weibo group chat identified by gid, paginated by max_mid (oldest-first). Types include text, image, video, link share, animated emoji.
_Avoid_: query_messages

**Historical Browse**:
An independently navigated, read-only view of locally captured Group Messages. It neither follows nor affects the current conversation view.
_Avoid_: live history, synchronized history

**Media Proxy**:
Media bytes fetched on demand through controlled local proxy endpoints while the Weibo API and current Credential are available. List queries remain local-only and return relative proxy URLs; media bytes are streamed separately, are not archived, and are not guaranteed to be available offline.
_Avoid_: media enrichment, offline media, media archive, media cache

**Captured Content**:
The first persisted version of a Blogger Blog entry or Group Message. Fetching the same remote identifier again does not overwrite its content, while Blogger and group metadata may be refreshed.
_Avoid_: latest state, synchronized copy, revision history

**Background Capture**:
The scheduled process that pulls new Weibo content into the local database without being initiated by the browser UI.
_Avoid_: page refresh, UI sync, polling

**View Refresh**:
Re-reading local data so the browser UI reflects newly captured content. It never calls Weibo or starts Background Capture.
_Avoid_: sync, capture, remote refresh
