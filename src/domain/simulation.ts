import { add, angleTo, clamp, distance, fromAngle, normalizeAngle, rotateToward, scale } from './math.js';
import { createTerrain, WORLD_SIZE_M } from './terrain.js';
import type { BattleState, FrontSegment, PilotInput, Projectile, Team, Tracer, Unit, UnitKind, UnitStats, Vec2, WeaponKind } from './types.js';

export const UNIT_STATS: Record<UnitKind, UnitStats> = {
  // AH-64D-ish: 145 kt dash, 0.27 g level turn, moderate 5 m/s² translational acceleration.
  helicopter: { maxHealth: 120, maxSpeedMps: 75, reverseSpeedMps: 22, strafeSpeedMps: 24, turnRateRad: 0.58, turretTurnRateRad: 2.7, minAltitudeM: 18, maxAltitudeM: 1200, climbRateMps: 10, sightRangeM: 7_200, cannonRangeM: 1_800, missileRangeM: 5_400, accelerationMps2: 5.0, decelerationMps2: 6.5 },
  // Tracked / towed air-defense turret slew values are intentionally slower than the helicopter TADS.
  aaa: { maxHealth: 90, maxSpeedMps: 0, reverseSpeedMps: 0, strafeSpeedMps: 0, turnRateRad: 0, turretTurnRateRad: 0.9, minAltitudeM: 0, maxAltitudeM: 0, climbRateMps: 0, sightRangeM: 6_300, cannonRangeM: 2_300, missileRangeM: 4_800, accelerationMps2: 0, decelerationMps2: 0 },
  // Main battle tank cross-country pace and hull/turret rates are conservative rather than arcade-fast.
  tank: { maxHealth: 110, maxSpeedMps: 11, reverseSpeedMps: 4, strafeSpeedMps: 0, turnRateRad: 0.35, turretTurnRateRad: 0.45, minAltitudeM: 0, maxAltitudeM: 0, climbRateMps: 0, sightRangeM: 3_600, cannonRangeM: 2_800, missileRangeM: 0, accelerationMps2: 1.8, decelerationMps2: 2.6 },
};

export const SPOTTING_GRID = 420;

let projectileCounter = 0;
let tracerCounter = 0;
const deg = (v: number): number => (v / 180) * Math.PI;
const length = (v: Vec2): number => Math.hypot(v.x, v.y);

const approach = (current: number, target: number, delta: number): number => {
  if (Math.abs(target - current) <= delta) return target;
  return current + Math.sign(target - current) * delta;
};

export const createUnit = (id: string, kind: UnitKind, team: Team, position: Vec2, headingRad = 0): Unit => ({
  id,
  kind,
  team,
  position,
  altitudeM: kind === 'helicopter' ? 180 : 0,
  headingRad,
  turretRad: headingRad,
  health: UNIT_STATS[kind].maxHealth,
  missiles: kind === 'tank' ? 0 : kind === 'helicopter' ? 8 : 4,
  velocityMps: { x: 0, y: 0 },
  revealedToBlue: team === 'blue',
});

export const createInitialBattle = (): BattleState => {
  const terrain = createTerrain();
  const fronts: FrontSegment[] = [
    { id: 'north', y: 8_000, blueControlX: 21_000, pressure: 0 },
    { id: 'central', y: 20_000, blueControlX: 24_000, pressure: 0 },
    { id: 'focus', y: 31_500, blueControlX: 22_500, pressure: 0 },
    { id: 'south', y: 43_000, blueControlX: 26_000, pressure: 0 },
  ];
  return {
    mapSizeM: WORLD_SIZE_M,
    timeS: 0,
    selectedUnitId: 'blue-longbow-1',
    terrain,
    fronts,
    units: [
      createUnit('blue-longbow-1', 'helicopter', 'blue', { x: 13_000, y: 34_000 }, deg(-18)),
      createUnit('blue-tank-a', 'tank', 'blue', { x: 18_000, y: 29_800 }, 0),
      createUnit('blue-tank-b', 'tank', 'blue', { x: 16_500, y: 36_500 }, 0),
      createUnit('red-aaa-ridge', 'aaa', 'red', { x: 31_000, y: 27_500 }, Math.PI),
      createUnit('red-aaa-valley', 'aaa', 'red', { x: 34_500, y: 37_500 }, Math.PI),
      createUnit('red-tank-1', 'tank', 'red', { x: 30_500, y: 31_500 }, Math.PI),
      createUnit('red-tank-2', 'tank', 'red', { x: 36_500, y: 32_500 }, Math.PI),
      createUnit('red-tank-3', 'tank', 'red', { x: 40_000, y: 25_500 }, Math.PI),
      createUnit('red-tank-4', 'tank', 'red', { x: 38_000, y: 41_000 }, Math.PI),
    ],
    projectiles: [],
    tracers: [],
    blueTerritoryRatio: 0.46,
    status: 'planning',
    message: 'Mission planner: drag/zoom the AO, choose ingress points, then tap FLY.',
  };
};

