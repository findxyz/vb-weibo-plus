# Capture and browse the latest Blogger Blog page

Status: ready-for-agent

## What to build

Deliver the first end-to-end Captured Content path for Blogger Blog entries. A user can initialize the local database, save one blogger's latest upstream page, and browse the saved content without calling the upstream list API. Normal and Long Text entries, including a reposted Long Text entry, must be normalized into one complete local content shape. This slice establishes the shared SQLite and JDBC testing foundation used by later slices.

## Acceptance criteria

- [ ] Application startup idempotently creates the local SQLite persistence required for blogger metadata and Blogger Blog entries, and the database location remains configurable.
- [ ] The upstream Blogger Blog response accepts all fields required for author metadata, complete text, counters, images, video metadata, and reposted entries; the existing Long Text endpoint accepts a string identifier while remaining compatible with numeric strings.
- [ ] On a missing or zero incremental cursor, `POST /post/incremental` fetches exactly the latest page, persists every valid entry on that page, refreshes the cursor, and does not request a second page.
- [ ] Normal text and Long Text are persisted as complete HTML and complete plain text for both the current entry and its reposted entry; truncated text and long-text flags are not exposed by local queries.
- [ ] The source field is stored as displayable plain text, and upstream publication dates are parsed with the English date format and their supplied timezone offset.
- [ ] Re-fetching an existing remote identifier preserves its first Captured Content, while blogger metadata may refresh without overwriting the incremental cursor.
- [ ] `GET /post/bloggers` returns all local blogger metadata without exposing the cursor, ordered by updated time and uid descending.
- [ ] `GET /post/list` supports repeated optional uids, inclusive optional time bounds, page defaults, the size limit, stable ordering, and a total computed with the same filters; it reads SQLite only.
- [ ] SaveResult and query response fields match the PRD, with media-proxy URL fields empty until the Media Proxy slice is implemented.
- [ ] Controller tests and service tests cover the successful first-page path, validation, JSON mapping, real SQL, row mapping, and a single-connection in-memory SQLite database.

## Blocked by

None - can start immediately

## Comments
