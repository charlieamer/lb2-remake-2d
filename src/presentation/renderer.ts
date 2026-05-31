import { angleTo, distance, fromAngle, normalizeAngle } from '../domain/math.js';
import { terrainColor } from '../domain/terrain.js';
import { hasLineOfSight, lockedTargetFor, SPOTTING_GRID, UNIT_STATS, visibleCells } from '../domain/simulation.js';
import type { BattleState, Unit, Vec2 } from '../domain/types.js';

export interface Camera {
  readonly center: Vec2;
  readonly metersPerPixel: number;
  readonly rotationRad?: number;
  readonly anchor?: Vec2;
}

export interface RenderAssets {
  readonly terrain: HTMLCanvasElement;
  readonly minimap: HTMLCanvasElement;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

const CONTOUR_INTERVAL_M = 100;
const PLANNER_MIN_MPP = 35;
const PLANNER_MAX_MPP = 130;

const canvasCssSize = (canvas: HTMLCanvasElement): ViewportSize => {
  const rect = canvas.getBoundingClientRect();
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return {
    width: rect.width || canvas.width / dpr || canvas.width,
    height: rect.height || canvas.height / dpr || canvas.height,
  };
};

const teamColor = (unit: Unit, visible: boolean): string => {
  if (unit.team === 'blue') return '#3efc71';
  return visible ? '#ff3a2f' : '#7b3534';
};

export const createTerrainCanvas = (state: BattleState, sizePx: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  for (let y = 0; y < sizePx; y += 1) {
    for (let x = 0; x < sizePx; x += 1) {
      ctx.fillStyle = terrainColor(state.terrain.sample((x / sizePx) * state.mapSizeM, (y / sizePx) * state.mapSizeM));
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
};

export const createAssets = (state: BattleState): RenderAssets => {
  const terrain = createTerrainCanvas(state, 768);
  const minimap = createTerrainCanvas(state, 220);
  return { terrain, minimap };
};

const cameraAnchor = (camera: Camera, size: ViewportSize): Vec2 => camera.anchor ?? { x: size.width / 2, y: size.height / 2 };

export const worldToScreenInViewport = (point: Vec2, camera: Camera, size: ViewportSize): Vec2 => {
  const anchor = cameraAnchor(camera, size);
  const dx = (point.x - camera.center.x) / camera.metersPerPixel;
  const dy = (point.y - camera.center.y) / camera.metersPerPixel;
  const r = -(camera.rotationRad ?? 0);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: anchor.x + dx * c - dy * s, y: anchor.y + dx * s + dy * c };
};

export const screenToWorldInViewport = (point: Vec2, camera: Camera, size: ViewportSize): Vec2 => {
  const anchor = cameraAnchor(camera, size);
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const r = camera.rotationRad ?? 0;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: camera.center.x + (dx * c - dy * s) * camera.metersPerPixel, y: camera.center.y + (dx * s + dy * c) * camera.metersPerPixel };
};

export const worldToScreen = (point: Vec2, camera: Camera, canvas: HTMLCanvasElement): Vec2 => worldToScreenInViewport(point, camera, canvasCssSize(canvas));
export const screenToWorld = (point: Vec2, camera: Camera, canvas: HTMLCanvasElement): Vec2 => screenToWorldInViewport(point, camera, canvasCssSize(canvas));

const withWorldTransform = (ctx: CanvasRenderingContext2D, camera: Camera, size: ViewportSize, draw: () => void): void => {
  const anchor = cameraAnchor(camera, size);
  ctx.save();
  ctx.translate(anchor.x, anchor.y);
  ctx.rotate(-(camera.rotationRad ?? 0));
  ctx.scale(1 / camera.metersPerPixel, 1 / camera.metersPerPixel);
  ctx.translate(-camera.center.x, -camera.center.y);
  draw();
  ctx.restore();
};

const drawHealthBar = (ctx: CanvasRenderingContext2D, unit: Unit): void => {
  const max = UNIT_STATS[unit.kind].maxHealth;
  const ratio = Math.max(0, unit.health) / max;
  ctx.save();
  ctx.rotate(-(ctx.getTransform().b === 0 ? 0 : 0));
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(-14, -26, 28, 4);
  ctx.fillStyle = ratio > 0.5 ? '#67ff7d' : ratio > 0.25 ? '#ffd447' : '#ff4d3d';
  ctx.fillRect(-13, -25, 26 * ratio, 2);
  ctx.restore();
};

const drawUnit = (ctx: CanvasRenderingContext2D, unit: Unit, visible: boolean, fixedHeading = false): void => {
  ctx.save();
  ctx.translate(unit.position.x, unit.position.y);
  const pxScale = 9;
  ctx.scale(pxScale, pxScale);
  ctx.rotate(fixedHeading ? 0 : unit.headingRad);
  ctx.globalAlpha = unit.health > 0 ? 1 : 0.25;
  ctx.fillStyle = teamColor(unit, visible);
  ctx.strokeStyle = '#101713';
  ctx.lineWidth = 0.22;
  if (unit.kind === 'helicopter') {
    ctx.beginPath();
    ctx.moveTo(2.1, 0);
    ctx.lineTo(-1.45, -0.9);
    ctx.lineTo(-0.85, 0);
    ctx.lineTo(-1.45, 0.9);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#bfffd2';
    ctx.beginPath();
    ctx.moveTo(-1.9, 0); ctx.lineTo(1.9, 0);
    ctx.moveTo(0, -1.9); ctx.lineTo(0, 1.9);
    ctx.stroke();
  } else if (unit.kind === 'tank') {
    ctx.fillRect(-1.2, -0.8, 2.4, 1.6); ctx.strokeRect(-1.2, -0.8, 2.4, 1.6);
  } else {
    ctx.beginPath(); ctx.arc(0, 0, 1.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.translate(unit.position.x, unit.position.y);
  ctx.scale(pxScale, pxScale);
  ctx.rotate(unit.turretRad);
  ctx.strokeStyle = unit.team === 'blue' ? '#e7ff9f' : '#ffc7bd';
  ctx.lineWidth = 0.35;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(unit.kind === 'tank' ? 2.2 : 1.8, 0); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(unit.position.x, unit.position.y);
  ctx.scale(pxScale, pxScale);
  drawHealthBar(ctx, unit);
  ctx.restore();
};

const drawWeaponCones = (ctx: CanvasRenderingContext2D, pilot: Unit): void => {
  ctx.save();
  ctx.translate(pilot.position.x, pilot.position.y);
  ctx.strokeStyle = 'rgba(255, 236, 118, 0.8)';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, UNIT_STATS.helicopter.missileRangeM, pilot.headingRad - Math.PI / 7.5, pilot.headingRad + Math.PI / 7.5);
  ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = 'rgba(151, 226, 255, 0.55)';
  ctx.beginPath(); ctx.arc(0, 0, UNIT_STATS.helicopter.cannonRangeM, pilot.turretRad - Math.PI / 2, pilot.turretRad + Math.PI / 2); ctx.stroke();
  ctx.restore();
};

const drawGrid = (ctx: CanvasRenderingContext2D, state: BattleState): void => {
  const spacingM = 1000;
  ctx.strokeStyle = 'rgba(231,255,210,0.10)';
  ctx.lineWidth = 12;
  for (let x = 0; x <= state.mapSizeM; x += spacingM) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, state.mapSizeM); ctx.stroke(); }
  for (let y = 0; y <= state.mapSizeM; y += spacingM) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(state.mapSizeM, y); ctx.stroke(); }
};

