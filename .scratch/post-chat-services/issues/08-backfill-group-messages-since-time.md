# Backfill Group Message Captured Content since time

Status: ready-for-agent

## What to build

Add an explicit Group Message history backfill path. The operator supplies an inclusive local time lower bound and may supply the mid before which paging should begin. The service follows the upstream cursor until the requested time boundary or a successful empty page.

## Acceptance criteria

- [ ] `POST /chat/since` requires gid and sinceTime query parameters, accepts optional beforeMid, and does not accept a JSON request body.
- [ ] sinceTime uses `yyyy-MM-dd HH:mm:ss` in `Asia/Shanghai`, is inclusive, and is compared against persisted millisecond message times.
- [ ] Omitting beforeMid starts from the newest page; supplying it requests messages older than that mid without the service silently choosing another starting cursor.
- [ ] There is no artificial page limit, and each old-to-new page is traversed new-to-old until a message older than sinceTime or a successful empty page is reached.
- [ ] Existing mids are ignored rather than overwritten, and `SaveResult` aggregates fetched, inserted, and ignored counts across all pages.
- [ ] Successfully inserted messages remain after a later failure; no separate progress cursor is committed, and retrying the same parameters is idempotent.
- [ ] Upstream business failure is surfaced and never refreshes the group range as though it were a successful empty page.
- [ ] Tests cover newest and explicit starting points, exact time equality, multiple pages, empty completion, time-boundary completion, partial failure, and retry.

## Blocked by

- [06](06-capture-latest-group-message-page.md)

## Comments

