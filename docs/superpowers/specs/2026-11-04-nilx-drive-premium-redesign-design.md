# Nilx Drive Premium Redesign — Design

**Date:** 2026-11-04
**Target:** Nilx Drive 1.1.1 interface rebuild, Android WebView
**Approach chosen:** A — in-place premium shell over the existing Three.js engine

## Intent

Turn Nilx Drive from a functional vertical slice into a cohesive, premium, offline
vehicle combat and stunt sandbox. The reference image sets the visual language:
black/graphite surfaces, violet and electric-cyan accents, a cinematic neon-city
hero stage, left-aligned navigation, top progression strip, and a bottom mode row.

The existing engine, physics, vehicles, worlds, deformation, assists and GitHub
updater stay in place. All new screens read and write real game state.

## Goals

- One visual and interaction system across loading, menu, garage, worlds,
  collection, settings, about, gameplay, pause, results and the update popup.
- A cinematic original neon-city showroom rendered by the existing Three.js
  renderer, with the selected vehicle as the hero and touch-drag rotation.
- Fully functional screens with no dead buttons or decorative controls.
- Local progression: driver level, XP, credits, achievements, collection,
  statistics, cosmetic purchases.
- Real settings that change rendering, controls, HUD, audio, vibration and camera.
- A polished landscape HUD with real speed, RPM, gear, damage, assists and minimap.
- Session statistics and a results screen driven only by actual gameplay.
- Preserve the GitHub release checker and update popup.
- Keep the app fully offline, original and free of real-money systems.

## Non-goals / explicit limitations

- No online multiplayer, server browser, online leaderboards or fake player counts.
- No real-money purchases, premium currency or fake economy.
- No nitro: it is not implemented, so no nitro HUD element is shown.
- No new vehicle meshes. The content matrix has 200 data shells built from **two
  procedural chassis models** (Derby and Sport). The UI labels the two chassis
  honestly and marks unfeatured entries as content shells sharing a chassis.
- No new playable worlds. Only `arena-01` and `open-01` are playable; the other 53
  profiles are clearly marked **Coming Soon** and cannot be deployed.
- No body kits or wheel geometry replacement. Customization covers paint, accent,
  rim finish, underglow, decals and chassis preview where supported.
- No copied reference art. The neon city is built from original Three.js geometry,
  CSS and canvas textures.
- No audio files are added. Engine, collision, UI and music audio are synthesized
  with the Web Audio API.
- Version remains 1.1.1 for this build. Publishing this redesign requires a version
  bump and a new GitHub release; that is a separate release decision.

## Technical constraints

- Android WebView, landscape, minSdk 24, targetSdk 34, compileSdk 35.
- Offline assets under `https://androidplatform.net/assets/www/`; CSP forbids
  remote scripts and connections. Update checks stay native.
- Existing content validation requires exactly 200 vehicles and 55 worlds.
- Low-end target: vivo T4 Lite. Effects must be conservative and adaptive.
- Fixed physics step is 1/90 s. No physics rewrite.
- Existing working IDs and update bridge must not be broken.

## Architecture

Keep the single-page app and the existing Three.js renderer. Add focused modules:

- `js/progress.js` — local progression, achievements, collection, cosmetics.
- `js/settings.js` — local settings model and defaults.
- `js/audio.js` — synthesized Web Audio engine, SFX and ambient music.
- `js/showroom.js` — neon-city showroom scene, vehicle staging, orbit/drag.
- `js/minimap.js` — real world/obstacle/vehicle minimap.
- `js/ui.js` — screen router and all screen rendering/behaviour.
- `js/game.js` — unchanged driving model, plus showroom mode, session stats,
  settings hooks, audio/vibration triggers and run completion.
- `js/models.js` — material handles and cosmetic application (paint, accent,
  rims, underglow, decals).
- `js/car.js` / `js/input.js` — customization pass-through, RPM ratio and
  sensitivity. No handling rewrite.

The renderer is shared. In menu/garage screens the game renders the showroom
scene at a capped rate; in gameplay it renders the world scene at full rate.

## Screen map

1. **Loading** — brand mark, real boot stages, progress, minimum brand beat.
2. **Main menu** — top progression strip; left nav (Play, Garage, Worlds,
   Collection, Settings, Quit); hero car; active rig/world summary; three real
   mode cards (Arena, Airport, Random Build) plus a Driver Pass/progression card;
   footer with version and update status.
3. **Garage** — searchable/filterable 200-shell roster; 3D preview with drag
   rotation; detail/stats; chassis and content-shell honesty labels; customization
   drawer (paint, accent, rim, neon, decal, chassis); deploy.
4. **Worlds** — 55 profiles; category filters; previews from actual world captures
   for playable worlds and data-driven environment art for shells; coming-soon
   state; deploy for the two playable worlds.
