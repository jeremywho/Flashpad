# Flashpad Remediation Status

Date: 2026-04-12
Source plan: `FLASHPAD-REMEDIATION-PLAN-2026-04-12.md`

## P0

### P0.1 Rotate all exposed backend secrets (`F01`)
- status: `completed`
- owner: `codex` (code), `claude` (operational rotation 2026-04-19)
- files_touched: [`packages/backend/Configuration/SecretConfigurationResolver.cs`, `packages/backend/Program.cs`, `packages/backend/appsettings.json`, `packages/backend/appsettings.Production.json`, `packages/backend/Flashpad.csproj`, `packages/backend/Flashpad.Tests/Flashpad.Tests.csproj`, `packages/backend/Flashpad.Tests/GlobalUsings.cs`, `packages/backend/Flashpad.Tests/SecretConfigurationResolverTests.cs`, `packages/backend/Flashpad.Tests/TestAssembly.cs`, `README.md`, `DEPLOY.md`, `packages/backend/README.md`]
- tests_run: [`dotnet build packages/backend/Flashpad.csproj`, `dotnet test packages/backend/Flashpad.Tests/Flashpad.Tests.csproj`, `curl /api/auth/register post-rotation smoke test`]
- notes: `Code remediation (2026-04-12): removed checked-in backend secrets from config and made production startup require externally supplied JwtSettings__SecretKey and H4__ApiKey. Operational rotation (2026-04-19): new JWT secret generated server-side and set as systemd Environment= for flashpad-api.service; new H4 API key generated server-side, Flashpad row in h4.Projects updated (ApiKeyHash + ApiKeyPrefix) to the new value, and the new key set in the same systemd unit. Service restarted, smoke-tested: register returns 200 with valid access/refresh tokens, h4 ingestion of LogEntries and Traces verified. Previously exposed values in git history are now non-functional. Residual: CI/server backup audit for historical leakage still recommended but out of scope for this rotation.`

### P0.2 Stop leaking bearer tokens and note content into telemetry (`F04`, `F06`, part of `F16`)
- status: `completed`
- owner: `codex`
- files_touched: [`packages/backend/Observability/RequestLogMetadataBuilder.cs`, `packages/backend/Middleware/H4RequestLoggingMiddleware.cs`, `packages/backend/Controllers/NotesController.cs`, `packages/backend/Hubs/NotesHub.cs`, `packages/backend/Controllers/ClientLogsController.cs`, `packages/backend/Flashpad.Tests/RequestLogMetadataBuilderTests.cs`]
- tests_run: [`dotnet build packages/backend/Flashpad.csproj`, `dotnet test packages/backend/Flashpad.Tests/Flashpad.Tests.csproj`, `rg -n --no-heading access_token packages/backend`]
- notes: `Request logging now records only safe query summaries, never raw query strings; note preview logging was removed; and H4 hub/client metadata no longer emits device identifiers. Residual risk: full client-log schema validation and payload limits remain scheduled under P3.3.`

### P0.3 Freeze Android release builds until signing is fixed (`F03`)
- status: `completed`
- owner: `codex`
- files_touched: [`package.json`, `package-lock.json`, `packages/mobile/package.json`, `packages/mobile/android/settings.gradle`, `packages/mobile/android/build.gradle`, `packages/mobile/android/app/build.gradle`, `packages/mobile/android/scripts/react-native-cli-wrapper.js`, `packages/mobile/README.md`]
- tests_run: [`npm ls react-native react-native-reanimated react-native-worklets @react-native/new-app-screen --all --json`, `.\\gradlew.bat :app:assembleDebug` in `packages/mobile/android`, `.\\gradlew.bat :app:assembleRelease` in `packages/mobile/android`]
- notes: `Normalized the workspace to exact React Native 0.85.0 / Reanimated 4.3.0 / Worklets 0.8.1 / new-app-screen 0.85.0 dependencies, refreshed the hoisted install, and verified that assembleDebug now succeeds. Release builds remain fail-closed and stop immediately unless FLASHPAD_RELEASE_STORE_FILE, FLASHPAD_RELEASE_STORE_PASSWORD, FLASHPAD_RELEASE_KEY_ALIAS, and FLASHPAD_RELEASE_KEY_PASSWORD are supplied, which satisfies the remediation goal of preventing debug-signing fallback. Residual operational dependency: generating an actual signed release artifact still requires the private keystore material to be provided outside the repo.`

