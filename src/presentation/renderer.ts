import { angleTo, distance, fromAngle } from '../domain/math.js';
import { terrainColor } from '../domain/terrain.js';
import { hasLineOfSight, UNIT_STATS, visibleCells } from '../domain/simulation.js';
import type { BattleState, Unit, Vec2 } from '../domain/types.js';

export interface Camera {
  readonly center: Vec2;
  readonly metersPerPixel: number;
}

export interface RenderAssets {
  readonly terrain: HTMLCanvasElement;
  readonly minimap: HTMLCanvasElement;
}

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

export const worldToScreen = (point: Vec2, camera: Camera, canvas: HTMLCanvasElement): Vec2 => ({
  x: canvas.width / 2 + (point.x - camera.center.x) / camera.metersPerPixel,
  y: canvas.height / 2 + (point.y - camera.center.y) / camera.metersPerPixel,
});

export const screenToWorld = (point: Vec2, camera: Camera, canvas: HTMLCanvasElement): Vec2 => ({
  x: camera.center.x + (point.x - canvas.width / 2) * camera.metersPerPixel,
  y: camera.center.y + (point.y - canvas.height / 2) * camera.metersPerPixel,
});

const drawUnit = (ctx: CanvasRenderingContext2D, unit: Unit, screen: Vec2, visible: boolean): void => {
  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.rotate(unit.headingRad);
  ctx.globalAlpha = unit.health > 0 ? 1 : 0.25;
  ctx.fillStyle = teamColor(unit, visible);
  ctx.strokeStyle = '#101713';
  ctx.lineWidth = 2;
  if (unit.kind === 'helicopter') {
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-13, -8);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-13, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#bfffd2';
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(16, 0);
    ctx.moveTo(0, -18);
    ctx.lineTo(0, 18);
    ctx.stroke();
  } else if (unit.kind === 'tank') {
    ctx.fillRect(-10, -7, 20, 14);
    ctx.strokeRect(-10, -7, 20, 14);
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.rotate(unit.turretRad);
  ctx.strokeStyle = unit.team === 'blue' ? '#e7ff9f' : '#ffc7bd';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(unit.kind === 'tank' ? 20 : 16, 0);
  ctx.stroke();
  ctx.restore();
};

const drawWeaponCones = (ctx: CanvasRenderingContext2D, pilot: Unit, screen: Vec2, scale: number): void => {
  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.strokeStyle = 'rgba(255, 236, 118, 0.8)';
  ctx.lineWidth = 2;
  const missileRange = Math.min(UNIT_STATS.helicopter.missileRangeM / scale, 420);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, missileRange, pilot.headingRad - Math.PI / 9, pilot.headingRad + Math.PI / 9);
  ctx.closePath();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(151, 226, 255, 0.55)';
  ctx.beginPath();
  ctx.arc(0, 0, UNIT_STATS.helicopter.cannonRangeM / scale, pilot.turretRad - Math.PI / 2, pilot.turretRad + Math.PI / 2);
  ctx.stroke();
  ctx.restore();
};

const drawGrid = (ctx: CanvasRenderingContext2D, camera: Camera, canvas: HTMLCanvasElement): void => {
  const spacingM = 1000;
  ctx.strokeStyle = 'rgba(231,255,210,0.10)';
  ctx.lineWidth = 1;
  const left = camera.center.x - (canvas.width / 2) * camera.metersPerPixel;
  const top = camera.center.y - (canvas.height / 2) * camera.metersPerPixel;
  for (let x = Math.ceil(left / spacingM) * spacingM; x < left + canvas.width * camera.metersPerPixel; x += spacingM) {
    const sx = (x - left) / camera.metersPerPixel;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, canvas.height);
    ctx.stroke();
  }
  for (let y = Math.ceil(top / spacingM) * spacingM; y < top + canvas.height * camera.metersPerPixel; y += spacingM) {
    const sy = (y - top) / camera.metersPerPixel;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(canvas.width, sy);
    ctx.stroke();
  }
};

