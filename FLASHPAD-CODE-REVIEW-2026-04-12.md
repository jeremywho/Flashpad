# Flashpad Code Review

Date: 2026-04-12

## Scope

This review covered the Flashpad Electron app, mobile app, web app, backend, and shared client contract layer. I reviewed the project docs first, then ran parallel surface reviews for `packages/backend`, `packages/electron`, `packages/mobile`, and `packages/web`, and locally re-validated the strongest findings in source.

Reviewed docs included:

- `README.md`
- `DEPLOY.md`
- `SYNC-ARCHITECTURE.md`
- `FLASHPAD-PLAN.md`
- `BACKEND-THREAD-STARVATION.md`
- `POWERSHELL-PROFILE-JOURNAL.md`
- `packages/backend/README.md`
- `packages/electron/README.md`
- `packages/mobile/README.md`
- `packages/mobile/PERFORMANCE.md`
- `packages/mobile/PERFORMANCE_REVIEW_SUMMARY.md`
- `packages/shared/README.md`
- `docs/superpowers/plans/*.md`
- `docs/superpowers/specs/*.md`

This was primarily a static code review. I did not run a full end-to-end validation or exploit reproduction suite.

## Findings

### F01 [Critical] Backend secrets are committed directly in repository config

Evidence: `packages/backend/appsettings.json:12-19`, `packages/backend/appsettings.Production.json:12-16`, `packages/backend/Program.cs:27-35`, `packages/backend/Program.cs:67-71`.

Impact: the repo contains live signing material and telemetry credentials, including JWT signing secrets and an H4 API key. Anyone with repository, artifact, backup, or host filesystem access can mint valid bearer tokens or impersonate the backend into H4. This is a direct credential-compromise issue, not just a bad default.

Recommendation: rotate the exposed secrets immediately, move them to environment variables or a secret store, and fail startup if production secrets are missing or still coming from checked-in config files.

### F02 [Critical] Electron file APIs allow path traversal outside the notes/data directories

Evidence: `packages/electron/electron/preload.ts:49-79`, `packages/electron/electron/main.ts:513-556`, `packages/electron/src/services/markdown-parser.ts:124-133`, `packages/electron/src/services/database.ts:559-657`.

Impact: the preload bridge exposes raw file helpers that accept renderer-controlled IDs and filenames, and the main process joins them directly into filesystem paths. A malicious note ID in frontmatter such as `../../...`, or any compromised renderer code path, can turn normal note sync/cleanup operations into reads, writes, or deletes outside the intended notes folder.

Recommendation: reject separators and `..` in note IDs and filenames, resolve every target path and verify it stays under the expected root, and replace generic JSON helpers with a whitelist of allowed files.

### F03 [Critical] Android release builds are signed with the public debug keystore

Evidence: `packages/mobile/android/app/build.gradle:88-103`, `packages/mobile/android/app/debug.keystore`.

Impact: the `release` build uses `signingConfigs.debug`, and the debug keystore is present in the repo. That means production APKs can be rebuilt and signed with the same known key, which undermines release integrity and can enable same-signature replacement or data-sharing attacks on-device.

Recommendation: use a private release keystore provided through CI/secrets, remove debug signing from `release`, and add a build-time guard that fails if `release` references `signingConfigs.debug`.

### F04 [High] SignalR bearer tokens are leaked into observability logs

Evidence: `packages/backend/Program.cs:53-57`, `packages/backend/Middleware/H4RequestLoggingMiddleware.cs:58-66`.

Impact: the backend accepts SignalR JWTs from the `access_token` query parameter, and the request logging middleware records the full query string. SignalR connection attempts will therefore emit bearer tokens into H4 unless redacted first.

Recommendation: stop logging raw query strings for hub traffic, or explicitly strip `access_token` before logging. Prefer logging structured safe fields instead of the raw query string.

### F05 [High] Electron can navigate a privileged BrowserWindow to external content

Evidence: `packages/electron/electron/main.ts:191-212`, `packages/electron/src/components/NoteEditor.tsx:481`.

Impact: the main Electron window exposes the preload bridge but does not block external navigation or popup creation, and note preview renders clickable markdown links. A note containing an external URL can navigate the app window away from the packaged app to a remote origin that still inherits `window.electron`, which turns a normal link click into a bridge-compromise path.

Recommendation: intercept external links and open them with `shell.openExternal`, deny `will-navigate` and `setWindowOpenHandler` for non-app origins, and consider enabling `sandbox: true` once the preload contract is tightened.

### F06 [High] Sensitive note content and device metadata are sent to H4

Evidence: `packages/backend/Controllers/NotesController.cs:184-185`, `packages/backend/Controllers/NotesController.cs:265-266`, `packages/backend/Hubs/NotesHub.cs:226-237`.

