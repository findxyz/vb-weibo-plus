# Single-user local tool

This project is a single-user, locally-run tool: one operator drives one Weibo account's credentials, served by a local Spring Boot web app for manual invocation. No multi-tenant account isolation, no auth on the controllers, no concurrency isolation between accounts. Chosen because QR-code login requires a human scan, credentials live in a single `.weibo_cookie.txt`, and the spec has no multi-account concept. Reversing to multi-user would require account-scoped credential storage, controller auth, and concurrency isolation.
