# Sync and browse local group metadata

Status: ready-for-agent

## What to build

Deliver an end-to-end local group metadata path on the shared JPA foundation. The operator can explicitly synchronize the upstream group list into SQLite and later browse all local groups without using the upstream group-list endpoint. Existing placeholder groups and Group Message cursors survive metadata refreshes.

## Acceptance criteria

- [ ] The group JPA entity explicitly maps to the agreed schema, and GroupRepository encapsulates metadata updates, cursor preservation, stable ordering, and placeholder lookup.
- [ ] The upstream group response accepts administrators, summary, and every field required by the local group record.
- [ ] MessageMapper is the single group-chat-domain conversion entry point for upstream group records, GroupEntity, GroupRecord, and administrators JSON, and it reuses the configured ObjectMapper bean.
- [ ] `POST /chat/groups/sync` takes no request body or query parameters, calls the upstream group-list API, updates every returned group, and returns the complete local group list.
- [ ] Existing group rows update metadata and updated time while preserving creation time and both Group Message cursors; new rows receive creation and updated times.
- [ ] A missing required contacts structure is mapped to 502 and does not delete, clear, or partially replace existing local group data.
- [ ] `GET /chat/groups` reads SQLite only, returns all local groups without pagination or internal cursors, includes gid-only placeholder rows, and orders by updated time and gid descending.
- [ ] ChatService orchestrates synchronization and querying without copying fields, constructing entities or records, handling JSON, or creating ObjectMapper instances.
- [ ] Controller and service tests cover insertion, refresh, cursor preservation, placeholder output, stable ordering, and upstream failure; mapper and `@DataJpaTest` repository tests cover conversion and real SQLite persistence separately.

## Blocked by

- [01](01-capture-latest-blogger-blog-page.md)

## Comments

