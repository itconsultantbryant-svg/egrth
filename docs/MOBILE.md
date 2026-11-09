# Native delivery and test plan

## Implemented foundation

Expo Router, React Native primitives, shared API/role contracts and branding. Dashboard and role-scoped More navigation expose permitted resources. Native forms render the shared operational workflow descriptors, including admin site qualification/quotes/activation, collection/receiving, manual billing/payment review and complaints. Related UUIDs are visible/copyable; selection/QR UX remains basic.

Collectors: cache at most 50 assigned jobs, 24-hour expiry, user+membership partitioning, SQLCipher key in SecureStore. Collection Draft/Queued/Syncing/Confirmed/Needs Review queue records include original version and UUID idempotency key. Interrupted sync resets only in-progress queue state to Queued; server remains authoritative. Payments/receiving are never queued. A stale assignment/version becomes Needs Review and retains payload for recovery. Logout warns about unsynced work and deletes local records before discarding credentials. Full attachment file retry and automatic foreground/reconnect sync are not implemented.

## Build prerequisites and commands

1. Expo account and authorized EAS project; set project ID via reviewed app config. Do not fabricate a project ID.
2. Reachable staging HTTPS API, isolated staging DB/auth audience. Set mobile `EXPO_PUBLIC_API_URL`; server secrets stay on server.
3. Developer build required for SQLCipher. Add `expo-dev-client` through `expo install` before the development profile is used.
4. In `apps/mobile`:

```sh
pnpm exec expo install --check
pnpm dlx eas-cli build --platform android --profile android-internal
pnpm dlx eas-cli build --platform ios --profile ios-simulator
# Signing/account authorization required for physical iOS development/TestFlight:
pnpm dlx eas-cli build --platform ios --profile development
```

Android `android-internal` produces an APK for internal distribution, not an observed Google Play internal-testing upload. Google Play requires account/track configuration; iOS device distribution requires Apple membership, certificates, provisioning and device registration. `production` is a reviewable profile, not permission to publish. No app-store submission is authorized.

## Required device acceptance (not executed yet)

- Android internal binary + emulator/physical device, iOS simulator/development binary.
- Login/logout and revocation; secure credential storage; refresh rotation/reuse; deep link; org switching.
- At least 200% dynamic text, TalkBack/VoiceOver traversal, screen keyboard avoidance, 44+ pt touch targets.
- Airplane mode: cached assigned jobs, draft pickup, kill/restart app, queue/reconnect, distinguish local from Confirmed.
- Reassign job and change entity version while offline: Needs Review, original payload retained, no forced overwrite.
- Duplicate sync key returns original response; changed payload returns conflict; no cross-user queue disclosure.
- Camera permission denied with manual alternative (camera scanner not implemented; manual IDs currently only).
- Attachment upload interruption/retry/logout cleanup (file queue not implemented; remains blocker).

SQLCipher setup requires a native build and must be verified on device. Metro bundling/typechecking alone does not validate encryption, secure storage, accessibility or offline restart behavior.