Impact: note create/update logs include an 80-character content preview, and hub logging includes connected device identifiers. For a note-taking product, that means user content and device topology are being copied into observability storage during routine operations.

Recommendation: remove content previews entirely from telemetry, minimize device-level identifiers, and treat note bodies as sensitive application data that should not leave the primary datastore.

### F07 [High] Client bearer tokens are stored in recoverable local storage across platforms

Evidence: `packages/web/src/AuthContext.tsx:49-50`, `packages/web/src/AuthContext.tsx:67-89`, `packages/electron/src/AuthContext.tsx:48-49`, `packages/electron/src/AuthContext.tsx:66-88`, `packages/electron/electron/main.ts:463-465`, `packages/mobile/src/contexts/AuthContext.tsx:34-40`, `packages/mobile/src/contexts/AuthContext.tsx:57-59`, `packages/mobile/src/contexts/AuthContext.tsx:69-90`.

Impact: the web and Electron apps persist bearer tokens in `localStorage`, mobile persists them in plain `AsyncStorage`, and Electron additionally exposes a `get-auth-token` IPC path that reads the token out of the renderer. Any XSS, compromised renderer navigation, malicious extension, rooted-device inspection, or preload compromise can recover an active account token.

Recommendation: move tokens to OS-backed secure storage on Electron/mobile or use an `HttpOnly; Secure; SameSite` refresh-cookie model on web. Remove the generic Electron token IPC and keep only the minimum auth flow needed by quick-capture.

### F08 [High] Offline edits to local-only notes and categories can be silently lost in Electron and mobile

Evidence: `packages/electron/src/services/syncManager.ts:326-377`, `packages/electron/src/services/syncManager.ts:381-447`, `packages/electron/src/services/syncManager.ts:450-559`, `packages/mobile/src/services/syncManager.ts:272-365`, `packages/mobile/src/services/syncManager.ts:366-416`, `packages/mobile/src/services/syncManager.ts:570-665`.

Impact: both sync managers queue an initial `CREATE` payload for `local_` entities, but later offline edits to those same entities do not rewrite the pending create payload, and later local state changes like move/archive/trash/restore are skipped for `local_` records. If a user creates a note offline, changes it again before reconnecting, and then syncs, the server receives stale state rather than the final local note.

Recommendation: treat queued creates as mutable snapshots and rewrite them whenever a local-only entity changes, or keep the final state in one authoritative local record that the queue reads at sync time.

### F09 [High] Electron and mobile permanently drop sync items after three retries

Evidence: `packages/electron/src/services/syncManager.ts:272-286`, `packages/mobile/src/services/syncManager.ts:233-243`.

Impact: temporary backend outages, network failures, or rate limiting can permanently remove queued writes after three attempts. That is silent data loss in the exact code that is supposed to make offline use safe.

Recommendation: never auto-delete unsynced user data after a retry threshold. Keep failed items queued with backoff, or mark them failed and require explicit user intervention before discard.

### F10 [High] Mobile logout leaves the previous user’s offline data on the device

Evidence: `packages/mobile/src/contexts/AuthContext.tsx:34-40`, `packages/mobile/src/screens/AccountScreen.tsx:346-352`, `packages/mobile/src/services/database.ts:4-8`, `packages/mobile/src/services/database.ts:297-305`.

Impact: mobile logout removes only the token. It does not clear locally cached notes, categories, or the sync queue. A second user on the same device can inherit the previous user’s offline state and pending sync data after logging in.

Recommendation: route every logout path through one helper that clears auth, notes, categories, and sync queue together before returning to the unauthenticated state.

### F11 [High] Any valid access token can mint a fresh 7-day token indefinitely

Evidence: `packages/backend/Controllers/AuthController.cs:100-121`, `packages/backend/Services/AuthService.cs:15-33`, `packages/shared/src/api-client.ts:115-120`.

Impact: `/api/auth/refresh` accepts a normal bearer token and returns a fresh 7-day JWT, with no separate refresh token, rotation, or revocation state. Once an attacker gets a valid access token before expiry, they can keep extending the session from the client side.

Recommendation: split access tokens from refresh tokens, keep access tokens short-lived, rotate refresh tokens, and add server-side revocation or session invalidation.

### F12 [Medium] Web note saves bypass the server’s concurrency protection

Evidence: `packages/backend/Controllers/NotesController.cs:205-208`, `packages/web/src/pages/Home.tsx:307-329`, `packages/web/src/components/NoteEditor.tsx:148-195`, `packages/shared/src/api-client.ts:162-166`.

Impact: the backend supports version-based conflict detection, but the web editor does not send `baseVersion`, uses a fake constant device ID, and ignores remote changes while the editor is focused. A delayed autosave can therefore replay stale content after another device has already changed the same note.

