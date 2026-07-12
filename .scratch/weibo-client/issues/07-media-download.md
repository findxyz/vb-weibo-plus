Status: ready-for-agent

## What to build

媒体下载端到端：群聊媒体（图片/视频/视频封面）走 fid + msget 接口；图床与视频流走直链 URL。用户调 `GET /weibo/group/media` 下载群聊媒体，调 `GET /weibo/media/image?url=` 或 `GET /weibo/media/video?url=` 下载直链。

具体范围：
- GroupMediaRequest record{Long fid, String imageType} + toParams()：fid、source=209678993、imageType（为空则不传，仅图片消息传 origin/compress）、Origin=https://web.im.weibo.com
- GroupMediaApi（@Component）：调 client.getForBytes("https://upload.api.weibo.com/2/mss/msget", request.toParams(), WeiboConstants.HEADERS_MSGET, true)，返回 ResponseEntity<byte[]>
- DirectMediaApi（@Component）：调 client.getForBytes(url, Map.of(), WeiboConstants.HEADERS_DIRECT, false)，返回 ResponseEntity<byte[]>。图床与视频共用
- WeiboGroupController 增 GET /media（透传 Content-Type、Content-Disposition）
- WeiboMediaController（@RestController，@RequestMapping("/weibo/media")）：GET /image?url=、GET /video?url=

## Acceptance criteria

- [ ] GET /weibo/group/media?fid=&imageType=origin 返回图片二进制（Content-Type: image/jpeg 或 image/png）
- [ ] GET /weibo/group/media?fid= 返回视频二进制（Content-Type: video/mpeg4）
- [ ] imageType 不传时不出现在 query string（视频封面图场景）
- [ ] GET /weibo/media/image?url=https://wx2.sinaimg.cn/... 返回图片二进制
- [ ] GET /weibo/media/video?url=http://f.video.weibocdn.com/... 返回视频二进制
- [ ] 群聊媒体请求带 MSGET header 组（Referer + Origin 均为 web.im.weibo.com）+ Cookie
- [ ] 直链请求带 DIRECT header 组（仅 UA + Referer: weibo.com），不带 Cookie
- [ ] 二进制响应不被 21301 判定误伤（getForBytes 不检查 body）
- [ ] Content-Type 透传原始响应的值

## Blocked by

- 03-weibo-http-client-core
