# Nilx Drive Premium Redesign — Implementation Plan

**Date:** 2026-11-04
**Spec:** `docs/superpowers/specs/2026-11-04-nilx-drive-premium-redesign-design.md`
**Scope:** One deliverable: the redesigned Android WebView build with all screens wired to the existing game.

## Delivery rules

- Keep exactly 200 vehicles and 55 worlds; `validateContent()` must stay green.
- Keep `arena-01` and `open-01` as the only playable worlds.
- Keep the fixed-step physics, deformation, collisions and both chassis.
- Never add fake online players, currencies, leaderboards or purchases.
- Every visible control must either change real state or explain why it is unavailable.
- Test with CDP on the Android emulator, then build and inspect the debug APK.

## Task 1 — Design foundation and screen shell

**Files:** `index.html`, `ui.css`, `js/ui.js`, `main.js`

1. Replace the single start screen with a screen stack:
   loading, menu, garage, worlds, collection, settings, about, HUD, pause, results.
2. Keep required gameplay IDs (`game-canvas`, `hud`, telemetry, controls, update layer, fatal layer).
3. Build the graphite/violet/cyan design system in `ui.css`: tokens, glass panels,
   display type, micro-labels, screen transitions, reduced-motion fallback, landscape layout.
4. Implement a `UIController` router with `showScreen()`, `pushLayer()`, `back()`,
   focus management and keyboard/Android back handling.
5. Keep the update popup and fatal screen wired to the existing bridge.

**Verification:** every screen can be opened/closed; Escape and Android back return one layer at a time;
no console errors; 1280×720 emulator renders correctly.

## Task 2 — Local progression and settings models

**Files:** `js/progress.js`, `js/settings.js`, `js/prefs.js`, `main.js`

1. `Progress` persists `nilx-drive-progress-v1`: level, XP, credits, lifetime stats,
   driven vehicles, visited worlds, achievement timestamps, cosmetics, per-vehicle customization.
2. `awardRun(session)` computes credits/XP only from measured session values,
   levels up with 900 + 450×(level−1) thresholds, updates stats and returns a receipt.
3. `Settings` persists `nilx-drive-settings-v1`: quality, resolution scale, HUD scale,
   music/SFX, sensitivity, steering side, vibration, camera. Subscribe and apply live.
4. Integrate selection persistence with `Prefs`; reset progress only clears progression.

**Verification:** reload preserves settings/progress; awarding a synthetic run changes level/credits exactly once;
reset actions work.

## Task 3 — Neon showroom

**Files:** `js/showroom.js`, `js/models.js`, `js/game.js`, `js/car.js`

1. `Showroom` owns an original Three.js night scene: wet floor, skyline instancing,
   window texture, cyan/violet lights, fog, bridge, light cones and a staged vehicle.
2. Render through the existing `Game` WebGL renderer: showroom when not driving,
   world when driving. Never create a second WebGL context.
3. Drag to rotate; auto-orbit otherwise. Quality setting changes shadows/pixel ratio.
4. Add material handles and `applyVehicleCustomization()` for paint, accent, rims,
   underglow and decals. `Car` accepts a customization object.
5. Stage selected garage vehicle and active vehicle as real procedural chassis only.

**Verification:** menu/garage show the car; drag changes yaw; changing paint/rim/neon is visible;
no renderer context loss.

## Task 4 — Garage, customization and worlds

**Files:** `ui.css`, `js/ui.js`, `js/game.js`, `js/progress.js`

1. Garage lists all 200 shells with search and Derby/Compact/Muscle/Exotic filters.
2. Detail panel shows real stats and a chassis/content-shell honesty label.
3. Customization drawer: paint, accent, rim, neon, decal and chassis (read-only).
   Neon/decals can be purchased with earned credits; other finishes are free.
4. Deploy updates active vehicle, persists it and starts/resumes play.
5. Worlds lists all 55 profiles; category filters; real preview art for the two playable
   worlds, data-art for shells; only playable worlds deploy.
6. World cards/detail explicitly label `PLAYABLE` or `COMING SOON`.

**Verification:** counts are 200/55; filter/search counts are correct; all 200 selectable;
unplayable deploy is disabled; playable deploy changes world.

## Task 5 — Collection, results and progression UI

**Files:** `index.html`, `js/ui.js`, `js/progress.js`, `js/game.js`

1. Collection tabs: Profile, Vehicles, Achievements, Stats. All values come from `Progress`.
2. Add session tracking in `Game`: distance, top speed, airtime, impacts, max damage, duration.
3. End Run / damage-out / Main Menu produces a Results screen with measured values.
4. Results awards progress once, animates earned credits/XP and lists new achievements.
5. Retry, Garage and Menu actions are live.

**Verification:** driving increases distance/top speed; collision increases impacts/damage;
ending a run shows matching values; reload retains rewards; repeat results never double-award.

## Task 6 — Settings, about, audio and vibration

**Files:** `js/settings.js`, `js/audio.js`, `js/ui.js`, `js/game.js`, `js/input.js`, `main.js`

1. Settings screen sections: Display, Audio, Controls, Data. Changes apply immediately.
2. Quality/resolution/HUD scale/steering side/camera/sensitivity are reflected in runtime.
3. `AudioEngine` synthesizes engine, impact, UI and ambient music with Web Audio;
   volumes follow settings and start after a user gesture.
4. Vibration fires on heavy collisions only when enabled; Android permission added.
5. About shows version, build code, content inventory, update status and real update check.
6. Reset settings and two-step reset progress are functional.

**Verification:** each setting changes state and persists across reload; mute/silence works;
about update check reports a real status; reset flows require confirmation.

## Task 7 — HUD, minimap, pause and native bridge

**Files:** `index.html`, `ui.css`, `js/ui.js`, `js/game.js`, `js/minimap.js`, `js/input.js`,
`MainActivity.java`, `AndroidManifest.xml`

1. HUD: world/vehicle context, speed, tachometer arc, gear, damage, TC/ESP/ABS,
   minimap, camera, pause, throttle/brake/handbrake, steering; HUD scale class.
2. `Minimap` draws real bounds/obstacles/ramps/player/rival from `World`.
3. Pause actions: resume, restart, garage, settings, end run, main menu.
4. Native bridge additions: `getVersionCode`, update status callback
   (`idle/checking/up-to-date/update-available/error/latest-release`), vibrate.
5. Android back closes top layer; exit only from menu Quit. Add `VIBRATE` permission.

**Verification:** HUD values match game snapshot; minimap draws; pause/back stack works;
logcat has no JS exceptions; update popup test still passes.

## Task 8 — QA, build and delivery

**Files:** `tools/test-device.mjs`, `tools/test-ui.mjs`, `README.md`, `docs/screenshots/redesign/*`

1. Extend the CDP harness to visit every screen, exercise filters/search/customization,
   deploy both worlds, drive, collide, end a run, change settings, reload and verify persistence.
2. Run existing update test and gameplay smoke test.
3. Capture screenshots of menu, garage, worlds, collection, settings, gameplay, pause, results, about.
4. Build debug APK; verify package, version, signature, SHA-256 and size; inspect logcat.
5. Update README with features and honest limitations; write final report.

**Verification:** all automated checks pass, screenshots inspected, APK installs/launches and update check works.

## Execution order

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Commit after each stable group if the repository is clean.
