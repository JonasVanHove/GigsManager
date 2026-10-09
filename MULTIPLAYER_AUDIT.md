# Multiplayer and QR Invite Audit

## Scope

Reviewed the QR invite preview, generation, rotation, join route, band-member storage, gig-member links, client invite modal, and bearer-token helper.

## Architecture and source of truth

The identity chain is `Supabase JWT sub -> User.supabaseId -> User.id`. A band owner is stored in `bands.userId`. The current schema does not have a relational band-membership table: membership is represented by `BandMember.userId` plus the denormalized `BandMember.bands` string array. Shared gig visibility is derived from `GigBandMember.bandMemberId -> BandMember.userId`, while several permission and band-list queries still use band names.

The QR flow is: `BandInviteModal` creates a link, `/join` previews and posts the code, the server resolves `bands.inviteCode`, and `/api/bands/join` creates or updates a `BandMember` and upserts `GigBandMember` rows. The account-scoped `/api/band-members` endpoint remains the source for personal member-management data. The new `/api/bands/[id]/members` endpoint is the canonical band-scoped roster used by `BandsTab`, so independent sessions query the same band identity rather than filtering their own account rows.

No RLS policies were found for the Prisma application tables. Authorization is enforced in route code. The only discovered RLS policies are Supabase storage policies for song attachments.

## Findings and fixes

### High: QR routes trusted an unverified JWT subject

**Root cause:** `getUserIdFromHeader` decoded the middle JWT segment and returned `sub` without checking the signature, issuer, audience, or expiry. An attacker could forge a token naming another Supabase user and invoke invite or join routes.

**Fix:** QR preview, generation, rotation, and join now call `getVerifiedUserIdFromHeader`, which delegates token verification to `supabaseAdmin.auth.getUser`. Keep the old decoder out of write-capable routes and migrate remaining routes to `requireAuth` or the verified helper.

**Tests:** `test/auth-helpers.test.ts` covers missing, valid, forged, invalid-signature, and expired tokens.

### High: Join writes were not atomic

**Root cause:** Member creation/update and `GigBandMember` upserts were separate database operations. A timeout or process failure between them could leave a member visible without shared gigs, or only some gigs linked.

**Fix:** The join mutation now runs inside one Prisma interactive transaction. The composite unique constraint on `(gigId, bandMemberId)` and `upsert` make replay safe.

**Tests:** `test/multiplayer-audit.test.ts` covers repeated joins and two distinct sessions running at the same time.

### High: Concurrent first requests raced while creating the application user

**Evidence:** The real local three-context E2E initially logged a unique `User.supabaseId` violation while Account A/B/C loaded the dashboard concurrently. `getOrCreateUser` used `findUnique` followed by `create`.

**Fix:** `getOrCreateUser` now uses Prisma `upsert`, preserving the verified Supabase subject as the unique identity and eliminating the check-then-act race.

**Tests:** `test/get-or-create-user.test.ts` asserts the atomic upsert contract. The real E2E passed after the fix.

### High: Broader band and gig APIs accepted decoded JWT subjects

**Evidence:** `/api/bands` used `getUserIdFromHeader`, which only decoded a JWT payload. `/api/gigs` had a separate decode-first fast path and called `getOrCreateUser` using the unverified subject. This was independent of the QR route and could produce cross-account reads or writes through adjacent workflows.

**Fix:** `/api/bands` now uses `getVerifiedUserIdFromHeader`. `/api/gigs` now always calls Supabase `auth.getUser` before resolving the application user; the decode-only path was removed.

**Status:** Implemented and type-checked. The helper tests prove invalid credentials are rejected; a full route test for `/api/gigs` is still a worthwhile addition because that route has a large dynamic-import surface.

### High: Band cards rendered an account-scoped projection as a band roster

**Evidence:** `/api/band-members` filters `where: { userId }`, but `BandsTab` filtered that result by band name and displayed it as the roster. A joined user therefore saw their own rows, while the owner saw rows owned by the owner; neither response represented the same canonical band roster. The component also added a synthetic `current-user` object in client state.

**Fix:** Added `GET /api/bands/[id]/members`, authorizing the viewer against the requested band and querying all `BandMember` rows containing that band name. `BandsTab` now loads and renders this band-scoped response, retaining the legacy endpoint only for personal management data and a loading fallback.

**Tests:** `test/band-roster-route.test.ts` proves non-members are denied and that a band roster returns stable member IDs independent of viewer identity.

### Medium: Join could attach a band to an unrelated first member row

**Evidence:** The original join query used `findFirst({ where: { userId } })`, ordered by creation time, without the target band. Users with multiple member rows could have the new band appended to whichever row happened to be oldest.

**Fix:** Join now searches for the authenticated user's member row with `bands has band.name`. If no row exists, it claims an unclaimed email-matched member for that band before creating a new row. This preserves the intended existing invitation identity and avoids arbitrary row selection.

**Tests:** `test/multiplayer-audit.test.ts` asserts the target-band filter and canonical create path.

### High: Repeated joins could violate the existing member identity constraint

**Evidence:** A repeat of the real local E2E after a prior successful run caused `P2002` on `BandMember(userId, name)`: Account B already had a member row for another band, and join attempted to create another row with the same account/name.

**Fix:** Join now reuses the authenticated user's existing same-name member identity after checking the target band and email invitation, then appends only the target band name. It creates a row only when no compatible identity exists.