## P1

### P1.1 Fix Electron path traversal in preload/main-process file APIs (`F02`)
- status: `completed`
- owner: `codex`
- files_touched: `["packages/electron/electron/main.ts", "packages/electron/src/services/markdown-parser.ts", "packages/electron/src/services/database.ts", "packages/electron/src/services/__tests__/markdown-parser.test.ts", "packages/electron/src/services/__tests__/database.test.ts"]`
- tests_run: `["npm run build:ci", "node ..\\..\\node_modules\\jest\\bin\\jest.js --runInBand --config %TEMP%\\flashpad-electron-jest.config.json src/services/__tests__/markdown-parser.test.ts src/services/__tests__/database.test.ts"]`
- notes: `Unsafe note IDs and data filenames are rejected, note frontmatter IDs are validated, and malicious frontmatter now falls back to safe local note ingestion.`

### P1.2 Block external navigation in Electron (`F05`)
- status: `completed`
- owner: `codex`
- files_touched: `["packages/electron/electron/main.ts", "packages/electron/electron/preload.ts", "packages/electron/src/types/electron.d.ts", "packages/electron/src/AuthContext.tsx", "packages/electron/src/pages/Home.tsx", "packages/electron/src/components/NoteEditor.tsx", "packages/electron/src/services/markdown-parser.ts", "packages/electron/src/services/__tests__/markdown-parser.test.ts", "packages/electron/e2e/external-navigation.spec.ts", "packages/electron/e2e/helpers/backend.ts", "packages/electron/e2e/helpers/electron-app.ts"]`
- tests_run: `["npm run build:ci" in "packages/electron", "node ..\\..\\node_modules\\jest\\bin\\jest.js --runInBand --config %TEMP%\\flashpad-electron-jest.config.cjs src/services/__tests__/markdown-parser.test.ts" in "packages/electron", "packaged Electron startup probe: first window reached file:///...#/login with no renderer pageerror", "npx playwright test --config playwright.config.ts e2e/external-navigation.spec.ts" in "packages/electron"]`
- notes: `The packaged renderer startup bug is fixed by removing Node path usage from the renderer bundle and by exposing the API base URL through preload so packaged e2e runs can point at the test backend at runtime. External markdown links now stay inside the app window contractually, and the packaged external-navigation Playwright spec passes.`

### P1.3 Remove the generic Electron token bridge and harden token persistence (`F07`)
- status: `completed`
- owner: `codex`
- files_touched: [`packages/electron/electron/main.ts`, `packages/electron/electron/preload.ts`, `packages/electron/src/types/electron.d.ts`, `packages/electron/src/AuthContext.tsx`, `packages/electron/src/pages/QuickCapture.tsx`, `packages/electron/src/pages/QuickCaptureCode.tsx`, `packages/electron/src/pages/Home.tsx`, `packages/electron/src/services/__tests__/test-helpers.ts`]
- tests_run: [`npm run build:ci`, `rg -n --no-heading "get-auth-token|localStorage\\.(setItem|getItem|removeItem)\\('token'" packages/electron`]
- notes: `Electron no longer persists auth tokens in localStorage, the generic get-auth-token IPC is removed, and quick capture now creates local notes through a main-process queue API without exposing renderer token reads. Residual tradeoff: desktop auth is in-memory only, so users reauthenticate after a full app restart until a deliberate OS-backed secure-storage session layer is added.`

### P1.4 Fix mobile logout data isolation (`F10`)
- status: `completed`
- owner: `codex`
- files_touched: [`packages/mobile/src/contexts/AuthContext.tsx`, `packages/mobile/src/services/authStorage.ts`, `packages/mobile/src/services/__tests__/authStorage.test.ts`]
- tests_run: [`npm test -- --runInBand --watchAll=false --runTestsByPath src/services/__tests__/authStorage.test.ts`]
- notes: `Explicit mobile logout now clears the stored token, local notes, local categories, and the sync queue together before returning to the unauthenticated state. Additional mobile package typechecking is still limited by an existing missing declaration for react-native-marked in NoteEditorScreen.tsx, but the logout remediation itself is verified by the focused Jest coverage.`

