import { clamp, smoothNoise } from './math.js';
import type { TerrainMap, TerrainSample } from './types.js';

export const WORLD_SIZE_M = 50_000;

const ridge = (n: number): number => 1 - Math.abs(n * 2 - 1);

export const createTerrain = (sizeM = WORLD_SIZE_M): TerrainMap => ({
  sizeM,
  sample(xM: number, yM: number): TerrainSample {
    const nx = xM / sizeM;
    const ny = yM / sizeM;
    const broadValley = Math.exp(-Math.pow((nx - 0.48) * 3.1, 2)) * 0.45;
    const river = Math.exp(-Math.pow((nx - 0.5 - Math.sin(ny * 8) * 0.055) * 34, 2));
    const mountainNorth = ridge(smoothNoise(nx * 3.2, ny * 2.6, 4)) * 620;
    const foothills = smoothNoise(nx * 10, ny * 10, 14) * 180;
    const plateau = ny < 0.26 ? 260 : 0;
    const heightM = clamp(250 + mountainNorth + foothills + plateau - broadValley * 520 - river * 230, 0, 1400);
    const forest = clamp((smoothNoise(nx * 16, ny * 16, 22) - 0.34) * 2.4 + (heightM > 350 ? 0.22 : 0), 0, 1);
    const water = river > 0.58 && heightM < 360 ? clamp((river - 0.58) * 2.4, 0, 1) : 0;
    const h2 = 250 + ridge(smoothNoise((nx + 0.003) * 3.2, ny * 2.6, 4)) * 620;
    const slope = clamp(Math.abs(h2 - heightM) / 80, 0, 1);
    return { heightM, water, forest, slope };
  },
});

export const terrainColor = (sample: TerrainSample): string => {
  if (sample.water > 0.15) return `rgb(${24}, ${Math.round(74 + sample.water * 42)}, ${Math.round(92 + sample.water * 80)})`;
  if (sample.forest > 0.55) return `rgb(${Math.round(28 + sample.slope * 22)}, ${Math.round(82 + sample.forest * 42)}, ${Math.round(38 + sample.slope * 18)})`;
  if (sample.heightM > 820) return `rgb(${Math.round(120 + sample.slope * 55)}, ${Math.round(118 + sample.slope * 45)}, ${Math.round(98 + sample.slope * 38)})`;
  if (sample.heightM > 520) return `rgb(${Math.round(98 + sample.slope * 34)}, ${Math.round(122 + sample.slope * 24)}, ${Math.round(67 + sample.slope * 20)})`;
  return `rgb(${Math.round(76 + sample.slope * 20)}, ${Math.round(134 + sample.forest * 24)}, ${Math.round(70 + sample.slope * 10)})`;
};