const drawContours = (ctx: CanvasRenderingContext2D, state: BattleState): void => {
  const step = 500;
  ctx.strokeStyle = 'rgba(255,255,210,0.18)';
  ctx.fillStyle = 'rgba(255,255,210,0.55)';
  ctx.lineWidth = 16;
  ctx.font = '420px system-ui';
  for (let y = 0; y < state.mapSizeM - step; y += step) {
    for (let x = 0; x < state.mapSizeM - step; x += step) {
      const a = Math.floor(state.terrain.sample(x, y).heightM / CONTOUR_INTERVAL_M);
      const b = Math.floor(state.terrain.sample(x + step, y).heightM / CONTOUR_INTERVAL_M);
      const c = Math.floor(state.terrain.sample(x, y + step).heightM / CONTOUR_INTERVAL_M);
      if (a !== b) { ctx.beginPath(); ctx.moveTo(x + step / 2, y); ctx.lineTo(x + step / 2, y + step); ctx.stroke(); }
      if (a !== c) { ctx.beginPath(); ctx.moveTo(x, y + step / 2); ctx.lineTo(x + step, y + step / 2); ctx.stroke(); }
    }
  }
  for (let y = 4_000; y < state.mapSizeM; y += 8_000) {
    for (let x = 4_000; x < state.mapSizeM; x += 8_000) {
      const h = Math.round(state.terrain.sample(x, y).heightM / CONTOUR_INTERVAL_M) * CONTOUR_INTERVAL_M;
      ctx.fillText(`${h}m`, x, y);
    }
  }
};

