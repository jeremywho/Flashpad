# Flashpad Follow-Up Runbook

Date: 2026-04-12

Source documents:
- `FLASHPAD-REMEDIATION-STATUS.md`
- `FLASHPAD-REMEDIATION-PLAN-2026-04-12.md`
- `FLASHPAD-CODE-REVIEW-2026-04-12.md`

This document collects the work that still needs owner follow-up after the remediation pass. It focuses on operational tasks, release-signing material, checked-in key material, and residual hardening work that was intentionally left for later.

## Current State

- All remediation-plan items are terminal in `FLASHPAD-REMEDIATION-STATUS.md`.
- The only plan item still formally blocked is `P0.1` secret rotation.
- Android `assembleDebug` now passes on React Native `0.85.0`.
- Android `assembleRelease` now fails closed unless private release-signing inputs are supplied.
- Electron path traversal, external-navigation lockdown, telemetry redaction, offline retry retention, and mobile logout isolation are complete.

## Highest-Priority Follow-Up

### 1. Rotate and Revoke Previously Committed Backend Secrets

Status: required, not completed in repo.

Why this is still open:
- `packages/backend/appsettings.json` and `packages/backend/appsettings.Production.json` previously contained live backend secret material.
- The code now requires production secrets to come from external configuration, but the old values must still be treated as compromised.

Secrets to rotate:
- JWT signing secret(s) previously committed in backend config.
- H4 API key previously committed in backend config.

Required actions:
- Generate replacement JWT signing secret(s).
- Generate or issue a replacement H4 API key.
- Update deployment secret storage and CI secret storage with the new values.
- Restart or redeploy the backend so production uses only `JwtSettings__SecretKey` and `H4__ApiKey` from external configuration.
- Revoke the old H4 API key.
- Treat previously issued JWTs as compromised and force reauthentication if your deployment model requires it.
- Audit CI logs, deployment manifests, build artifacts, backups, crash dumps, copied `.env` files, and host-level config management for the old values.

Verification:
- Production startup succeeds only when `JwtSettings__SecretKey` and `H4__ApiKey` are supplied externally.
- Authentication works with the new JWT secret.
- H4 ingestion works with the new H4 key.
- No current deployment artifact or checked-in config contains the old values.

Recommended owner:
- platform / deployment / security

## Checked-In Key Material and Signing Follow-Up

### 2. Provision the Real Android Release Keystore Outside the Repo

Status: required before producing a signed production Android artifact.

Current state:
- `packages/mobile/android/app/build.gradle` now rejects release builds unless all of these are provided externally:
  - `FLASHPAD_RELEASE_STORE_FILE`
  - `FLASHPAD_RELEASE_STORE_PASSWORD`
  - `FLASHPAD_RELEASE_KEY_ALIAS`
  - `FLASHPAD_RELEASE_KEY_PASSWORD`
- This is the intended fail-closed behavior.

Required actions:
- Generate or retrieve the real private Android release keystore.
- Store the keystore file and its passwords in CI / deployment-managed secrets, not in the repo.
- Wire CI or release automation to supply the four `FLASHPAD_RELEASE_*` values at build time.
- Run:
  - `.\gradlew.bat :app:assembleRelease`
  - `.\gradlew.bat :app:bundleRelease`
- Archive the signed artifact and record the signing certificate fingerprint used for release.

Verification:
- `assembleRelease` succeeds only when the private keystore material is supplied.
- The signed APK/AAB is not using the debug keystore.

Recommended owner:
- mobile / release engineering

### 3. Decide How to Handle the Tracked Android Debug Keystore

Status: follow-up decision required.

Tracked key material currently in source control:
- `packages/mobile/android/app/debug.keystore`

Important context:
- This is not the production release keystore.
- Release builds no longer use it.
- It is still a signing key file committed to git, so if your policy is "no private keys or signing keys in source control", this should be removed.

Recommended approach if you want zero signing keys in git:
- Update debug-signing behavior to use a developer-local debug keystore instead of the repo copy.
- Preferred options:
  - rely on the default Android debug keystore under the developer profile, or
  - generate a local debug keystore outside the repo and point debug builds at it.
- Remove the tracked repo copy:
  - `git rm --cached packages/mobile/android/app/debug.keystore`
- Add an ignore rule so it is not reintroduced.
- Verify with:
  - `git ls-files *.jks *.keystore *.p12 *.pfx`

History follow-up:
- If you want to remove the keystore from repository history as well, coordinate a history rewrite.
- If you rewrite history, notify every collaborator because they will need to reset or re-clone.
- History rewrite does not replace secret rotation; it only reduces future accidental redistribution and scanner noise.

Recommended owner:
- mobile / security / repo admin

## iOS Follow-Up

### 4. Bring iOS Pods Up to React Native 0.85.0

Status: required for iOS parity, not yet verified on this Windows host.

Current state:
- Android is now on React Native `0.85.0`.
- `packages/mobile/ios/Podfile.lock` still references the previous React Native line and needs a macOS-side CocoaPods refresh.

