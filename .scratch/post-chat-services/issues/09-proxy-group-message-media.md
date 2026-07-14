# Proxy Group Message media on demand

Status: ready-for-agent

## What to build

Add controlled Media Proxy access for image previews, image originals, and video covers referenced by persisted Group Messages. Media identifiers remain strings end-to-end, including nonnumeric identifiers, and the group media request uses the endpoint-specific origin and referer headers.

## Acceptance criteria

- [ ] MessageMapper turns persisted media references into correctly encoded local preview and original URLs according to media capability, without exposing upstream fid values or media URLs.
- [ ] `GET /chat/media` supports preview and original variants; image preview requests the compressed image, image original requests the original image, and a video preview requests only the saved cover identifier.
- [ ] Video original and unsupported message/variant combinations return 400, while a missing local message, gid mismatch, or missing saved media reference returns 404.
- [ ] The group media request and the existing raw group-media endpoint accept string fid values, including values such as `5302496155143676_file`, while preserving numeric-string compatibility.
- [ ] The upstream request query contains string fid, fixed source, and optional imageType only; Origin is not sent as a query parameter.
- [ ] The group media request uses `Origin: https://web.im.weibo.com`, `Referer: https://web.im.weibo.com/`, and the current Credential.
- [ ] MessageMapper converts successful upstream media responses into MediaBinary; ChatService only selects the saved reference and orchestrates the download.
- [ ] Successful responses contain image bytes and Content-Type only; other upstream response headers are not forwarded, and a missing Content-Type becomes `application/octet-stream`.
- [ ] Credential failure returns 401, rate limiting returns 429, and an existing local reference whose upstream request fails or returns a non-success status returns 502.
- [ ] Video file bytes are never downloaded or proxied.
- [ ] Tests cover nonnumeric fid serialization and JPA persistence, every supported variant, generated local URLs, mapper conversion, header and query construction, response-header filtering, local errors, and upstream errors.

## Blocked by

- [06](06-capture-latest-group-message-page.md)

## Comments

