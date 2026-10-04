// Breakdown demo: run after walkthrough.mjs (both depots published).
// Usage: BASE_URL=http://localhost:3000 node e2e/breakdown.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || 'e2e/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
async function as(role, viewport = { width: 1440, height: 900 }) {
  const page = await (await browser.newContext({ viewport, serviceWorkers: 'block' })).newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.goto(`${BASE}/login`);
  await page.getByRole('button', { name: new RegExp(role, 'i') }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  return page;
}

console.log('▶ Dispatcher: VEH007 breaks down after the Peliyagoda plan is published');
const d = await as('Dispatcher');
d.on('dialog', (dlg) => dlg.accept());
await d.goto(`${BASE}/dispatcher/plan`);
await d.getByRole('button', { name: /^Fri/ }).click().catch(() => {});
await d.getByRole('button', { name: 'Peliyagoda' }).click();
await d.getByText('Constraint checks').waitFor();
await d.locator('.vrow', { hasText: 'VEH007' }).locator('button.trip').first().click();
await d.getByRole('button', { name: /Report VEH007 broken down/ }).click();
const toast = await d.locator('.toast').first().innerText({ timeout: 15000 });
console.log('  toast:', toast);
await d.waitForTimeout(800); await d.screenshot({ path: `${SHOTS}/b1-plan-after-breakdown.png` });
await d.goto(`${BASE}/dispatcher/live`); await d.waitForTimeout(1500); await d.screenshot({ path: `${SHOTS}/b2-live-breakdown.png` });

console.log('▶ Store whose order moved sees the change');
const m = await as('Store manager', { width: 390, height: 844 });
await m.evaluate(() => localStorage.setItem('wp-store-outlet', 'OUT068'));
await m.goto(`${BASE}/store`); await m.getByText(/Plan changed/).first().waitFor({ timeout: 10000 });
await m.screenshot({ path: `${SHOTS}/b3-store-plan-changed.png` });
await browser.close();
console.log('✔ Breakdown demo complete');
