# Flashpad Remediation Plan

Date: 2026-04-12

Source review: [FLASHPAD-CODE-REVIEW-2026-04-12.md](C:/Data/Repos/Flashpad/FLASHPAD-CODE-REVIEW-2026-04-12.md)

## Goals

1. Contain active compromise risk immediately.
2. Remove release blockers before shipping the next production build.
3. Eliminate silent data-loss paths in offline sync.
4. Add enough test coverage that the fixes stay fixed.

## Priority Order

### P0: Same Day Containment

These should happen immediately, before any normal feature work.

1. Rotate all exposed backend secrets.
   - Covers: `F01`
   - Work:
     - Rotate the H4 API key.
     - Rotate both committed JWT signing keys.
     - Replace checked-in secrets with environment variables or deployment-managed secrets.
     - Audit CI, server config, release artifacts, and backups for the exposed values.
   - Exit criteria:
     - No live secrets remain in `packages/backend/appsettings*.json`.
     - Production starts only with externally supplied secrets.

2. Stop leaking bearer tokens and note content into telemetry.
   - Covers: `F04`, `F06`, part of `F16`
   - Work:
     - Redact or drop `access_token` from request logging.
     - Stop logging raw query strings for hub/auth traffic.
     - Remove note content previews from H4 logs.
     - Reduce device-level metadata to only what is operationally necessary.
   - Exit criteria:
     - SignalR connect logs no longer contain query strings or JWTs.
     - Note bodies are absent from telemetry.

3. Freeze Android release builds until signing is fixed.
   - Covers: `F03`
   - Work:
     - Block production APK/AAB builds that use `signingConfigs.debug`.
     - Generate a private release keystore and store it in CI/secrets.
   - Exit criteria:
     - Release signing uses a non-repo keystore only.

### P1: Release Blockers

These should be fixed before the next public desktop/mobile/web/backend release.

1. Fix Electron path traversal in preload/main-process file APIs.
   - Covers: `F02`
   - Work:
     - Validate note IDs and JSON filenames in preload-facing APIs.
     - Resolve paths and verify they stay under the notes/data directory.
     - Whitelist allowed JSON files instead of passing arbitrary filenames through IPC.
     - Add tests for `..`, path separators, absolute paths, and malicious frontmatter IDs.
   - Exit criteria:
     - Renderer input cannot escape the intended file roots.

2. Block external navigation in Electron.
   - Covers: `F05`
   - Work:
     - Add `will-navigate` and `setWindowOpenHandler` guards.
     - Route markdown links to `shell.openExternal`.
     - Re-evaluate whether `sandbox: true` can be enabled after IPC tightening.
   - Exit criteria:
     - App windows cannot navigate to arbitrary remote origins.
     - External links always open outside Electron.

3. Remove the generic Electron token bridge and harden token persistence.
   - Covers: `F07`
   - Work:
     - Delete `get-auth-token` IPC.
     - Rework quick-capture auth so it does not need renderer-exposed token reads.
     - Move desktop token storage to OS-backed secure storage.
   - Exit criteria:
     - No renderer-accessible IPC returns the auth token.

4. Fix mobile logout data isolation.
   - Covers: `F10`
   - Work:
     - Make every logout path clear notes, categories, and sync queue in addition to the token.
     - Ensure switching users starts from a clean local cache.
   - Exit criteria:
     - Logging out removes all prior-user offline data from the device.

5. Replace the current refresh-token model.
   - Covers: `F11`, part of `F07`
   - Work:
     - Move from “access token refreshes itself” to short-lived access tokens plus real refresh tokens.
     - Add revocation/session invalidation.
     - Rework client auth storage to fit the new model per platform.
   - Exit criteria:
     - A stolen access token cannot be extended indefinitely.

### P2: Data Integrity and Sync Correctness

These are next after the immediate security blockers. They are high priority because they create user-visible data loss.

1. Fix offline sync for local-only notes and categories.
   - Covers: `F08`
   - Work:
     - Rewrite queued `CREATE` payloads when the local entity changes.
     - Make local move/archive/trash/restore update the pending create snapshot too.
     - Ensure the final local state is what reaches the server after reconnect.
   - Exit criteria:
     - Offline create -> edit -> move -> reconnect preserves final state.

2. Stop discarding queued writes after three retries.
   - Covers: `F09`
   - Work:
     - Keep failed sync items queued with backoff.
     - Add a surfaced “sync failed, retry needed” state instead of silent deletion.
     - Require explicit user action before discarding unsynced data.
   - Exit criteria:
     - Temporary backend/network failures do not delete pending writes.

3. Enforce concurrency checks consistently across clients.
   - Covers: `F12`
   - Work:
     - Send `baseVersion` on every note update from web and any other inconsistent clients.
     - Use real stable device IDs instead of constants.
     - Handle `409 Conflict` in the editor UI instead of replaying stale autosaves.
   - Exit criteria:
     - Concurrent edits no longer silently overwrite each other.

