# Backfill Blogger Blog Captured Content by time range

Status: ready-for-agent

## What to build

Add an explicit time-range backfill path for Blogger Blog entries. The operator supplies a convenient local date-time range, and the service divides it into valid upstream daily searches while preserving exact boundary seconds and the same Captured Content guarantees as incremental saving.

## Acceptance criteria

- [ ] `POST /post/range` requires uid, start, and end query parameters in `yyyy-MM-dd HH:mm:ss` format and parses them in `Asia/Shanghai`.
- [ ] Start and end are inclusive, equal timestamps are valid, and start later than end returns 400 without calling the upstream API.
- [ ] The range is split into daily upstream searches; the first and last day retain the operator's exact time, and upstream timestamps are sent in seconds.
- [ ] Each day pages until a successful empty list, and all normal, Long Text, and reposted Long Text entries are persisted through the same normalization and Captured Content rules.
- [ ] Existing entries are ignored rather than overwritten, and `SaveResult` reports fetched, inserted, and ignored counts across the whole range.
- [ ] A failure preserves already inserted entries and does not introduce a separate progress cursor; retrying the same range is idempotent and completes the missing content.
- [ ] Tests cover a single partial day, multiple days, exact inclusive boundaries, invalid ranges, upstream business failure, partial persistence, and retry.

## Blocked by

- [01](01-capture-latest-blogger-blog-page.md)

## Comments

