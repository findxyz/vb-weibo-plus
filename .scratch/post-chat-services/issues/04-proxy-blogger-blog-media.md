# Proxy Blogger Blog media on demand

Status: ready-for-agent

## What to build

Add controlled Media Proxy access for images and video covers referenced by persisted Blogger Blog entries. Offline list queries return local relative proxy URLs, while each media request resolves a saved reference server-side and returns only the requested image bytes.

## Acceptance criteria

- [ ] Local Blogger Blog query views expose separate thumbnail and original dimensions plus correctly encoded local thumbnail, original, and video-cover URLs without exposing upstream URLs.
- [ ] `GET /post/image` resolves a saved mblog identifier and image pid from either the current entry or its reposted entry and supports only thumbnail and original variants.
- [ ] Original image references use the captured largest, original, then large fallback decision, while thumbnail requests use the captured thumbnail reference.
- [ ] `GET /post/video-cover` supports the current entry and the optional reposted-entry selector, and the query view retains the stable upstream video page URL for navigation.
- [ ] Media requests cannot supply an arbitrary upstream URL; a missing local entry or saved media reference returns 404, and an unsupported variant returns 400.
- [ ] Successful responses contain the image bytes and Content-Type only; other upstream headers are not forwarded, and a missing Content-Type becomes `application/octet-stream`.
- [ ] Credential failure returns 401, rate limiting returns 429, and an existing local reference whose upstream download fails or returns a non-success status returns 502.
- [ ] Video file bytes are never downloaded or proxied.
- [ ] Tests cover current and reposted media, every variant, local URL generation and encoding, response-header filtering, local errors, and upstream errors.

## Blocked by

- [01](01-capture-latest-blogger-blog-page.md)

## Comments