5. **Collection** — Profile, Vehicles, Achievements, Stats tabs.
6. **Settings** — display, audio, controls, data and about sections. Every control
   applies immediately and persists.
7. **About** — version, build, engine/content inventory, update status, update
   check, latest release link, license and limitation notes.
8. **Gameplay HUD** — minimap, world/vehicle context, radial tachometer/speed,
   gear, damage, assists, camera, pause, steering, throttle/brake, handbrake.
9. **Pause** — resume, restart, garage, settings, end run, quit to menu.
10. **Results** — run reason, distance/time/top speed/impacts/airtime/max damage,
    credits, XP, level progress, new achievements, retry/garage/menu.
11. **Update popup** — existing GitHub release notice, restyled to the new system.

Navigation: screens form a stack. Android back and Escape close the top layer,
then return to menu/pause, then exit the app. Screen changes use a 200–260 ms
fade/slide with reduced-motion support.

## Progression model

Stored under `nilx-drive-progress-v1`:

- level, xp, credits
- totals: runs, distance, top speed, impacts, airtime, max damage, play time,
  credits earned, XP earned
- driven vehicle ids, visited world ids
- achievement unlock timestamps
- per-vehicle customization and purchased cosmetic ids

Rewards use actual session values:

- credits = distance × 0.55 + impacts × 18 + airtime × 12 + top speed × 1.5
  + max damage × 4 (rounded)
- XP = distance × 0.18 + impacts × 6 + airtime × 8 + top speed × 0.6
  + max damage × 1.5 (rounded)
- Level threshold: 900 XP for level 2, +450 per level after that.
- Achievements award fixed credits/XP and are evaluated once from persisted stats.
- All 200 shells are available from the start. No vehicle is locked, because there
  are no unique models to unlock. Cosmetic neon/decals are purchased with earned
  credits; paint, accent and rim finishes are free.

## Settings model

Stored under `nilx-drive-settings-v1`:

- Graphics quality: Performance / Balanced / Quality — pixel ratio cap, shadows,
  showroom intensity.
- Resolution scale: 70% / 85% / 100%.
- HUD scale: Compact / Normal / Large.
- Music and SFX volume.
- Steering sensitivity: 0.6–1.4.
- Steering side: left / right.
- Vibration: on/off (Android VIBRATE permission; no-op on unsupported devices).
- Default camera: chase / wide.
- Reset settings; reset progress (two-step).

Settings apply immediately. Reset progress clears progression only, not settings.

## Showroom

Original procedural neon city:

- dark wet floor with canvas neon streaks and reflective material response
- instanced skyline using a generated lit-window texture
- violet/cyan point lights, bridge silhouette, fog, spot cones
- selected vehicle staged right-of-centre; slow auto-orbit; touch drag yaw/pitch
- chassis-accurate vehicle, cosmetic paint/rims/neon/decals applied live
- quality switch disables shadows and reduces pixel ratio on low-end devices

## Gameplay additions (no physics rewrite)

- Session tracker: distance, top speed, airtime, impacts, max damage, duration.
- Results on End Run, Quit to Menu, or 100% damage total loss.
- Real minimap from world bounds, obstacles, ramps, player and rival.
- HUD tachometer from actual RPM; damage from actual damage; assists from actual
  active states.
- Audio: engine pitch from RPM, collision burst from impact speed, UI clicks,
  ambient music; volumes from settings.
- Vibration on real collisions when enabled.
- Camera default from settings; in-game camera toggle remains.
- HUD/touch controls sized for phone landscape and steering-side preference.

## Visual system

- Graphite/black glass, violet primary, electric-cyan secondary.
- Original text wordmark with geometric X accent; no external font files.
- Roboto/system sans for UI, Roboto Mono for telemetry and labels.
- Panels use layered gradients, hairline borders, inner highlights and limited
  blur (blur disabled at performance quality).
- Consistent 8 px spacing scale, uppercase mono micro-labels, 1.5–2 px letter
  spacing in labels, large condensed display headings.
- Motion: staggered menu reveals, 220 ms screen transitions, 180 ms hover,
  260 ms modal rise, count-up rewards, reduced-motion fallback.

## QA and delivery

- CDP harness navigates every screen, asserts visibility/state, exercises all
  buttons, settings, garage, worlds, gameplay, pause, results and persistence.
- Existing update test and gameplay smoke test updated and rerun.
- Android debug build, signature, version, APK hash and logcat check.
- Screenshots of menu, garage, worlds, collection, settings, gameplay, pause,
  results and about saved under `docs/screenshots/redesign/`.
- Final report lists implemented screens, preserved systems, new features,
  incomplete items, asset inventory, performance findings, errors fixed, test
  results and APK path/size.