export const isAlive = (u: Unit): boolean => u.health > 0;

export const hasLineOfSight = (state: BattleState, observer: Unit, target: Unit): boolean => {
  const d = distance(observer.position, target.position);
  if (d > UNIT_STATS[observer.kind].sightRangeM) return false;
  const observerGround = state.terrain.sample(observer.position.x, observer.position.y).heightM;
  const targetGround = state.terrain.sample(target.position.x, target.position.y).heightM;
  const observerEye = observerGround + observer.altitudeM + (observer.kind === 'helicopter' ? 10 : 3);
  const targetEye = targetGround + target.altitudeM + (target.kind === 'helicopter' ? 10 : 3);
  const steps = Math.max(6, Math.ceil(d / 800));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = observer.position.x + (target.position.x - observer.position.x) * t;
    const y = observer.position.y + (target.position.y - observer.position.y) * t;
    const terrainHeight = state.terrain.sample(x, y).heightM;
    const rayHeight = observerEye + (targetEye - observerEye) * t;
    if (terrainHeight + 12 > rayHeight) return false;
  }
  return true;
};

export const visibleCells = (state: BattleState, observer: Unit, grid = SPOTTING_GRID): Uint8Array => {
  const cells = new Uint8Array(grid * grid);
  const cellSize = state.mapSizeM / grid;
  const maxRange = UNIT_STATS[observer.kind].sightRangeM;
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      const probe = createUnit('probe', 'tank', 'red', { x: (x + 0.5) * cellSize, y: (y + 0.5) * cellSize });
      if (distance(observer.position, probe.position) <= maxRange) cells[y * grid + x] = hasLineOfSight(state, observer, probe) ? 1 : 0;
    }
  }
  return cells;
};

export const acquireTarget = (state: BattleState, shooter: Unit, weapon: WeaponKind): Unit | undefined => {
  const stats = UNIT_STATS[shooter.kind];
  const range = weapon === 'missile' ? stats.missileRangeM : stats.cannonRangeM;
  const cone = shooter.kind === 'helicopter' && weapon === 'missile' ? deg(24) : weapon === 'cannon' && shooter.kind === 'helicopter' ? deg(90) : Math.PI;
  return state.units
    .filter((u) => isAlive(u) && u.team !== shooter.team && distance(shooter.position, u.position) <= range && hasLineOfSight(state, shooter, u))
    .filter((u) => Math.abs(normalizeAngle(angleTo(shooter.position, u.position) - (weapon === 'cannon' ? shooter.turretRad : shooter.headingRad))) <= cone)
    .sort((a, b) => distance(shooter.position, a.position) - distance(shooter.position, b.position))[0];
};

export const lockedTargetFor = (state: BattleState, shooter: Unit): Unit | undefined => acquireTarget(state, shooter, 'missile') ?? acquireTarget(state, shooter, 'cannon');

const addTracer = (state: BattleState, shooter: Unit, target: Unit): void => {
  const aim = angleTo(shooter.position, target.position);
  const reach = Math.min(UNIT_STATS[shooter.kind].cannonRangeM, distance(shooter.position, target.position));
  state.tracers.push({ id: `t-${tracerCounter++}`, team: shooter.team, shooterId: shooter.id, start: shooter.position, end: add(shooter.position, scale(fromAngle(aim), reach)), ttlS: 0.18 });
};

const fireAt = (state: BattleState, shooter: Unit, weapon: WeaponKind): void => {
  const target = acquireTarget(state, shooter, weapon);
  if (!target) return;
  if (weapon === 'missile') {
    if (shooter.missiles <= 0 || state.projectiles.some((p) => p.shooterId === shooter.id && p.targetId === target.id)) return;
    shooter.missiles -= 1;
    state.projectiles.push({ id: `m-${projectileCounter++}`, weapon, team: shooter.team, shooterId: shooter.id, targetId: target.id, position: { ...shooter.position }, ttlS: 14, damage: 70, speedMps: shooter.kind === 'helicopter' ? 475 : 360 });
  } else {
    addTracer(state, shooter, target);
    const d = distance(shooter.position, target.position);
    const hitChance = clamp(0.86 - d / 4_800, 0.18, 0.82);
    const deterministicRoll = (Math.sin(state.timeS * 13.7 + d * 0.021 + shooter.id.length) + 1) / 2;
    if (deterministicRoll <= hitChance) target.health -= shooter.kind === 'tank' ? 28 : 16;
  }
};