**Tests:** The repeated local two-account E2E passed after this fix, and the join transaction regressions remain in `test/multiplayer-audit.test.ts`.

### High: Shared gig edits exposed two cross-account consistency defects

**Evidence:** The expanded local three-account E2E found that gig creation wrote an invalidation marker without deleting the actual `gigs:${userId}:...` cache entries. It then found that editing a gig replaced all `GigBandMember` rows with the editor's account-scoped selection, removing the other member's access. Finally, refetches did not bypass the server cache even when the client requested fresh data.

**Fix:** Gig mutations now invalidate the actual shared `gigs:` cache prefix. Gig roster edits replace only links owned by the editing account and preserve other accounts' links. `/api/gigs` bypasses its in-memory cache for explicit `Cache-Control: no-cache/no-store` requests.

**Tests:** `e2e/multiplayer-two-account.spec.ts` now creates a gig through Account A, verifies Account B sees it, updates venue data through A, verifies B's fresh API payload and rendered card, and verifies Account C sees neither band nor gig. `test/gig-route-isolation.test.ts` covers direct foreign gig reads, updates, and deletes.

### High: Invite codes are bearer credentials with a small search space

**Root cause:** A six-character code from 32 symbols has about 30 bits of entropy. There is no expiry, attempt limit, redemption record, or rate limit on preview/join requests. Anyone who photographs the QR can use it until rotation.

**Recommended fix:** Add `expiresAt`, `revokedAt`, and a hashed token or a longer random token to a dedicated `BandInvite` table. Enforce a per-IP and per-account rate limit on preview and join, return the same generic failure for unknown and expired tokens, and optionally require owner approval for first-time joins. Keep rotation as revocation, and never log raw tokens.

### Medium: Invite issuance and membership authorization are inconsistent

**Root cause:** The invite endpoint lets a current member read an existing code, while the regenerate route checks leadership. This is intentional sharing behavior but means every member can distribute a bearer credential. Membership is represented by a band-name string in `BandMember.bands`, so renaming a band can orphan or collide with access checks.

**Recommended fix:** Replace name arrays with a relational `BandMembership` table containing `bandId`, `userId`, role, status, and timestamps. Check membership by band id, enforce owner/leader policy centrally, and make the policy explicit: leaders only may mint, members may view, or leaders only may both mint and view.

### Medium: Concurrent member creation still needs a stronger invariant

**Root cause:** `findFirst({ userId })` followed by `create` is a check-then-act sequence. The current composite uniqueness `(userId, name)` prevents one common duplicate but does not guarantee one member row per user, and a retry after a serialization or unique conflict is not implemented.

**Recommended fix:** Add a nullable-safe unique identity strategy, preferably one membership row per `(bandId, userId)` in the relational model. Run the join transaction at `Serializable` isolation and retry bounded `P2034` serialization failures. Keep `GigBandMember`'s existing composite unique constraint.

**Limitation:** The current Vitest concurrency test executes two mocked transactions; it does not prove PostgreSQL isolation, rollback, or serialization behavior. No disposable database or configured integration test environment was available in this run.

### Medium: Stale client state and cache invalidation

**Root cause:** Joining mutates server state, but there is no realtime event or cross-tab invalidation in the join flow. A dashboard tab can keep a cached member or gig list until its normal refresh/retry path runs.

**Recommended fix:** Return the canonical membership and linked gig ids from join, invalidate the relevant client query keys on success, and publish a band-membership version/event through the chosen realtime mechanism. Treat the server response as authoritative and refetch after a conflict.

### Low: Preview leaks band existence

**Root cause:** An authenticated caller can probe six-character codes and distinguish `404` from success. The response intentionally limits fields, but code enumeration remains observable.

**Recommended fix:** Rate-limit and audit failed previews, use longer opaque tokens, and avoid exposing whether a token was previously valid. Do not rely on the UI alphabet check as security.

## Test matrix

- Unit: token verification, normalization, code format, replay-safe composite upsert contract.
- Integration: authenticated join, missing user, unknown code, two distinct sessions, repeated acceptance.
- Concurrency: simultaneous requests enter independent database transactions in Vitest. Actual PostgreSQL serialization, unique constraints, and rollback remain unverified without a database-backed integration environment.
- Security: forged subject, expired token, invalid signature, non-member invite access, leader-only rotation, old code after rotation, malformed body, and brute-force rate limiting.
- State: partial gig-link failure rolls back the member mutation, duplicate gig links remain one row, and a post-join refetch returns the newly linked gigs.

The Vitest tests added or expanded for this audit are `test/auth-helpers.test.ts`, `test/multiplayer-audit.test.ts`, `test/band-roster-route.test.ts`, and `test/get-or-create-user.test.ts`. The Playwright flow remains in `e2e/band-invite-flow.spec.ts` for QR rendering and browser-level acceptance. The original production failure was not run against production data. The cross-account workflow was reproduced against the local Supabase/Postgres stack after provisioning disposable accounts; the initial run exposed the concurrent `User.supabaseId` race, and the subsequent run passed.

The real two-account acceptance spec is `e2e/multiplayer-two-account.spec.ts`. It is mutation-gated and was verified here only in its safe skip mode because the available `.env` points to a remote project and no isolated test credentials were configured. See `E2E_MULTIPLAYER_SETUP.md` for the protected staging setup and CI job requirements.