### P1.5 Replace the current refresh-token model (`F11`, part of `F07`)
- status: `completed`
- owner: `codex`
- files_touched: [`packages/backend/Models/RefreshSession.cs`, `packages/backend/Models/User.cs`, `packages/backend/Data/AppDbContext.cs`, `packages/backend/Data/DatabaseSchemaInitializer.cs`, `packages/backend/Services/IAuthService.cs`, `packages/backend/Services/AuthService.cs`, `packages/backend/DTOs/UserDtos.cs`, `packages/backend/Controllers/AuthController.cs`, `packages/backend/Program.cs`, `packages/shared/src/types.ts`, `packages/shared/src/api-client.ts`, `packages/web/src/AuthContext.tsx`, `packages/web/src/pages/Login.tsx`, `packages/web/src/pages/Register.tsx`, `packages/electron/src/AuthContext.tsx`, `packages/electron/src/pages/Login.tsx`, `packages/electron/src/pages/Register.tsx`, `packages/electron/e2e/helpers/auth.ts`, `packages/mobile/src/services/authStorage.ts`, `packages/mobile/src/services/__tests__/authStorage.test.ts`, `packages/mobile/src/contexts/AuthContext.tsx`, `packages/mobile/src/screens/LoginScreen.tsx`, `packages/mobile/src/screens/RegisterScreen.tsx`]
- tests_run: [`dotnet build packages/backend/Flashpad.csproj`, `dotnet test packages/backend/Flashpad.Tests/Flashpad.Tests.csproj`, `backend auth smoke: register -> refresh -> old refresh 401 -> logout -> logged-out refresh 401`, `npm run build` in `packages/shared`, `npm run build` in `packages/web`, `npm run build:ci` in `packages/electron`, `npm test -- --runInBand --watchAll=false --runTestsByPath src/services/__tests__/authStorage.test.ts`]
- notes: `Backend auth now uses 15-minute access tokens plus rotating hashed refresh sessions with logout revocation, and the web/mobile/Electron clients bootstrap sessions through refresh tokens instead of self-refreshing access tokens. Residual risk: mobile refresh tokens still live in AsyncStorage until a dedicated secure-storage integration lands, but stolen access tokens can no longer extend themselves indefinitely.`

## P2

### P2.1 Fix offline sync for local-only notes and categories (`F08`)
- status: `completed`
- owner: `codex`
- files_touched: [`packages/electron/src/services/database.ts`, `packages/electron/src/services/syncManager.ts`, `packages/electron/src/services/__tests__/database.test.ts`, `packages/electron/src/services/__tests__/syncManager.test.ts`, `packages/mobile/src/services/database.ts`, `packages/mobile/src/services/syncManager.ts`, `packages/mobile/src/services/__tests__/database.test.ts`, `packages/mobile/src/services/__tests__/syncManager.test.ts`]
- tests_run: [`node ..\\..\\node_modules\\jest\\bin\\jest.js --runInBand --config %TEMP%\\flashpad-electron-jest.config.json src/services/__tests__/database.test.ts src/services/__tests__/syncManager.test.ts`, `npm run build:ci` in `packages/electron`, `npm test -- --runInBand --watchAll=false --runTestsByPath src/services/__tests__/database.test.ts src/services/__tests__/syncManager.test.ts` in `packages/mobile`]
- notes: `Electron and mobile now keep local-only CREATE snapshots aligned with the latest offline note/category state, cancel those creates if the local entity is deleted before sync, preserve final local note status after first sync, and remap dependent note payloads when offline-created categories receive real server IDs. Residual risk: queued writes still auto-delete after three retries until P2.2 is completed.`

### P2.2 Stop discarding queued writes after three retries (`F09`)
- status: `completed`
- owner: `codex`
- files_touched: [`packages/electron/src/services/syncManager.ts`, `packages/electron/src/pages/Home.tsx`, `packages/electron/src/components/Sidebar.tsx`, `packages/electron/src/components/NoteEditor.tsx`, `packages/electron/src/index.css`, `packages/electron/src/services/__tests__/syncManager.test.ts`, `packages/mobile/src/services/syncManager.ts`, `packages/mobile/src/screens/HomeScreen.tsx`, `packages/mobile/src/services/__tests__/syncManager.test.ts`]
- tests_run: [`node ..\\..\\node_modules\\jest\\bin\\jest.js --runInBand --config %TEMP%\\flashpad-electron-jest.config.json src/services/__tests__/database.test.ts src/services/__tests__/syncManager.test.ts`, `npm run build:ci` in `packages/electron`, `npm test -- --runInBand --watchAll=false --runTestsByPath src/services/__tests__/database.test.ts src/services/__tests__/syncManager.test.ts` in `packages/mobile`]
- notes: `Electron and mobile sync managers now leave failed items queued, stop the current pass after an error instead of retry-spinning the same item, and surface retry-needed state in the existing sync indicators instead of silently deleting writes after three failures. Residual risk: there is still no dedicated discard/retry UI beyond the preserved queue and sync-state badges, but unsynced writes are retained until a future explicit action path is added.`