const moveUnit = (state: BattleState, unit: Unit, input: PilotInput | undefined, dtS: number): void => {
  const stats = UNIT_STATS[unit.kind];
  if (input?.setAutopilotTarget) unit.autopilotTarget = input.setAutopilotTarget;
  if (unit.kind === 'helicopter') {
    const manual = Boolean(input && (Math.abs(input.forward) + Math.abs(input.strafe) + Math.abs(input.turn) > 0.04));
    if (manual) delete unit.autopilotTarget;
    const currentSpeed = length(unit.velocityMps);
    const speedFactor = clamp(1 - currentSpeed / Math.max(1, stats.maxSpeedMps), 0.35, 1);
    unit.headingRad += (input?.turn ?? 0) * stats.turnRateRad * speedFactor * dtS;
    let desiredForward = (input?.forward ?? 0) * (input && input.forward < 0 ? stats.reverseSpeedMps : stats.maxSpeedMps);
    let desiredStrafe = (input?.strafe ?? 0) * stats.strafeSpeedMps;
    if (unit.autopilotTarget) {
      const desired = angleTo(unit.position, unit.autopilotTarget);
      unit.headingRad = rotateToward(unit.headingRad, desired, stats.turnRateRad * 0.75 * dtS);
      desiredForward = stats.maxSpeedMps * clamp(distance(unit.position, unit.autopilotTarget) / 900, 0, 1);
      desiredStrafe = 0;
      if (distance(unit.position, unit.autopilotTarget) < 120) delete unit.autopilotTarget;
    }
    const desiredVelocity = add(scale(fromAngle(unit.headingRad), desiredForward), scale(fromAngle(unit.headingRad + Math.PI / 2), desiredStrafe));
    const desiredSpeed = length(desiredVelocity);
    const currentHeadingSpeed = length(unit.velocityMps);
    const rate = desiredSpeed > currentHeadingSpeed ? stats.accelerationMps2 : stats.decelerationMps2;
    const deltaVelocity = { x: desiredVelocity.x - unit.velocityMps.x, y: desiredVelocity.y - unit.velocityMps.y };
    const deltaSpeed = length(deltaVelocity);
    const maxDelta = rate * dtS;
    unit.velocityMps = deltaSpeed <= maxDelta || deltaSpeed === 0
      ? desiredVelocity
      : { x: unit.velocityMps.x + (deltaVelocity.x / deltaSpeed) * maxDelta, y: unit.velocityMps.y + (deltaVelocity.y / deltaSpeed) * maxDelta };
    unit.position = add(unit.position, scale(unit.velocityMps, dtS));
    unit.altitudeM = clamp(unit.altitudeM + (input?.climb ?? 0) * stats.climbRateMps * dtS, stats.minAltitudeM, stats.maxAltitudeM);
    const target = lockedTargetFor(state, unit);
    if (target) unit.turretRad = rotateToward(unit.turretRad, angleTo(unit.position, target.position), stats.turretTurnRateRad * dtS);
  } else if (unit.kind === 'tank') {
    const front = nearestFront(state.fronts, unit.position.y);
    const dir = unit.team === 'blue' ? 1 : -1;
    const objectiveX = front.blueControlX + dir * 2500;
    unit.headingRad = rotateToward(unit.headingRad, objectiveX > unit.position.x ? 0 : Math.PI, stats.turnRateRad * dtS);
    unit.velocityMps = scale(fromAngle(unit.headingRad), approach(length(unit.velocityMps), stats.maxSpeedMps, stats.accelerationMps2 * dtS));
    unit.position = add(unit.position, scale(unit.velocityMps, dtS));
    const target = acquireTarget(state, unit, 'cannon');
    if (target) unit.turretRad = rotateToward(unit.turretRad, angleTo(unit.position, target.position), stats.turretTurnRateRad * dtS);
  } else {
    unit.velocityMps = { x: 0, y: 0 };
    const target = lockedTargetFor(state, unit);
    if (target) unit.turretRad = rotateToward(unit.turretRad, angleTo(unit.position, target.position), stats.turretTurnRateRad * dtS);
  }
  unit.position = { x: clamp(unit.position.x, 0, state.mapSizeM), y: clamp(unit.position.y, 0, state.mapSizeM) };
};

