import { expect, test, type Page } from '@playwright/test';

const screenshotPoint = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
};

const startFlying = async (page: Page): Promise<void> => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'FLY' }).click();
  await expect(page.getByRole('button', { name: 'RESET' })).toBeVisible();
  await expect(page.getByLabel('flight controls')).toBeVisible();
};

test('quality point 1 camera keeps aircraft bottom-fixed and rotated world visible', async ({ page }) => {
  await startFlying(page);
  await page.getByText(/AGL/).waitFor();
  await page.getByRole('button', { name: '↻' }).dispatchEvent('pointerdown');
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '↻' }).dispatchEvent('pointerup');
  await expect(page.locator('#hud')).toContainText(/HDG \d+°/);
  await screenshotPoint(page, '01-camera-bottom-fixed-rotated-world');
});

test('quality point 2 controls are transparent gameplay overlays in corners', async ({ page }) => {
  await startFlying(page);
  const controls = page.getByLabel('flight controls');
  await expect(controls).toBeVisible();
  await expect(page.getByRole('button', { name: 'CANNON' })).toHaveCSS('opacity', '0.74');
  await screenshotPoint(page, '02-transparent-overlay-controls');
});

test('quality point 3 minimap shows spotting mask and terrain contours', async ({ page }) => {
  await startFlying(page);
  await expect(page.getByLabel('minimap')).toBeVisible();
  await page.waitForTimeout(250);
  await screenshotPoint(page, '03-spotting-minimap-contours');
});

test('quality point 4 planner supports drag zoom and hides gameplay controls', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByLabel('flight controls')).toBeHidden();
  const canvas = page.getByLabel('battle map');
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 60);
  await page.mouse.up();
  await page.mouse.wheel(0, 450);
  await screenshotPoint(page, '04-planner-drag-zoom-controls-hidden');
});

test('quality point 5 physics HUD reports realistic speed after acceleration', async ({ page }) => {
  await startFlying(page);
  await page.getByRole('button', { name: '▲' }).dispatchEvent('pointerdown');
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: '▲' }).dispatchEvent('pointerup');
  await expect(page.locator('#hud')).toContainText(/SPD [1-9]\d* m\/s/);
  await screenshotPoint(page, '05-physics-acceleration-speed-hud');
});

test('quality point 6 HUD has health altitude speed heading and explicit status text', async ({ page }) => {
  await startFlying(page);
  await expect(page.locator('#hud')).toContainText(/MY HP/);
  await expect(page.locator('#hud')).toContainText(/AGL \d+ m · ASL \d+ m · SPD \d+ m\/s · HDG \d+°/);
  await screenshotPoint(page, '06-hud-health-altitude-speed-heading');
});

test('quality point 7 weapons show cannon/missile effects and lock readout', async ({ page }) => {
  await startFlying(page);
  await page.getByRole('button', { name: 'MISSILE' }).click();
  await page.getByRole('button', { name: 'CANNON' }).click();
  await page.waitForTimeout(250);
  await expect(page.locator('#hud')).toContainText(/LOCK/);
  await screenshotPoint(page, '07-effects-lock-reticle-weapons');
});
