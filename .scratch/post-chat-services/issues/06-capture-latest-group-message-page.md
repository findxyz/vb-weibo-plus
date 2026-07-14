# Capture and browse the latest Group Message page

Status: ready-for-agent

## What to build

Deliver the first end-to-end Captured Content path for Group Messages. A user can save a group's latest upstream page using only its gid and browse the saved messages and group metadata offline. The JPA mapping remains compatible with the agreed future weibogroup import mapping.

## Acceptance criteria

- [ ] The Group Message JPA entity explicitly maps numeric mids, string media identifiers, structured JSON fields, first-capture timestamps, and the agreed query index; MessageRepository encapsulates first-capture writes, group-range aggregation, filtering, sorting, and pagination.
- [ ] The upstream Group Message response accepts sender data, string fids, annotations, link and picture structures, templates, and recall data; `result=false` or a missing required structure maps to 502 rather than an empty page.
- [ ] MessageMapper is the only group-chat-domain conversion entry point for upstream messages, MessageEntity, MessageRecord/View, message type names, JSON columns, timestamps, and local media URL placeholders, and it reuses the configured ObjectMapper bean.
- [ ] On a missing or zero group cursor, `POST /chat/incremental` fetches exactly the latest page, persists every displayable message on that page, refreshes the group range through repository aggregation, and does not request a second page.
- [ ] Saving messages requires only gid; when group metadata is absent, a gid-only placeholder group is created without calling the group-list API.
- [ ] Repository first-capture persistence never overwrites an existing mid, and message types 332 and 9999 are ignored while still contributing to fetched and ignored counts.
- [ ] Known message-type names follow the agreed mapping, and unknown values are returned as `未知(<msg_type>)`.
- [ ] `GET /chat/messages` supports required gid, inclusive optional time bounds, page defaults, the size limit, stable ordering, and total count; it reads SQLite only and returns group metadata once at the top level.
- [ ] ChatService performs validation and workflow orchestration only; it does not copy fields, construct entities or views, handle JSON, or create ObjectMapper instances.
- [ ] Controller and service tests cover the first-page behavior and API contract, MessageMapper tests use the configured ObjectMapper, and `@DataJpaTest` repository tests use a temporary real SQLite database.

## Blocked by

- [05](05-sync-local-group-metadata.md)

## Comments

