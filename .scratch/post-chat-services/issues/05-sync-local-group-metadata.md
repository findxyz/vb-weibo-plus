# Sync and browse local group metadata

Status: ready-for-agent

## What to build

Deliver an end-to-end local group metadata path. The operator can explicitly synchronize the upstream group list into SQLite and can later browse all local groups without using the upstream group-list endpoint. Existing placeholder groups and Group Message cursors must survive metadata refreshes.

## Acceptance criteria

- [ ] Application startup idempotently creates the local group metadata persistence without disturbing the existing Blogger Blog tables.
- [ ] The upstream group response accepts administrators, summary, and every field required by the local group record.
- [ ] `POST /chat/groups/sync` takes no request body or query parameters, calls the upstream group-list API, upserts every returned group, and returns the complete local group list.
- [ ] Existing group rows update metadata and updated time while preserving creation time and both Group Message cursors; new rows receive creation and updated times.
- [ ] A missing required contacts structure is mapped to 502 and does not delete, clear, or partially replace existing local group data.
- [ ] `GET /chat/groups` reads SQLite only, returns all local groups without pagination or internal cursors, includes gid-only placeholder rows, and orders by updated time and gid descending.
- [ ] Group records expose gid, name, avatar, member limits, owner, administrators, summary, group type, creation time, and updated time with default values for missing metadata.
- [ ] Controller and service tests cover insertion, refresh, cursor preservation, placeholder output, stable ordering, upstream failure, and the single-connection SQLite setup.

## Blocked by

- [01](01-capture-latest-blogger-blog-page.md) for the shared SQLite and JDBC foundation

## Comments

