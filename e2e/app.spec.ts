import { expect, test } from '@playwright/test';

test('GitHub Pages build loads useful game UI without browser errors', async ({ page }) => {
  const runtimeErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'failed'}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
  });

  await page.goto('/', { waitUntil: 'networkidle' });

  await expect(page).toHaveTitle('Longbow 2D Tactical');
  await expect(page.getByRole('heading', { name: 'Longbow 2D Tactical' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'FLY' })).toBeVisible();
  await expect(page.getByText('Planner:', { exact: true })).toBeVisible();
  await expect(page.getByLabel('flight controls')).toBeVisible();

  const battleCanvas = page.getByLabel('battle map');
  await expect(battleCanvas).toBeVisible();
  await expect(page.getByLabel('minimap')).toBeVisible();
  await expect(page.locator('#hud')).toContainText(/PLANNING|Blue territory|Enemy contacts/);

  const canvasState = await battleCanvas.evaluate((canvasElement) => {
    const canvas = canvasElement as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { width: canvas.width, height: canvas.height, hasPaint: false };
    const sample = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let paintedPixels = 0;
    for (let index = 3; index < sample.length; index += 4) {
      if (sample[index] !== 0) paintedPixels += 1;
    }
    return { width: canvas.width, height: canvas.height, hasPaint: paintedPixels > 500 };
  });

  expect(canvasState.width, 'battle canvas should have a rendered width').toBeGreaterThan(100);
  expect(canvasState.height, 'battle canvas should have a rendered height').toBeGreaterThan(100);
  expect(canvasState.hasPaint, 'battle canvas should contain rendered tactical map pixels').toBe(true);
  expect(runtimeErrors, 'page should load without console or uncaught errors').toEqual([]);
  expect(failedRequests, 'page should not have missing deployment assets').toEqual([]);
});
