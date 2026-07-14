# Capture and browse the latest Blogger Blog page

Status: ready-for-agent

## What to build

Deliver the first end-to-end Captured Content path for Blogger Blog entries. A user can initialize the JPA-backed local database, save one blogger's latest upstream page, and browse the saved content without calling the upstream list API. Normal and Long Text entries, including reposted Long Text entries, are normalized into one complete local content shape. This slice establishes the shared SQLite and Spring Data JPA foundation used by later slices.

## Acceptance criteria

- [ ] Application startup idempotently creates all four PRD tables in configurable local SQLite storage using the configured community SQLite dialect, with Hibernate DDL generation disabled and Open EntityManager in View disabled.
- [ ] Blogger and Blogger Blog JPA entities explicitly map to the agreed schema, and Spring Data repositories encapsulate first-capture writes, cursor aggregation, filtering, sorting, and pagination without exposing EntityManager or query construction to the service.
- [ ] The upstream Blogger Blog response accepts every field required for author metadata, complete text, counters, images, video metadata, and reposted entries; the existing Long Text endpoint accepts a string identifier while remaining compatible with numeric strings.
- [ ] PostMapper is the only conversion entry point for the Blogger Blog domain: it converts API records, JPA entities, domain records/views, JSON columns, dates, and source HTML while reusing the configured ObjectMapper bean.
- [ ] PostService performs validation and workflow orchestration only; it does not copy fields, construct entities or views, encode JSON, parse upstream dates, strip HTML, or create ObjectMapper instances.
- [ ] On a missing or zero incremental cursor, `POST /post/incremental` fetches exactly the latest page, persists every valid entry on that page, refreshes the cursor through repository aggregation, and does not request a second page.
- [ ] Normal and Long Text content is persisted as complete HTML and complete plain text for both the current entry and its reposted entry; truncated text and long-text flags are not exposed by local queries.
- [ ] Re-fetching an existing remote identifier preserves its first Captured Content, while blogger metadata may refresh without overwriting the incremental cursor.
- [ ] `GET /post/bloggers` returns all local blogger metadata without exposing the cursor, ordered by updated time and uid descending.
- [ ] `GET /post/list` supports repeated optional uids, inclusive optional time bounds, page defaults, the size limit, stable ordering, and a total computed with the same filters; it reads SQLite only.
- [ ] Controller tests cover binding and response behavior, service tests mock APIs, PostMapper, and repositories, PostMapper tests cover conversion with the configured ObjectMapper, and repository tests use `@DataJpaTest` with a temporary real SQLite database.

## Blocked by

None - can start immediately

## Comments