### P2.3 Enforce concurrency checks consistently across clients (`F12`)
- status: `completed`
- owner: `codex`
- files_touched: [`packages/web/src/pages/Home.tsx`, `packages/web/src/components/NoteEditor.tsx`, `packages/web/src/index.css`, `packages/web/src/services/deviceId.ts`, `packages/mobile/src/services/deviceId.ts`, `packages/mobile/src/services/syncManager.ts`, `packages/mobile/src/screens/HomeScreen.tsx`, `packages/mobile/src/screens/NoteEditorScreen.tsx`, `packages/mobile/src/screens/QuickCaptureScreen.tsx`, `packages/mobile/src/services/__tests__/syncManager.test.ts`, `packages/electron/src/services/syncManager.ts`, `packages/electron/src/services/__tests__/syncManager.test.ts`]
- tests_run: [`npm run build` in `packages/web`, `npm test -- --runInBand --watchAll=false --runTestsByPath src/services/__tests__/syncManager.test.ts` in `packages/mobile`, `node ..\\..\\node_modules\\jest\\bin\\jest.js --runInBand --config %TEMP%\\flashpad-electron-jest.config.cjs src/services/__tests__/syncManager.test.ts` in `packages/electron`, `npm run build:ci` in `packages/electron`]
- notes: `Web, mobile, and Electron now send stable per-install device IDs and note baseVersion values on update paths, and mobile/web surface 409 conflicts by refreshing from the latest server note instead of silently replaying stale edits. Residual risk: legacy category-only move flows that still bypass note update semantics should be revisited if they become user-facing conflict paths.`

### P2.4 Fix JWT expiry parsing in the shared client (`F13`)
- status: `completed`
- owner: `codex`
- files_touched: [`packages/shared/package.json`, `packages/shared/README.md`, `packages/shared/tests/api-client.test.js`]
- tests_run: [`npm test` in `packages/shared`]
- notes: `Added explicit regression coverage for base64url JWT expiry parsing and wired a runnable shared-package test command. The payload normalization fix was already present in the shared client and is now locked in by executable tests.`

## P3

### P3.1 Remove runtime third-party dependency from Electron migration (`F14`)
- status: `completed`
- owner: `codex`
- files_touched: [`packages/electron/src/services/migration.ts`, `packages/electron/jest.config.ts`, `packages/electron/src/types/sql-wasm-url.d.ts`, `packages/electron/src/types/sql-wasm-url.mock.ts`, `packages/electron/src/services/__tests__/migration.test.ts`]
- tests_run: [`npm run build:ci` in `packages/electron`, `node ..\\..\\node_modules\\jest\\bin\\jest.js --runInBand --config %TEMP%\\flashpad-electron-jest.config.cjs src/services/__tests__/migration.test.ts src/services/__tests__/updater-listeners.test.ts` in `packages/electron`]
- notes: `Electron now bundles the sql.js wasm asset locally and migration initialization resolves it from the packaged build instead of sql.js.org, so legacy localStorage migration works offline. Residual risk: this was verified through production build output and focused unit coverage, not a packaged-app migration smoke run on this host.`

