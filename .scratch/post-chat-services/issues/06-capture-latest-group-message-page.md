# Capture and browse the latest Group Message page

Status: ready-for-agent

## What to build

Deliver the first end-to-end Captured Content path for Group Messages. A user can save a group's latest upstream page using only its gid and browse the saved messages and group metadata offline. The persisted schema must remain compatible with the agreed future weibogroup import mapping.

## Acceptance criteria

- [ ] Application startup idempotently creates Group Message persistence with numeric mid ordering, string media identifiers, structured message fields, first-capture timestamps, and the agreed query index.
- [ ] The upstream Group Message response accepts sender data, string fids, annotations, link and picture structures, templates, and recall data; an upstream `result=false` or missing required structure maps to 502 rather than an empty page.
- [ ] On a missing or zero group cursor, `POST /chat/incremental` fetches exactly the latest page, persists every displayable message on that page, refreshes the group range, and does not request a second page.
- [ ] Saving messages requires only gid; when group metadata is absent, a gid-only placeholder group is created without calling the group-list API.
- [ ] The same mid is never overwritten, and message types 332 and 9999 are ignored while still contributing to fetched and ignored counts.
- [ ] Known message-type names follow the agreed mapping, and unknown values are returned as `未知(<msg_type>)`.
- [ ] `GET /chat/messages` supports required gid, inclusive optional time bounds, page defaults, the size limit, stable ordering, and total count; it reads SQLite only and returns group metadata once at the top level.
- [ ] Query views expose displayable message structures and empty media-proxy URL fields until the Group Message Media Proxy slice, without exposing string fid or upstream media URLs.
- [ ] The target schema and mapping tests accept numeric nonzero weibogroup mids, string fids, JSON structures, and video cover identifiers while rejecting an invalid mid instead of coercing it to zero.
- [ ] Tests cover the first page, placeholder group behavior, filtered types, first-capture idempotency, query filters and pagination, representative JSON fixtures, and real SQLite mapping.

## Blocked by

- [05](05-sync-local-group-metadata.md)

## Comments

