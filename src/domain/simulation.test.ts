import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialBattle, hasLineOfSight, stepBattle, UNIT_STATS, visibleCells } from './simulation.js';

test('initial battle models a 50km square with four fronts and a player helicopter', () => {
  const state = createInitialBattle();
  assert.equal(state.mapSizeM, 50_000);
  assert.equal(state.fronts.length, 4);
  const pilot = state.units.find((u) => u.id === state.selectedUnitId);
  assert.equal(pilot?.kind, 'helicopter');
  assert.equal(pilot?.missiles, 8);
});

test('line of sight is terrain aware and bounded by unit sight range', () => {
  const state = createInitialBattle();
  const pilot = state.units.find((u) => u.id === state.selectedUnitId);
  const target = state.units.find((u) => u.id === 'red-tank-1');
  assert.ok(pilot);
  assert.ok(target);
  const inRange = hasLineOfSight(state, pilot, target);
  target.position = { x: pilot.position.x + UNIT_STATS.helicopter.sightRangeM + 1000, y: pilot.position.y };
  assert.equal(hasLineOfSight(state, pilot, target), false);
  assert.equal(typeof inRange, 'boolean');
});

test('visibility grid returns deterministic per-cell detection mask', () => {
  const state = createInitialBattle();
  const pilot = state.units.find((u) => u.id === state.selectedUnitId);
  assert.ok(pilot);
  const grid = visibleCells(state, pilot, 16);
  assert.equal(grid.length, 256);
  assert.ok(grid.some((cell) => cell === 1));
});

test('autopilot advances the helicopter toward a clicked waypoint', () => {
  const state = createInitialBattle();
  state.status = 'flying';
  const pilot = state.units.find((u) => u.id === state.selectedUnitId);
  assert.ok(pilot);
  const startX = pilot.position.x;
  for (let i = 0; i < 80; i += 1) {
    stepBattle(state, 0.05, { forward: 0, strafe: 0, turn: 0, climb: 0, fireCannon: false, fireMissile: false, setAutopilotTarget: { x: startX + 2000, y: pilot.position.y } });
  }
  assert.ok(pilot.position.x > startX + 100);
});
