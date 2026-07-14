# Catch up Group Message Captured Content incrementally

Status: ready-for-agent

## What to build

Extend Group Message incremental saving so an operator who runs the tool infrequently captures every new message since the previously committed maximum mid. The upstream page order and pagination cursor must be handled explicitly, and an interrupted run must be safely retryable.

## Acceptance criteria

- [ ] `POST /chat/incremental` fixes the old maximum mid at the start of a run and does not change the comparison boundary while paging.
- [ ] Each upstream page is treated as old-to-new, traversed new-to-old, and every message newer than the fixed boundary is persisted before stopping at the boundary.
- [ ] When an entire page is newer than the boundary, the page's oldest mid is used to request the next older page.
- [ ] A successful empty page is a normal stop, while `result=false` or a missing required response structure is not treated as an empty page.
- [ ] Successfully inserted messages survive a later API, mapping, or database failure, but the old group cursors remain unchanged.
- [ ] Retrying with the same gid ignores existing Captured Content, fills the remaining gap, and refreshes the minimum and maximum mids only after a normal stop.
- [ ] `SaveResult` includes correct fetched, inserted, and ignored counts for saved, duplicate, boundary, and filtered messages without exposing cursors.
- [ ] Tests cover multiple pages, a mixed boundary page, an all-new page, the oldest-mid pagination request, filtered messages, failure during paging, and idempotent retry.

## Blocked by

- [06](06-capture-latest-group-message-page.md)

## Comments