let fogCacheKey = '';
let fogCache: Uint8Array | undefined;
const cachedVisibleCells = (state: BattleState, pilot: Unit): Uint8Array => {
  const key = `${Math.round(pilot.position.x / 250)}:${Math.round(pilot.position.y / 250)}:${Math.round(pilot.altitudeM / 50)}`;
  if (key !== fogCacheKey || !fogCache) {
    fogCacheKey = key;
    fogCache = visibleCells(state, pilot, SPOTTING_GRID);
  }
  return fogCache;
};

const drawFog = (ctx: CanvasRenderingContext2D, state: BattleState, pilot: Unit): void => {
  const cells = cachedVisibleCells(state, pilot);
  const cellM = state.mapSizeM / SPOTTING_GRID;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.50)';
  for (let y = 0; y < SPOTTING_GRID; y += 1) {
    for (let x = 0; x < SPOTTING_GRID; x += 1) {
      if (cells[y * SPOTTING_GRID + x] === 1) continue;
      ctx.fillRect(x * cellM, y * cellM, cellM + 1, cellM + 1);
    }
  }
  ctx.restore();
};

const drawReticle = (ctx: CanvasRenderingContext2D, target: Unit, camera: Camera, size: ViewportSize): void => {
  const p = worldToScreenInViewport(target.position, camera, size);
  ctx.save();
  ctx.strokeStyle = '#fffb8a';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(p.x - 34, p.y); ctx.lineTo(p.x - 14, p.y); ctx.moveTo(p.x + 14, p.y); ctx.lineTo(p.x + 34, p.y); ctx.moveTo(p.x, p.y - 34); ctx.lineTo(p.x, p.y - 14); ctx.moveTo(p.x, p.y + 14); ctx.lineTo(p.x, p.y + 34); ctx.stroke();
  ctx.fillStyle = '#fffb8a'; ctx.font = '12px system-ui'; ctx.fillText(`LOCK ${target.id}`, p.x + 26, p.y - 24);
  ctx.restore();
};

export const renderBattle = (ctx: CanvasRenderingContext2D, state: BattleState, assets: RenderAssets, camera: Camera): void => {
  const canvas = ctx.canvas;
  const size = canvasCssSize(canvas);
  ctx.clearRect(0, 0, size.width, size.height);
  withWorldTransform(ctx, camera, size, () => {
    ctx.drawImage(assets.terrain, 0, 0, state.mapSizeM, state.mapSizeM);
    drawContours(ctx, state);
    drawGrid(ctx, state);
    const pilot = state.units.find((u) => u.id === state.selectedUnitId);
    if (pilot) { drawFog(ctx, state, pilot); drawWeaponCones(ctx, pilot); }
    for (const front of state.fronts) {
      ctx.strokeStyle = '#32ff62'; ctx.lineWidth = 80; ctx.setLineDash([250, 200]);
      ctx.beginPath(); ctx.moveTo(front.blueControlX, front.y - 4200); ctx.lineTo(front.blueControlX, front.y + 4200); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const tracer of state.tracers) {
      ctx.strokeStyle = tracer.team === 'blue' ? 'rgba(255,245,138,0.95)' : 'rgba(255,116,83,0.95)'; ctx.lineWidth = 24;
      ctx.beginPath(); ctx.moveTo(tracer.start.x, tracer.start.y); ctx.lineTo(tracer.end.x, tracer.end.y); ctx.stroke();
    }
    for (const projectile of state.projectiles) {
      ctx.fillStyle = projectile.team === 'blue' ? '#f5ff71' : '#ff805d';
      ctx.beginPath(); ctx.arc(projectile.position.x, projectile.position.y, 85, 0, Math.PI * 2); ctx.fill();
    }
    for (const unit of state.units) {
      if (unit.team === 'red' && !unit.revealedToBlue) continue;
      const visible = pilot ? hasLineOfSight(state, pilot, unit) : true;
      drawUnit(ctx, unit, visible, unit.id === state.selectedUnitId && state.status === 'flying');
    }
    if (pilot?.autopilotTarget) {
      ctx.strokeStyle = '#f6ff71'; ctx.lineWidth = 28;
      ctx.beginPath(); ctx.arc(pilot.autopilotTarget.x, pilot.autopilotTarget.y, 260, 0, Math.PI * 2); ctx.moveTo(pilot.autopilotTarget.x - 360, pilot.autopilotTarget.y); ctx.lineTo(pilot.autopilotTarget.x + 360, pilot.autopilotTarget.y); ctx.moveTo(pilot.autopilotTarget.x, pilot.autopilotTarget.y - 360); ctx.lineTo(pilot.autopilotTarget.x, pilot.autopilotTarget.y + 360); ctx.stroke();
    }
  });
  const pilot = state.units.find((u) => u.id === state.selectedUnitId);
  const lock = pilot ? lockedTargetFor(state, pilot) : undefined;
  if (lock) drawReticle(ctx, lock, camera, size);
};

