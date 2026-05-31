import { createInitialBattle, lockedTargetFor, stepBattle } from './domain/simulation.js';
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
    <div class="game-frame planning" id="gameFrame">
      <canvas id="battle" aria-label="battle map"></canvas>
      <canvas id="minimap" aria-label="minimap"></canvas>
      <div class="hud" id="hud"></div>
    </div>
    <nav class="controls" id="controls" aria-label="flight controls">
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
const gameFrame = document.querySelector<HTMLDivElement>('#gameFrame');
const controls = document.querySelector<HTMLElement>('#controls');
const hud = document.querySelector<HTMLDivElement>('#hud');
const briefing = document.querySelector<HTMLDivElement>('#briefing');
const cannonButton = document.querySelector<HTMLButtonElement>('#cannon');
const missileButton = document.querySelector<HTMLButtonElement>('#missile');
if (!battleCanvas || !minimapCanvas || !modeButton || !gameFrame || !controls || !hud || !briefing || !cannonButton || !missileButton) throw new Error('UI wiring failed');

const state = createInitialBattle();
const assets = createAssets(state);
const battleCtx = battleCanvas.getContext('2d');
const minimapCtx = minimapCanvas.getContext('2d');
if (!battleCtx || !minimapCtx) throw new Error('Canvas 2D unavailable');

const held = new Set<string>();
let fireCannon = false;
let fireMissile = false;
let pendingWaypoint: Vec2 | undefined;
let plannerCamera = cameraForState(state, { width: 500, height: 500 });
let draggingPlanner = false;
let lastPointer: Vec2 | undefined;
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

const canvasViewport = (): { width: number; height: number } => {
  const rect = battleCanvas.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
};

const pointerPosition = (event: PointerEvent): Vec2 => {
  const rect = battleCanvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
};

battleCanvas.addEventListener('pointerdown', (event) => {
  const point = pointerPosition(event);
  if (state.status === 'planning') {
    draggingPlanner = true;
    lastPointer = point;
    battleCanvas.setPointerCapture(event.pointerId);
    return;
  }
  const camera = cameraForState(state, canvasViewport());
  pendingWaypoint = screenToWorld(point, camera, battleCanvas);
});

battleCanvas.addEventListener('pointermove', (event) => {
  if (!draggingPlanner || state.status !== 'planning' || !lastPointer) return;
  const point = pointerPosition(event);
  const dx = point.x - lastPointer.x;
  const dy = point.y - lastPointer.y;
  plannerCamera = { ...plannerCamera, center: { x: plannerCamera.center.x - dx * plannerCamera.metersPerPixel, y: plannerCamera.center.y - dy * plannerCamera.metersPerPixel } };
  lastPointer = point;
});

battleCanvas.addEventListener('pointerup', (event) => {
  if (!draggingPlanner || state.status !== 'planning') return;
  draggingPlanner = false;
  lastPointer = undefined;
  const camera = cameraForState(state, canvasViewport(), plannerCamera);
  pendingWaypoint = screenToWorld(pointerPosition(event), camera, battleCanvas);
});

battleCanvas.addEventListener('pointercancel', () => { draggingPlanner = false; lastPointer = undefined; });
battleCanvas.addEventListener('wheel', (event) => {
  if (state.status !== 'planning') return;
  event.preventDefault();
  const factor = event.deltaY > 0 ? 1.16 : 0.86;
  plannerCamera = { ...plannerCamera, metersPerPixel: Math.max(35, Math.min(130, plannerCamera.metersPerPixel * factor)) };
}, { passive: false });

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
    gameFrame.classList.remove('planning');
    controls.hidden = false;
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
  gameFrame.classList.toggle('planning', state.status === 'planning');
  controls.hidden = state.status === 'planning';
  if (!pilot) { hud.innerHTML = `<div>${state.message}</div>`; return; }
  const ground = state.terrain.sample(pilot.position.x, pilot.position.y).heightM;
  const asl = ground + pilot.altitudeM;
  const speed = Math.hypot(pilot.velocityMps.x, pilot.velocityMps.y);
  const heading = Math.round((((pilot.headingRad * 180) / Math.PI) % 360 + 360) % 360);
  const lock = lockedTargetFor(state, pilot);
  hud.innerHTML = `
    <div><b>${state.status.toUpperCase()}</b> ${state.message}</div>
    <div class="pilot-health"><span>MY HP</span><meter min="0" max="${120}" value="${Math.max(0, Math.round(pilot.health))}"></meter><span>${Math.max(0, Math.round(pilot.health))}</span></div>
    <div>AGL ${Math.round(pilot.altitudeM)} m · ASL ${Math.round(asl)} m · SPD ${Math.round(speed)} m/s · HDG ${heading}°</div>
    <div>LOCK ${lock ? lock.id : 'none'} · AGM ${pilot.missiles} · Blue territory ${(state.blueTerritoryRatio * 100).toFixed(1)}% · Enemy contacts ${redAlive}</div>
  `;
};

const frame = (now: number): void => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state.status === 'flying') stepBattle(state, dt, buildInput());
  const camera = cameraForState(state, canvasViewport(), plannerCamera);
  renderBattle(battleCtx, state, assets, camera);
  renderMinimap(minimapCtx, state, assets);
  updateHud();
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
