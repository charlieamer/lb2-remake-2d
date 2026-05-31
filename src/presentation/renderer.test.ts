import assert from 'node:assert/strict';
import test from 'node:test';
import { screenToWorldInViewport, worldToScreenInViewport, type Camera, type ViewportSize } from './renderer.js';

const camera: Camera = { center: { x: 25_000, y: 25_000 }, metersPerPixel: 10 };
const cssViewport: ViewportSize = { width: 320, height: 640 };

test('screen/world transforms use CSS viewport dimensions instead of DPR-scaled backing dimensions', () => {
  assert.deepEqual(screenToWorldInViewport({ x: 160, y: 320 }, camera, cssViewport), camera.center);
  assert.deepEqual(worldToScreenInViewport(camera.center, camera, cssViewport), { x: 160, y: 320 });
});

test('screen/world transforms round trip at CSS pixel coordinates', () => {
  const screenPoint = { x: 250, y: 128 };
  const worldPoint = screenToWorldInViewport(screenPoint, camera, cssViewport);
  assert.deepEqual(worldToScreenInViewport(worldPoint, camera, cssViewport), screenPoint);
});
