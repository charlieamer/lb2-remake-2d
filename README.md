# lb2-remake-2d

A mobile-first browser prototype inspired by Jane's Longbow 2 mission planning: a 2D top-down helicopter campaign slice with a live tactical map, terrain-aware line of sight, automatic unit combat, fronts, and a mission-planner-to-flight flow.

## Research notes

Longbow 2 was a Jane's Combat Simulations helicopter sim centered on the AH-64D Apache Longbow. Contemporary coverage emphasized dynamic campaigns, multiple helicopter roles, an expanded mission planner, waypoint/tasking workflows, and a tactical command-map feel before entering 3D combat. This prototype keeps that planning-map language but makes the battle itself a simplified 2D live tactical map for touch screens.

## Stack

- TypeScript ES modules compiled with `tsc` for the browser.
- No runtime framework; Canvas 2D rendering for terrain, units, LOS overlay, weapon cones, HUD, and minimap.
- Pure domain layer under `src/domain` so simulation is unit-testable separately from Canvas presentation.
- GitHub Pages deployment through `.github/workflows/pages.yml`, which builds `dist/` and publishes that artifact on every push to `main`. In the repository settings, Pages should use **GitHub Actions** as the source, not `Deploy from a branch` / `main` / `/ (root)`.

## Commands

```bash
npm run typecheck
npm test
npm run build
npm run dev
```

## GitHub Pages setup

This project should be deployed by the CI workflow, not directly from the repository root. The source files in `src/` are TypeScript, while browsers load the compiled JavaScript emitted into `dist/` by `npm run build`.

Set GitHub Pages to deploy from Actions:

1. Open **Settings → Pages** in the GitHub repository.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main`; `.github/workflows/pages.yml` will typecheck, test, build, smoke-test, upload `dist/`, and deploy it automatically.

If Pages is left on **Deploy from a branch** with `main` and `/ (root)`, GitHub serves `index.html` from the source tree. That page references `./src/main.js`, but only `src/main.ts` exists before CI builds, so the result is the blank background-only page.

## Gameplay implemented

- 50 km × 50 km procedural terrain with editable color/height logic in code: river valley, ridges, plateau, forests, slopes, and water.
- Mission planner view shows the whole AO; flight view follows the helicopter at roughly a 5 km forward tactical scale.
- Helicopter, AAA, and tank units with speeds, rotation, turrets, altitude, health, missiles, cannons, and automatic target engagement.
- Terrain-aware line-of-sight and a per-cell visibility mask that mutes/reveals contacts.
- Autopilot waypoint by tapping the map plus manual touch controls for forward/back/strafe/turn/altitude.
- Simplified front pressure and territory victory condition at 75% blue control.