Recommendation: send the current note version on every update, use a stable per-device ID, and surface 409 conflicts to the user instead of blindly replaying stale autosaves.

### F13 [Medium] JWT expiry parsing is incorrect for standard base64url JWT payloads

Evidence: `packages/shared/src/api-client.ts:22-31`, `packages/web/src/AuthContext.tsx:33-55`, `packages/electron/src/AuthContext.tsx:32-54`, `packages/mobile/src/contexts/AuthContext.tsx:42-65`.

Impact: the shared token parser calls `atob()` directly on the JWT payload segment. JWT payloads are base64url-encoded, not plain base64, so refresh scheduling can fail silently and cause unexpected logouts or missed refresh attempts.

Recommendation: normalize base64url to base64 before decoding and add unit tests using real JWT payload shapes.

### F14 [Medium] Electron migration downloads `sql.js` assets from a third-party host at runtime

Evidence: `packages/electron/src/App.tsx:88-99`, `packages/electron/src/services/migration.ts:49-56`.

Impact: first-run migration depends on fetching `sql.js` assets from `https://sql.js.org/dist/` during app startup. That creates a network dependency and a supply-chain path inside a privileged desktop migration flow.

Recommendation: bundle the required wasm/assets with the app and resolve them from packaged resources instead of a third-party CDN.

### F15 [Medium] Mobile production/local environment switching is only partially isolated

Evidence: `packages/mobile/src/config.ts:22-50`, `packages/mobile/src/contexts/AuthContext.tsx:24-25`, `packages/mobile/src/screens/AccountScreen.tsx:33-43`, `packages/mobile/src/services/database.ts:4-8`.

Impact: switching environments only flips a flag in `AsyncStorage`. The active `ApiClient` stays bound to the old host until a restart, and the persisted note/category/queue storage is not namespaced per environment. That allows prod/local data bleed and makes “Later” keep using the wrong backend.

Recommendation: scope local storage per environment and fully reinitialize or force restart/logout whenever the API environment changes.

### F16 [Medium] Authenticated clients can spoof arbitrary telemetry into H4

Evidence: `packages/backend/Controllers/ClientLogsController.cs:35-67`.

Impact: the client-log ingestion endpoint forwards arbitrary client-provided message text, source names, device IDs, timestamps, and metadata into H4 with very light validation. Any authenticated user can forge telemetry, flood it with oversized metadata, or inject sensitive data into the logging backend.

Recommendation: enforce a strict schema, bound message/metadata sizes, stamp server-known identity fields on ingest, and avoid trusting client-supplied attribution fields.

### F17 [Medium] Notes paging parameters are unbounded and insufficiently validated

Evidence: `packages/backend/Controllers/NotesController.cs:41-79`.

Impact: the notes list endpoint accepts arbitrary `page` and `pageSize` values and feeds them directly into `Skip()` and `Take()`. Negative or very large values can trigger exceptions, expensive scans, or abusive requests.

Recommendation: reject `page < 1`, cap `pageSize`, and define sane maximums in both DTO validation and controller logic.

### F18 [Medium] Backend startup still relies on `EnsureCreated()` instead of a migration-based production path

Evidence: `packages/backend/Program.cs:100-104`, `packages/backend/appsettings.json:9-10`, `packages/backend/README.md:63-79`.

Impact: production safety still depends on runtime assumptions around SQLite files and `EnsureCreated()`. That bypasses normal migration discipline and can hide schema drift or create the wrong database file in the wrong place.

Recommendation: replace `EnsureCreated()` with migrations, fail fast on unexpected database locations, and keep production startup deterministic.

### F19 [Medium] Electron updater listeners stack each time the main window is recreated

Evidence: `packages/electron/electron/main.ts:245-247`, `packages/electron/electron/main.ts:369-409`, `packages/electron/electron/main.ts:442-447`.

Impact: `checkForUpdates()` registers a fresh set of `autoUpdater` listeners every time the window is created, without removing the old ones. Reopening the window can produce duplicate prompts and duplicated install attempts.

Recommendation: register updater listeners once at app startup, or explicitly unregister before re-registering.

## Coverage Gaps

The following gaps increased review risk:

- `packages/backend` has no backend test project covering auth refresh, telemetry redaction, hub auth, or paging validation.
- `packages/web` has no test runner or browser coverage for auth refresh, route gating, or note-save races.
- I did not re-audit the external H4 .NET SDK source referenced by `BACKEND-THREAD-STARVATION.md`, because that code is not in this repo.

## Suggested Priority Order

1. Rotate exposed secrets and move them out of source control.
2. Fix Electron path traversal and external-navigation/preload exposure.
3. Fix Android release signing immediately.
4. Stop leaking bearer tokens and note previews into H4.
5. Fix offline sync data-loss paths in Electron and mobile before relying on offline-first behavior.
