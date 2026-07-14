# Catch up Blogger Blog Captured Content incrementally

Status: ready-for-agent

## What to build

Extend the Blogger Blog incremental save path so an operator who runs the tool infrequently still captures every new entry since the previously committed cursor. The implementation must tolerate either upstream page ordering and must make partial progress safely retryable.

## Acceptance criteria

- [ ] `POST /post/incremental` fixes the old maximum post identifier at the start of a run and does not move that boundary while paging.
- [ ] Every fetched page is scanned completely, and every entry newer than the fixed boundary is saved regardless of whether that page is ordered old-to-new or new-to-old.
- [ ] A page containing the old boundary is fully processed before the run stops; another page is requested only when the entire current page is newer than the boundary.
- [ ] A successful empty page is a normal stop, while an upstream business failure or missing required response data is not treated as an empty page.
- [ ] Successfully inserted entries survive a later API, Long Text, mapping, or database failure, but the old cursor remains unchanged.
- [ ] Retrying with the same uid skips existing Captured Content, fills the remaining gap, and commits the new cursor only after a normal stop.
- [ ] `SaveResult` accurately reports fetched, inserted, and ignored entries without exposing the cursor.
- [ ] Tests cover multiple pages, both page orderings, a mixed boundary page, an all-new page, failure in the middle of paging, and idempotent retry.

## Blocked by

- [01](01-capture-latest-blogger-blog-page.md)

## Comments

