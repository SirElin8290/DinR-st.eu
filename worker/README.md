# DinRöst backend

Cloudflare Worker + D1 scaffold for the production voting service.

## Implemented
- Server-side sessions with HttpOnly/Secure/SameSite cookies.
- Pseudonymous identity mapping: external identity subject -> keyed HMAC -> internal random user ID.
- 16+ gate.
- Separate profile store.
- One-person/one-vote enforcement via `vote_receipts`.
- Ballot table intentionally has no user ID or identity subject.
- Aggregated result endpoint with minimum-group suppression.
- Up to eight open questions returned by the API.
- Demographic/geographic aggregation hooks.
- Mock auth adapter isolated behind `AUTH_PROVIDER=mock`.

## Privacy boundary
`identities` proves uniqueness. `vote_receipts` proves that a user voted on a question. `ballots` stores the answer and aggregate dimensions but no user ID. This prevents ordinary application queries from directly mapping a ballot choice to an identity.

This is pseudonymisation, not mathematical anonymity: timestamps, rare demographic combinations, logs and privileged infrastructure access can still create re-identification risk. Production launch requires a DPIA, retention policy, access controls, log minimisation, penetration testing and legal review.

## Deploy
1. Create a Cloudflare D1 database named `dinrost-prod`.
2. Put its ID in `wrangler.toml`.
3. Apply `schema.sql` to the database.
4. Set `SESSION_SECRET` and `SUBJECT_HMAC_SECRET` as Worker secrets. Use independent high-entropy values.
5. Deploy the Worker and map it to an API hostname such as `api.dinrost.eu`.
6. Change `APP_ORIGIN` to the final production origin.
7. Point the frontend API client to the Worker.

## BankID activation
The current `/api/auth/mock` endpoint is only a development adapter. Production BankID must be implemented server-side using the exact contract, certificates/keys, RP requirements and personal-data fields agreed with the selected BankID integrator/acquirer. Never place BankID private keys, certificates, API secrets or raw identity identifiers in frontend JavaScript or this repository.

Activation should replace the mock adapter while keeping the rest of the identity/session/profile/voting API stable.

## Important
GitHub Pages cannot run this backend. The Worker and D1 database must be provisioned/deployed separately. Until that is done, the public GitHub Pages site remains a frontend prototype and must not claim that votes are centrally registered.