4. Fix JWT expiry parsing in the shared client.
   - Covers: `F13`
   - Work:
     - Normalize base64url payloads before decoding.
     - Add tests with real JWT payload shapes.
   - Exit criteria:
     - Refresh scheduling works reliably across all clients.

### P3: Platform Hardening

These are important, but they can follow once the active compromise and data-loss issues are closed.

1. Remove runtime third-party dependency from Electron migration.
   - Covers: `F14`
   - Work:
     - Bundle `sql.js` wasm/assets locally.
     - Make migration work offline.

2. Isolate mobile environment switching.
   - Covers: `F15`
   - Work:
     - Namespace local storage by environment.
     - Reinitialize or force restart/logout on env switch.
     - Ensure the active API client cannot continue using the old backend accidentally.

3. Harden client-log ingestion.
   - Covers: `F16`
   - Work:
     - Add payload size limits.
     - Add a stricter schema.
     - Stamp server-known user/device identity instead of trusting client-supplied attribution.

4. Validate paging and request bounds in the backend.
   - Covers: `F17`
   - Work:
     - Clamp `page` and `pageSize`.
     - Reject abusive values early.

5. Replace `EnsureCreated()` with migrations.
   - Covers: `F18`
   - Work:
     - Add EF migrations.
     - Remove runtime `EnsureCreated()`.
     - Make startup fail fast on invalid DB config.

6. De-duplicate Electron updater listeners.
   - Covers: `F19`
   - Work:
     - Register updater listeners once.
     - Add a regression test around window recreation.

## Delivery Plan

### Wave 1: Emergency Security Hotfix

Target: immediately after approval

- Rotate and remove committed secrets.
- Redact tokens/query strings from logs.
- Remove note previews from telemetry.
- Fix Android release signing.

Reason: these are active exposure issues today.

### Wave 2: Desktop/Mobile Release Blockers

Target: next patch release after Wave 1

- Electron path traversal fix.
- Electron external navigation guard.
- Electron token IPC removal.
- Mobile logout isolation fix.

Reason: these are exploitable or privacy-breaking on end-user devices.

### Wave 3: Sync Integrity

Target: immediately after Wave 2

- Local-only entity sync rewrite.
- Retry exhaustion behavior fix.
- Version/conflict handling alignment across clients.
- Shared JWT parsing fix.

Reason: these are core data-integrity problems and will undermine trust in the product if left unresolved.

### Wave 4: Hardening and Infrastructure Cleanup

Target: after Waves 1-3 are in production

- Migration bundling cleanup.
- Mobile env isolation.
- Client log ingestion hardening.
- Backend paging validation.
- EF migrations.
- Updater listener cleanup.

## Recommended Work Breakdown

### Track A: Backend/Auth

- Secret externalization and rotation.
- H4 log redaction/content minimization.
- Refresh-token redesign.
- Client log ingestion hardening.
- Paging validation.
- Migration-based DB startup.

### Track B: Electron Security

- Path validation and IPC narrowing.
- External navigation lockdown.
- Secure token storage and quick-capture auth redesign.
- Updater listener cleanup.
- Local bundling of migration assets.

### Track C: Mobile Security and Data Integrity

- Release signing.
- Logout isolation.
- Secure token storage.
- Environment isolation.
- Offline sync correctness.

### Track D: Shared/Web Sync Correctness

- Base64url JWT parsing fix.
- `baseVersion` propagation.
- Stable device IDs.
- Conflict UI/merge behavior.

## Test Plan

These tests should be considered required with the remediation work.

### Security Tests

- Electron path traversal tests for note IDs and JSON filenames.
- Electron external-link test proving BrowserWindow does not navigate to remote content.
- Android build assertion that release signing never uses the debug keystore.
- Backend telemetry redaction test proving `access_token` is absent from logs.

### Data Integrity Tests

- Offline create -> edit -> move -> reconnect for note sync.
- Offline create/update/delete retry behavior under temporary server failure.
- Mobile logout -> login as another user starts with empty local caches.
- Web concurrent edit test that produces a visible conflict instead of silent overwrite.

### Regression Tests

- Shared JWT expiry parsing with real base64url tokens.
- Electron updater test for window recreation without duplicated listeners.
- Backend paging validation tests for negative and oversized values.

## Release Gates

Do not ship the next production release until all of these are true:

1. No live secrets remain in source control.
2. Android release signing uses a private release keystore.
3. Electron path traversal is fixed and tested.
4. SignalR/auth telemetry no longer contains tokens or note content.
5. Offline sync no longer drops writes after retry exhaustion.
6. Mobile logout clears prior-user local data.

## Suggested First Implementation Order

If work starts now, the cleanest order is:

1. Backend secret rotation and telemetry redaction.
2. Android release signing fix.
3. Electron path traversal fix.
4. Electron external navigation guard.
5. Mobile logout isolation.
6. Offline sync queue correctness in Electron and mobile.
7. Auth/session redesign and secure token storage.
