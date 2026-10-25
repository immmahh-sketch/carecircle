# Task: build the HomeHub iPhone app and ship it via TestFlight

You are working in `homehub/ios/` of this repo. The hub (Node, in `../`) already exists and has 21 passing tests. Read `../README.md` and `../deploy/README.md` first, then `../src/server.js` (the API contract) and `../src/core/recipes.js`.
The owner is not a developer. Explain steps plainly, do the work yourself wherever possible, and say exactly what they must click when you can't.

## Goal
A fully native SwiftUI app (iOS 17+) for one private user, distributed only through **TestFlight (internal testing)** from their paid Apple Developer account. No App Store release, no selling.

## Architecture rules
- All logic lives in the hub. The app is a native client + the phone-only features (background location, notifications). Prefer driving UI from `GET /api/state` so most hub changes need no app rebuild.
- Hub URL (e.g. `https://home.letsquiz.uk`) and admin key are entered once on first launch and stored in the **Keychain**. Never hard-code or commit them.
- If the hub is behind Cloudflare Access, support an optional service token (`CF-Access-Client-Id` / `CF-Access-Client-Secret` headers), also in Keychain.
- No third-party dependencies unless clearly worth it. Use `URLSession` (async/await) and an SSE reader over `URLSession.bytes` for `GET /api/events?key=...` (events: `state`, `change`, `log`).
- Generate the Xcode project with **XcodeGen** (`project.yml`) so the repo has no `.xcodeproj` merge pain and CI can build it.

## Features (in this order; commit after each)
1. Onboarding (URL + key), connection status, pull-to-refresh, live updates via SSE.
2. Devices by room: on/off, brightness, colour wheel + presets (`POST /api/devices/:id/command` with `{patch}` or `{preset}`), warm↔cool slider, power watts + small chart (`/history`), offline badge, quick off-timers (`/timer`), rename.
3. Scenes: list, activate, create from current state (`capture`).
4. Automations: list with enable toggle, run now, delete, and recipe forms generated from `recipes[].fields` (kinds: device, devices, person, zone, scene, number, time, onoff, days).
5. Flic buttons screen: heard-just-now highlight, assign click/double/hold actions (`/api/buttons/...`), show the webhook URL pattern.
6. **Arrive/leave detection (the main reason for the native app):** CoreLocation `CLMonitor` (or `CLCircularRegion` monitoring) for each hub zone, "Always" permission with a clear explanation, works with the app closed. On enter/exit call the hub's public webhook `POST/GET {hub}/geo/{personToken}/{zoneId}/{enter|leave}`. Also send a position fix via `POST /geo/{token}` on significant location change. Queue and retry if offline. Add a visible log of the last events sent so the owner can debug.
7. Local notifications are optional; hub-side `notify` uses ntfy, so first suggest installing the ntfy iOS app instead of building push.
8. Settings: zones (use current location), people, connections status, activity log.

## TestFlight pipeline (GitHub Actions on a macOS runner)
- `.github/workflows/ios-testflight.yml` (repo root): on push to a `release/ios` branch or manual dispatch → install XcodeGen → generate project → `xcodebuild archive` → export → upload to App Store Connect using an **App Store Connect API key** (Issuer ID, Key ID, .p8 contents as GitHub secrets). Use automatic signing with `-allowProvisioningUpdates` and the API key (`-authenticationKeyPath/-authenticationKeyID/-authenticationKeyIssuerID`), or fastlane if that proves more reliable. Auto-increment the build number from `github.run_number`.
- Never print secrets in logs. Never commit `.p8`, certificates or profiles.
- Write a step-by-step checklist (`ios/SETUP.md`) for the owner covering, with exact click paths:
  1. Apple Developer: register an App ID / bundle ID (e.g. `uk.letsquiz.homehub`) with Location capability.
  2. App Store Connect: create the app record; enable TestFlight; add the owner as an **internal tester** (no Apple review needed).
  3. Create an App Store Connect API key (role: App Manager); add the 3 GitHub repo secrets.
  4. Run the workflow; install from the TestFlight app; note builds expire after 90 days and are re-uploaded by re-running the workflow.
- You cannot build iOS on Linux/Windows. Do NOT claim the app compiles or works unless a CI run actually succeeded. Read CI logs and fix build errors until green, then say so honestly.

## Working rules
- Small commits, clear messages, on a feature branch; keep `../` tests passing (`cd .. && npm test`). Add Swift unit tests for the API client, SSE parser and geofence event queue (`xcodebuild test` in CI).
- If hub API changes are needed, make them in `../src/server.js` with tests.
- Ask the owner before anything that costs money, touches their Apple/Cloudflare/GitHub account settings, or needs their credentials. Never ask for passwords; use API keys and secrets they paste into GitHub themselves.
- Be honest about what was and wasn't tested.