### P3.2 Isolate mobile environment switching (`F15`)
- status: `completed`
- owner: `codex`
- files_touched: [`packages/mobile/App.tsx`, `packages/mobile/src/config.ts`, `packages/mobile/src/contexts/AuthContext.tsx`, `packages/mobile/src/screens/AccountScreen.tsx`, `packages/mobile/src/services/authStorage.ts`, `packages/mobile/src/services/database.ts`, `packages/mobile/src/services/h4-storage.ts`, `packages/mobile/src/__tests__/config.test.ts`, `packages/mobile/src/services/__tests__/authStorage.test.ts`, `packages/mobile/src/services/__tests__/database.test.ts`, `packages/mobile/src/services/__tests__/h4-storage.test.ts`]
- tests_run: [`npm test -- --runInBand --watchAll=false --runTestsByPath src/__tests__/config.test.ts src/services/__tests__/authStorage.test.ts src/services/__tests__/database.test.ts src/services/__tests__/h4-storage.test.ts src/services/__tests__/syncManager.test.ts` in `packages/mobile`]
- notes: `Mobile local auth, notes, categories, sync queue, and H4 pending logs are now namespaced by API environment, and environment changes remount the auth tree, clear live session state, flip the active environment, and restart the app so the previous ApiClient/SignalR session cannot keep talking to the old backend. Residual risk: this was verified through focused Jest coverage rather than an on-device restart smoke test, and the per-install device ID remains shared across environments by design.`

### P3.3 Harden client-log ingestion (`F16`)
- status: `completed`
- owner: `codex`
- files_touched: [`packages/backend/Controllers/ClientLogsController.cs`, `packages/backend/DTOs/ClientLogDtos.cs`, `packages/backend/Observability/ClientLogSanitizer.cs`, `packages/backend/Flashpad.Tests/ClientLogsControllerTests.cs`]
- tests_run: [`dotnet test packages/backend/Flashpad.Tests/Flashpad.Tests.csproj`, `dotnet build packages/backend/Flashpad.csproj`]
- notes: `Client log ingestion now enforces request-size and batch-size limits, validates/scalars-only metadata, drops suspicious attribution fields, and stamps server-known request/user identity onto ingested entries. Residual risk: clientDeviceId remains an untrusted client hint because this repo does not yet have a separately verified server-side device identity to stamp instead.`

### P3.4 Validate paging and request bounds in the backend (`F17`)
- status: `completed`
- owner: `codex`
- files_touched: [`packages/backend/Controllers/NotesController.cs`, `packages/backend/Flashpad.Tests/NotesControllerTests.cs`]
- tests_run: [`dotnet test packages/backend/Flashpad.Tests/Flashpad.Tests.csproj`, `dotnet build packages/backend/Flashpad.csproj`]
- notes: `Notes list endpoints now reject invalid page/pageSize values, clamp oversized page sizes, and fail fast on page offsets that would overflow server-side paging math.`

### P3.5 Replace `EnsureCreated()` with migrations (`F18`)
- status: `completed`
- owner: `codex`
- files_touched: [`packages/backend/Data/DatabaseMigrationBootstrapper.cs`, `packages/backend/Data/DesignTimeAppDbContextFactory.cs`, `packages/backend/Data/Migrations/20260412201419_InitialCreate.cs`, `packages/backend/Data/Migrations/20260412201419_InitialCreate.Designer.cs`, `packages/backend/Data/Migrations/AppDbContextModelSnapshot.cs`, `packages/backend/Program.cs`, `packages/backend/README.md`, `packages/backend/Data/DatabaseSchemaInitializer.cs`, `packages/backend/Flashpad.Tests/DatabaseMigrationBootstrapperTests.cs`]
- tests_run: [`dotnet test packages/backend/Flashpad.Tests/Flashpad.Tests.csproj`, `dotnet build packages/backend/Flashpad.csproj`]
- notes: `Startup now runs EF Core migrations instead of EnsureCreated(), with a one-time SQLite bootstrap path that seeds migration history only for complete legacy EnsureCreated() databases and recreates the missing RefreshSessions table before normal migration flow. Residual risk: partially modified legacy SQLite databases still fail fast and require manual repair or recreation.`

### P3.6 De-duplicate Electron updater listeners (`F19`)
- status: `completed`
- owner: `codex`
- files_touched: [`packages/electron/electron/main.ts`, `packages/electron/src/services/updater-listeners.ts`, `packages/electron/src/services/__tests__/updater-listeners.test.ts`]
- tests_run: [`npm run build:ci` in `packages/electron`, `node ..\\..\\node_modules\\jest\\bin\\jest.js --runInBand --config %TEMP%\\flashpad-electron-jest.config.cjs src/services/__tests__/migration.test.ts src/services/__tests__/updater-listeners.test.ts` in `packages/electron`]
- notes: `Updater event wiring is now registered once and reused across repeated manual/background update checks, preventing duplicate dialogs and stacked listeners after window recreation. Residual risk: there is still no packaged end-to-end updater smoke in this turn, but repeated-listener behavior is covered by focused unit tests.`