const nearestFront = (fronts: FrontSegment[], y: number): FrontSegment => fronts.reduce((best, f) => (Math.abs(f.y - y) < Math.abs(best.y - y) ? f : best), fronts[0]!);

const updateFronts = (state: BattleState, dtS: number): void => {
  for (const front of state.fronts) {
    const blueAlive = state.units.filter((u) => u.team === 'blue' && u.kind === 'tank' && isAlive(u) && Math.abs(u.position.y - front.y) < 8000).length;
    const redAlive = state.units.filter((u) => u.team === 'red' && u.kind !== 'helicopter' && isAlive(u) && Math.abs(u.position.y - front.y) < 8000).length;
    front.pressure = clamp(front.pressure + (blueAlive - redAlive) * dtS * 0.008, -1, 1);
    front.blueControlX = clamp(front.blueControlX + front.pressure * dtS * 16, 8_000, 42_000);
  }
  state.blueTerritoryRatio = state.fronts.reduce((sum, f) => sum + f.blueControlX / state.mapSizeM, 0) / state.fronts.length;
  if (state.blueTerritoryRatio >= 0.75) state.status = 'blueVictory';
  if (state.blueTerritoryRatio <= 0.25) {
    state.status = 'redVictory';
    state.defeatReason = 'Front collapsed: blue controls less than 25% of the sector.';
  }
};

const updateProjectiles = (state: BattleState, dtS: number): void => {
  for (const p of state.projectiles) {
    const target = state.units.find((u) => u.id === p.targetId && isAlive(u));
    if (!target) { p.ttlS = 0; continue; }
    p.ttlS -= dtS;
    const d = distance(p.position, target.position);
    const travel = p.speedMps * dtS;
    if (d <= travel) {
      const shooter = state.units.find((u) => u.id === p.shooterId);
      if (shooter && hasLineOfSight(state, shooter, target) && distance(shooter.position, target.position) >= 500) target.health -= p.damage;
      p.ttlS = 0;
    } else {
      p.position = add(p.position, scale(fromAngle(angleTo(p.position, target.position)), travel));
    }
  }
  state.projectiles = state.projectiles.filter((p) => p.ttlS > 0);
  for (const tracer of state.tracers) tracer.ttlS -= dtS;
  state.tracers = state.tracers.filter((t) => t.ttlS > 0);
};

export const stepBattle = (state: BattleState, dtS: number, input?: PilotInput): BattleState => {
  if (state.status !== 'flying') return state;
  state.timeS += dtS;
  const pilot = state.units.find((u) => u.id === state.selectedUnitId);
  for (const unit of state.units.filter(isAlive)) moveUnit(state, unit, unit.id === state.selectedUnitId ? input : undefined, dtS);
  if (pilot && isAlive(pilot)) {
    if (input?.fireMissile) fireAt(state, pilot, 'missile');
    if (input?.fireCannon) fireAt(state, pilot, 'cannon');
    for (const unit of state.units) {
      if (unit.team === 'red' && isAlive(unit) && hasLineOfSight(state, pilot, unit)) {
        unit.revealedToBlue = true;
        unit.lastSeenAtS = state.timeS;
      }
    }
  }
  for (const unit of state.units.filter((u) => isAlive(u) && u.team === 'red')) fireAt(state, unit, unit.kind === 'tank' ? 'cannon' : unit.missiles > 0 ? 'missile' : 'cannon');
  updateProjectiles(state, dtS);
  state.units = state.units.filter((u) => u.health > -40);
  updateFronts(state, dtS);
  const selected = state.units.find((u) => u.id === state.selectedUnitId);
  if (!selected || selected.health <= 0) {
    state.status = 'redVictory';
    state.defeatReason = 'Aircraft destroyed: your helicopter health reached zero.';
  }
  const messages: Record<BattleState['status'], string> = {
    planning: 'Mission planner: drag/zoom the AO, choose ingress points, then tap FLY.',
    flying: 'Fly nap-of-earth, expose targets, and support the focus front.',
    blueVictory: 'Blue controls 75% of the sector. Victory!',
    redVictory: state.defeatReason ?? 'Defeat: mission failed.',
  };
  state.message = messages[state.status];
  return state;
};
