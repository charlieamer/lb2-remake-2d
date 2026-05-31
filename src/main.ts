import { createInitialBattle, stepBattle } from './domain/simulation.js';
import type { PilotInput, Vec2 } from './domain/types.js';
import { cameraForState, createAssets, renderBattle, renderMinimap, screenToWorld } from './presentation/renderer.js';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root missing');

app.innerHTML = `
  <section class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Jane's Longbow 2 inspired · top-down campaign slice</p>
        <h1>Longbow 2D Tactical</h1>
      </div>
      <button id="modeButton" class="primary">FLY</button>
    </header>
    <div class="briefing" id="briefing">
      <strong>Planner:</strong> Review the full 50×50 km AO, front lines, FARPs, river valleys, forests, and enemy threats. Tap the map to set an ingress waypoint; tap <b>FLY</b> to enter the live battle.
    </div>
    <div class="game-frame">
      <canvas id="battle" aria-label="battle map"></canvas>
      <canvas id="minimap" aria-label="minimap"></canvas>
      <div class="hud" id="hud"></div>
    </div>
    <nav class="controls" aria-label="flight controls">
      <button data-hold="turnLeft">↺</button>
      <button data-hold="forward">▲</button>
      <button data-hold="turnRight">↻</button>
      <button data-hold="strafeLeft">◀</button>
      <button data-hold="back">▼</button>
      <button data-hold="strafeRight">▶</button>
      <button data-hold="down">ALT−</button>
      <button id="cannon">CANNON</button>
      <button data-hold="up">ALT+</button>
      <button id="missile" class="danger">MISSILE</button>
    </nav>
  </section>
`;

const battleCanvas = document.querySelector<HTMLCanvasElement>('#battle');
const minimapCanvas = document.querySelector<HTMLCanvasElement>('#minimap');
const modeButton = document.querySelector<HTMLButtonElement>('#modeButton');
const hud = document.querySelector<HTMLDivElement>('#hud');
const briefing = document.querySelector<HTMLDivElement>('#briefing');
const cannonButton = document.querySelector<HTMLButtonElement>('#cannon');
const missileButton = document.querySelector<HTMLButtonElement>('#missile');
if (!battleCanvas || !minimapCanvas || !modeButton || !hud || !briefing || !cannonButton || !missileButton) throw new Error('UI wiring failed');

const state = createInitialBattle();
const assets = createAssets(state);
const battleCtx = battleCanvas.getContext('2d');
const minimapCtx = minimapCanvas.getContext('2d');
if (!battleCtx || !minimapCtx) throw new Error('Canvas 2D unavailable');

const held = new Set<string>();
let fireCannon = false;
let fireMissile = false;
let pendingWaypoint: Vec2 | undefined;
let last = performance.now();

const resize = (): void => {
  const rect = battleCanvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  battleCanvas.width = Math.floor(rect.width * dpr);
  battleCanvas.height = Math.floor(rect.height * dpr);
  minimapCanvas.width = Math.floor(132 * dpr);
  minimapCanvas.height = Math.floor(132 * dpr);
  battleCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
};
window.addEventListener('resize', resize);
resize();

const pointerPosition = (event: PointerEvent): Vec2 => {
  const rect = battleCanvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
};

battleCanvas.addEventListener('pointerdown', (event) => {
  const camera = cameraForState(state);
  pendingWaypoint = screenToWorld(pointerPosition(event), camera, battleCanvas);
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-hold]')) {
  const key = button.dataset.hold;
  if (!key) continue;
  button.addEventListener('pointerdown', () => held.add(key));
  button.addEventListener('pointerup', () => held.delete(key));
  button.addEventListener('pointerleave', () => held.delete(key));
  button.addEventListener('pointercancel', () => held.delete(key));
}
cannonButton.addEventListener('pointerdown', () => { fireCannon = true; });
missileButton.addEventListener('pointerdown', () => { fireMissile = true; });
modeButton.addEventListener('click', () => {
  if (state.status === 'planning') {
    state.status = 'flying';
    modeButton.textContent = 'RESET';
    briefing.hidden = true;
  } else {
    location.reload();
  }
});

const buildInput = (): PilotInput => {
  const manual = held.size > 0;
  const input: PilotInput = {
    forward: (held.has('forward') ? 1 : 0) + (held.has('back') ? -1 : 0),
    strafe: (held.has('strafeRight') ? 1 : 0) + (held.has('strafeLeft') ? -1 : 0),
    turn: (held.has('turnRight') ? 1 : 0) + (held.has('turnLeft') ? -1 : 0),
    climb: (held.has('up') ? 1 : 0) + (held.has('down') ? -1 : 0),
    fireCannon,
    fireMissile,
    ...(!manual && pendingWaypoint ? { setAutopilotTarget: pendingWaypoint } : {}),
  };
  pendingWaypoint = undefined;
  fireCannon = false;
  fireMissile = false;
  return input;
};

const updateHud = (): void => {
  const pilot = state.units.find((u) => u.id === state.selectedUnitId);
  const redAlive = state.units.filter((u) => u.team === 'red' && u.health > 0).length;
  hud.innerHTML = pilot ? `
    <div><b>${state.status.toUpperCase()}</b> ${state.message}</div>
    <div>ALT ${Math.round(pilot.altitudeM)} m · HP ${Math.max(0, Math.round(pilot.health))} · AGM ${pilot.missiles}</div>
    <div>Blue territory ${(state.blueTerritoryRatio * 100).toFixed(1)}% · Enemy contacts ${redAlive}</div>
  ` : `<div>${state.message}</div>`;
};

const frame = (now: number): void => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state.status === 'flying') stepBattle(state, dt, buildInput());
  const camera = cameraForState(state);
  renderBattle(battleCtx, state, assets, camera);
  renderMinimap(minimapCtx, state, assets);
  updateHud();
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
