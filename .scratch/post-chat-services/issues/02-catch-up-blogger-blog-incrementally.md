# Catch up Blogger Blog Captured Content incrementally

Status: ready-for-agent

## What to build

Extend the Blogger Blog incremental save path so an operator who runs the tool infrequently still captures every new entry since the previously committed cursor. The implementation tolerates either upstream page ordering and makes partial progress safely retryable while retaining the JPA, PostMapper, and service boundaries established by the first slice.

## Acceptance criteria

- [ ] `POST /post/incremental` fixes the old maximum post identifier at the start of a run and does not move that comparison boundary while paging.
- [ ] Every fetched page is scanned completely, and every entry newer than the fixed boundary is saved regardless of whether the page is ordered old-to-new or new-to-old.
- [ ] A page containing the old boundary is fully processed before the run stops; another page is requested only when the entire current page is newer than the boundary.
- [ ] A successful empty page is a normal stop, while an upstream business failure or missing required response data is not treated as an empty page.
- [ ] Each successfully mapped batch is committed without wrapping the whole crawl in one transaction; a later API, Long Text, mapping, or database failure preserves Captured Content but leaves the old cursor unchanged.
- [ ] Retrying with the same uid uses repository first-capture semantics to skip existing entries, fill the remaining gap, and commit the new cursor only after a normal stop.
- [ ] SaveResult accurately reports fetched, inserted, and ignored entries without exposing the cursor.
- [ ] PostService remains orchestration-only, and all API/entity/domain conversion continues to pass through PostMapper using the shared ObjectMapper bean.
- [ ] Tests cover multiple pages, both page orderings, a mixed boundary page, an all-new page, failure in the middle of paging, repository failures, and idempotent retry.

## Blocked by

- [01](01-capture-latest-blogger-blog-page.md)

## Comments