export const renderMinimap = (ctx: CanvasRenderingContext2D, state: BattleState, assets: RenderAssets): void => {
  const canvas = ctx.canvas;
  const size = canvasCssSize(canvas);
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.drawImage(assets.minimap, 0, 0, size.width, size.height);
  const pilot = state.units.find((u) => u.id === state.selectedUnitId);
  if (pilot) {
    const cells = cachedVisibleCells(state, pilot);
    const cellW = size.width / SPOTTING_GRID;
    const cellH = size.height / SPOTTING_GRID;
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.42)';
    for (let y = 0; y < SPOTTING_GRID; y += 1) {
      for (let x = 0; x < SPOTTING_GRID; x += 1) if (cells[y * SPOTTING_GRID + x] === 0) ctx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
    }
    ctx.restore();
  }
  for (const front of state.fronts) {
    ctx.strokeStyle = '#32ff62'; ctx.beginPath(); ctx.moveTo((front.blueControlX / state.mapSizeM) * size.width, ((front.y - 4500) / state.mapSizeM) * size.height); ctx.lineTo((front.blueControlX / state.mapSizeM) * size.width, ((front.y + 4500) / state.mapSizeM) * size.height); ctx.stroke();
  }
  for (const unit of state.units) {
    if (unit.team === 'red' && !unit.revealedToBlue) continue;
    ctx.fillStyle = teamColor(unit, unit.team === 'blue' || Boolean(unit.lastSeenAtS && state.timeS - unit.lastSeenAtS < 1));
    ctx.fillRect((unit.position.x / state.mapSizeM) * size.width - 2, (unit.position.y / state.mapSizeM) * size.height - 2, 4, 4);
  }
};

export const cameraForState = (state: BattleState, viewport?: ViewportSize, plannerCamera?: Camera): Camera => {
  const pilot = state.units.find((u) => u.id === state.selectedUnitId);
  if (state.status === 'planning' || !pilot) {
    if (plannerCamera) return { ...plannerCamera, metersPerPixel: Math.min(PLANNER_MAX_MPP, Math.max(PLANNER_MIN_MPP, plannerCamera.metersPerPixel)) };
    const size = viewport ?? { width: 700, height: 700 };
    return { center: { x: state.mapSizeM / 2, y: state.mapSizeM / 2 }, metersPerPixel: Math.max(state.mapSizeM / size.width, state.mapSizeM / size.height) };
  }
  const size = viewport ?? { width: 900, height: 600 };
  return { center: pilot.position, metersPerPixel: 7000 / size.height, rotationRad: pilot.headingRad + Math.PI / 2, anchor: { x: size.width / 2, y: size.height - 74 } };
};

export const describeBearing = (from: Vec2, to: Vec2): string => `${Math.round((normalizeAngle(angleTo(from, to)) * 180) / Math.PI)}° / ${(distance(from, to) / 1000).toFixed(1)} km`;