Required actions on macOS:
- `cd packages/mobile/ios`
- `pod install`
- commit the resulting `Podfile.lock` and workspace changes if they are expected
- run an iOS build on simulator and device if relevant

Verification:
- CocoaPods resolves React Native `0.85.0` dependencies.
- The app launches and basic auth / notes flows still work on iOS.

Recommended owner:
- mobile / iOS

## Security Hardening Follow-Up

These are not blocked plan items, but they remain worth scheduling.

### 5. Move Mobile Refresh Tokens Out of AsyncStorage

Status: residual risk from completed `P1.5`.

Current state:
- The auth redesign is complete.
- Mobile still stores refresh tokens in `AsyncStorage`.

Follow-up:
- Move mobile refresh-token storage to OS-backed secure storage.
- Re-run login, refresh, logout, and app-restart flows after the migration.

Recommended owner:
- mobile / auth

### 6. Add OS-Backed Secure Session Storage for Electron

Status: residual tradeoff from completed `P1.3`.

Current state:
- Electron no longer exposes the token bridge and does not keep tokens in `localStorage`.
- Desktop auth is currently in-memory only, which is safer but forces reauthentication after full app restart.

Follow-up:
- If persistent desktop sessions are desired, add Windows Credential Manager / macOS Keychain / equivalent secure storage.
- Keep renderer access indirect through the main process.

Recommended owner:
- Electron / auth

### 7. Decide Whether to Add Server-Verified Device Identity for Client Logs

Status: residual limitation from completed `P3.3`.

Current state:
- Client-log ingestion now validates payload size and schema and stamps server-known request/user identity.
- `clientDeviceId` is still only a client hint.

Follow-up:
- If device-level auditability matters, add a server-issued device identity rather than trusting a client-supplied field.

Recommended owner:
- backend / observability

## Validation and Release Confidence Follow-Up

### 8. Run a Packaged Electron Migration Smoke Test

Status: recommended.

Current state:
- The `sql.js` runtime fetch dependency was removed and unit coverage was added.
- The packaged migration path was not fully exercised end-to-end on this machine.

Follow-up:
- Test a legacy local profile migration in a packaged Electron build.
- Confirm offline startup and migration succeed with no network dependency.

Recommended owner:
- Electron / QA

### 9. Run an Electron Updater Smoke Test in a Packaged Build

Status: recommended.

Current state:
- Updater listener duplication is covered by focused unit tests.
- There was no full packaged updater smoke test in this remediation pass.

Follow-up:
- Run repeated update checks across window recreation in a packaged app.
- Confirm there are no duplicate prompts or duplicate install flows.

Recommended owner:
- Electron / release engineering

### 10. Run an On-Device Mobile Environment-Switch Smoke Test

Status: recommended.

Current state:
- Environment isolation is covered by Jest.
- The restart / remount behavior was not validated on a real mobile device in this pass.

Follow-up:
- Switch between local/prod environments on device.
- Confirm auth, cached notes, sync queue, and H4 pending logs stay environment-scoped across restart.

Recommended owner:
- mobile / QA

### 11. Document Legacy SQLite Recovery for Partial Databases

Status: recommended.

Current state:
- The backend now uses migrations with a guarded bootstrap path.
- Partially modified legacy SQLite databases still fail fast and require manual repair or recreation.

Follow-up:
- Write a small operator playbook for:
  - identifying a partially bootstrapped DB
  - backing it up
  - deciding between manual repair and recreation

Recommended owner:
- backend / ops

## Suggested Order

Do these in this order:

1. Rotate and revoke the historically committed backend secrets.
2. Provision the private Android release keystore in CI / secret storage.
3. Decide whether the tracked `debug.keystore` must be removed from git under your source-control policy.
4. Refresh iOS pods on macOS for React Native `0.85.0`.
5. Schedule secure-storage follow-up for mobile and Electron sessions.
6. Run the remaining packaged / on-device smoke tests.

## Quick Checklist

- [ ] Rotate JWT signing secret(s) that were previously committed.
- [ ] Rotate and revoke the previously committed H4 API key.
- [ ] Audit CI, servers, backups, artifacts, and local deployment files for old secret values.
- [ ] Put the Android release keystore and passwords in CI / secret storage.
- [ ] Produce and verify a signed Android release artifact with `FLASHPAD_RELEASE_*`.
- [ ] Decide whether `packages/mobile/android/app/debug.keystore` must be removed from source control.
- [ ] If removing it, update debug signing to use a local non-repo keystore and optionally scrub history.
- [ ] Run `pod install` on macOS and verify iOS on React Native `0.85.0`.
- [ ] Schedule mobile secure-storage migration for refresh tokens.
- [ ] Schedule Electron OS-backed secure-session storage if persistent desktop sessions are required.
- [ ] Run packaged Electron migration / updater smokes.
- [ ] Run on-device mobile environment-switch smoke.
