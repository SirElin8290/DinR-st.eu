# DinRöst backend

Cloudflare Worker + two D1 databases, with registration, email confirmation,
passwordless login, private sessions and the versioned research archive.

## Current deployment

- Site/API: https://dinrost-api.soren-johansson-7.workers.dev
- AUTH_DB: dinrost-auth-prod, EU jurisdiction.
- DB: dinrost-research-prod, EU jurisdiction.
- Registration, email delivery and opinion collection are deliberately disabled.
- No actual outbound email has been tested; the sending address/provider remains to be connected.

Full implementation, security boundaries and mail setup:
[docs/authentication.md](../docs/authentication.md).
Research model and exports:
[docs/research-architecture.md](../docs/research-architecture.md).

## Commands

Node 24 and Wrangler are required.

```text
npm test
npm run build
npm run db:auth:migrate
npm run db:research:migrate
npm run deploy
```

The migration commands operate remotely. Use only against the explicitly configured
DinRöst databases. Original schema.sql and seed.sql are historical scaffold files;
the deployed service uses auth-migrations/ and migrations/ instead. Do not seed
synthetic questions, identities or responses into production.

Secrets are configured separately in Cloudflare. No credentials belong in Git or
public-config.js. Do not rotate the data/HMAC keys during a normal redeployment.
MAIL_PROVIDER stays disabled until a verified sender and its API credentials are
configured. Real registration additionally requires a reviewed, non-draft account
privacy version. Account email verification is not identity verification or
consent to political-opinion processing.

GitHub Pages remains an open public frontend. Authenticated work uses the Worker
origin so that HttpOnly cookies are first-party rather than third-party cookies.
