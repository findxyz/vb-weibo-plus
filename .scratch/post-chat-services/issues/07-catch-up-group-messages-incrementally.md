# Catch up Group Message Captured Content incrementally

Status: ready-for-agent

## What to build

Extend Group Message incremental saving so an operator who runs the tool infrequently captures every new message since the previously committed maximum mid. The upstream page order and pagination cursor are handled explicitly, and an interrupted run is safely retryable.

## Acceptance criteria

- [ ] `POST /chat/incremental` fixes the old maximum mid at the start of a run and does not change the comparison boundary while paging.
- [ ] Each upstream page is treated as old-to-new, traversed new-to-old, and every message newer than the fixed boundary is persisted before stopping at the boundary.
- [ ] When an entire page is newer than the boundary, the page's oldest mid is used to request the next older page.
- [ ] A successful empty page is a normal stop, while `result=false` or a missing required response structure is not treated as an empty page.
- [ ] Each successfully mapped batch is committed without wrapping the whole crawl in one transaction; a later API, mapping, or database failure preserves Captured Content but leaves the old group cursors unchanged.
- [ ] Retrying with the same gid uses repository first-capture semantics to ignore existing messages, fill the remaining gap, and refresh the minimum and maximum mids only after a normal stop.
- [ ] SaveResult includes correct fetched, inserted, and ignored counts for saved, duplicate, boundary, and filtered messages without exposing cursors.
- [ ] ChatService remains orchestration-only, and all API/entity/domain conversion continues through MessageMapper with the shared ObjectMapper bean.
- [ ] Tests cover multiple pages, a mixed boundary page, an all-new page, the oldest-mid pagination request, filtered messages, failure during paging, repository failure, and idempotent retry.

## Blocked by

- [06](06-capture-latest-group-message-page.md)

## Comments