export const renderBattle = (ctx: CanvasRenderingContext2D, state: BattleState, assets: RenderAssets, camera: Camera): void => {
  const canvas = ctx.canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const sx = (camera.center.x - (canvas.width / 2) * camera.metersPerPixel) / state.mapSizeM * assets.terrain.width;
  const sy = (camera.center.y - (canvas.height / 2) * camera.metersPerPixel) / state.mapSizeM * assets.terrain.height;
  const sw = canvas.width * camera.metersPerPixel / state.mapSizeM * assets.terrain.width;
  const sh = canvas.height * camera.metersPerPixel / state.mapSizeM * assets.terrain.height;
  ctx.drawImage(assets.terrain, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  drawGrid(ctx, camera, canvas);
  const pilot = state.units.find((u) => u.id === state.selectedUnitId);
  if (pilot) {
    const cells = visibleCells(state, pilot, 42);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    const cellM = state.mapSizeM / 42;
    for (let y = 0; y < 42; y += 1) {
      for (let x = 0; x < 42; x += 1) {
        if (cells[y * 42 + x] === 1) continue;
        const p = worldToScreen({ x: x * cellM, y: y * cellM }, camera, canvas);
        ctx.fillRect(p.x, p.y, cellM / camera.metersPerPixel + 1, cellM / camera.metersPerPixel + 1);
      }
    }
    ctx.restore();
    drawWeaponCones(ctx, pilot, worldToScreen(pilot.position, camera, canvas), camera.metersPerPixel);
  }
  for (const front of state.fronts) {
    const top = worldToScreen({ x: front.blueControlX, y: front.y - 4200 }, camera, canvas);
    const bottom = worldToScreen({ x: front.blueControlX, y: front.y + 4200 }, camera, canvas);
    ctx.strokeStyle = '#32ff62';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const unit of state.units) {
    if (unit.team === 'red' && !unit.revealedToBlue) continue;
    const visible = pilot ? hasLineOfSight(state, pilot, unit) : true;
    drawUnit(ctx, unit, worldToScreen(unit.position, camera, canvas), visible);
  }
  if (pilot?.autopilotTarget) {
    const p = worldToScreen(pilot.autopilotTarget, camera, canvas);
    ctx.strokeStyle = '#f6ff71';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
    ctx.moveTo(p.x - 22, p.y);
    ctx.lineTo(p.x + 22, p.y);
    ctx.moveTo(p.x, p.y - 22);
    ctx.lineTo(p.x, p.y + 22);
    ctx.stroke();
  }
};

export const renderMinimap = (ctx: CanvasRenderingContext2D, state: BattleState, assets: RenderAssets): void => {
  const canvas = ctx.canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(assets.minimap, 0, 0, canvas.width, canvas.height);
  for (const front of state.fronts) {
    ctx.strokeStyle = '#32ff62';
    ctx.beginPath();
    ctx.moveTo((front.blueControlX / state.mapSizeM) * canvas.width, ((front.y - 4500) / state.mapSizeM) * canvas.height);
    ctx.lineTo((front.blueControlX / state.mapSizeM) * canvas.width, ((front.y + 4500) / state.mapSizeM) * canvas.height);
    ctx.stroke();
  }
  for (const unit of state.units) {
    if (unit.team === 'red' && !unit.revealedToBlue) continue;
    ctx.fillStyle = teamColor(unit, unit.team === 'blue' || Boolean(unit.lastSeenAtS && state.timeS - unit.lastSeenAtS < 1));
    ctx.fillRect((unit.position.x / state.mapSizeM) * canvas.width - 2, (unit.position.y / state.mapSizeM) * canvas.height - 2, 4, 4);
  }
};

export const cameraForState = (state: BattleState): Camera => {
  const pilot = state.units.find((u) => u.id === state.selectedUnitId);
  if (state.status === 'planning' || !pilot) return { center: { x: state.mapSizeM / 2, y: state.mapSizeM / 2 }, metersPerPixel: state.mapSizeM / 700 };
  const ahead = fromAngle(pilot.headingRad);
  return { center: { x: pilot.position.x + ahead.x * 1900, y: pilot.position.y + ahead.y * 1900 }, metersPerPixel: 8.5 };
};

export const describeBearing = (from: Vec2, to: Vec2): string => `${Math.round((angleTo(from, to) * 180) / Math.PI)}° / ${(distance(from, to) / 1000).toFixed(1)} km`;
