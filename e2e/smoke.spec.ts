import { test, expect } from '@playwright/test';

test('demo town → talk → whisper → news spreads → feed, no console errors', async ({ page }, info) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Eight neighbours/ })).toBeVisible();
  await page.screenshot({ path: `test-results/landing-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.getByTestId('town')).toBeVisible();
  await expect(page.getByTestId('clock')).toHaveText(/^0[78]:\d\d$/);

  await page.getByRole('list', { name: 'Residents' }).getByRole('button', { name: /^Raju/ }).click();
  await expect(page.getByTestId('person')).toContainText('Raju Yadav, 48');
  await page.getByLabel('Message').fill('Ek cutting chai please!');
  await page.getByRole('button', { name: 'Say' }).click();
  await expect(page.getByTestId('talk')).toContainText('Have some chai');

  await page.getByLabel('News').fill('The cricket ground is getting floodlights!');
  await page.getByRole('button', { name: 'Whisper' }).click();
  await page.getByRole('button', { name: /^News/ }).click();
  await expect(page.getByTestId('news')).toContainText('floodlights');
  await expect(page.getByTestId('news')).toContainText('→', { timeout: 120000 });
  await page.screenshot({ path: `test-results/news-${info.project.name}.png`, fullPage: true });

  await page.getByRole('button', { name: 'Live' }).click();
  await expect(page.getByTestId('feed')).toContainText(/walking|chatting/);
  await page.screenshot({ path: `test-results/town-${info.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});
