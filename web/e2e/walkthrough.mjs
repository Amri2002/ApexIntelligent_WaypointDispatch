// End-to-end judge walkthrough across all four roles, including offline driving.
// Usage: BASE_URL=http://localhost:3000 node e2e/walkthrough.mjs   (needs `npm i -D playwright` and a Chromium)
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || 'e2e/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let n = 0;
const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: false }); };
const step = (s) => console.log(`\n▶ ${s}`);
async function as(email, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) console.log(`  ${email} ${r.request().method()} ${new URL(r.url()).pathname} → ${r.status()}`); });
  page.on('requestfailed', (r) => { if (r.url().includes('/api/sync')) console.log(`  ${email} sync request failed: ${r.failure()?.errorText}`); });
  await page.goto(`${BASE}/login`);
  await page.getByRole('button', { name: new RegExp(email, 'i') }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  return page;
}
const phone = { width: 390, height: 844 };

step('Reset the demo day');
let d = await as('Dispatcher');
d.on('dialog', (dlg) => dlg.accept());
await d.getByRole('button', { name: 'Reset demo day' }).click();
await d.waitForURL(`${BASE}/dispatcher`); await d.waitForTimeout(1500);

step('Dispatcher · Peliyagoda: order queue → plan → shortfall decisions → publish');
await d.getByRole('button', { name: 'Peliyagoda' }).click();
await d.getByText('Confirmed orders').waitFor(); await shot(d, 'd1-orders');
await d.getByRole('button', { name: /Build plan/ }).click();
await d.waitForURL(`${BASE}/dispatcher/plan`); await d.getByText('Constraint checks').waitFor(); await shot(d, 'd2-plan');
await d.getByText('Review and decide').click();
await d.waitForURL(`${BASE}/dispatcher/shortfall`); await d.getByText('Fairness check.').waitFor();
const split = d.getByRole('button', { name: 'Split into two loads' });
if (await split.count()) { await split.first().click(); await d.waitForTimeout(2500); }
for (const input of await d.getByPlaceholder('Note required (second skip)').all()) await input.fill('No reefer reaches this district twice before 08:00; first in line tomorrow.');
await shot(d, 'g1-shortfall');
await d.getByRole('button', { name: /^Confirm \d+ deferral/ }).click();
await d.getByText('Recorded decisions').waitFor(); await shot(d, 'g1-decided');
await d.goto(`${BASE}/dispatcher/plan`);
await d.getByRole('button', { name: 'Publish to docks and drivers' }).click();
await d.getByRole('button', { name: 'Published' }).waitFor();
console.log('  Peliyagoda published');

step('Dispatcher · Kandy: plan and publish');
await d.getByRole('button', { name: 'Kandy' }).click(); await d.waitForTimeout(800);
if (await d.getByRole('button', { name: 'Run planner' }).count()) await d.getByRole('button', { name: 'Run planner' }).first().click();
await d.getByText('Constraint checks').waitFor();
await d.getByRole('button', { name: 'Publish to docks and drivers' }).click();
await d.getByRole('button', { name: 'Published' }).waitFor(); await shot(d, 'd2-kandy-published');

step('Loader · Kandy: load the Nuwara Eliya truck, flag a shortfall, seal');
const l = await as('Loader', phone);
await l.getByText('Next out').waitFor(); await shot(l, 'l1-dock');
// The demo store OUT106 is in Nuwara Eliya; open that trip.
await l.locator('a', { hasText: 'Nuwara Eliya' }).first().click();
await l.getByText('Load stop').waitFor(); await shot(l, 'l2-load');
const stopRow = l.locator('.lrow', { hasText: 'OUT106' });
await stopRow.getByRole('button', { name: 'Flag a problem' }).click();
await l.getByRole('button', { name: 'Damaged' }).click();
await l.getByRole('button', { name: 'More' }).click();
await shot(l, 'l3-flag');
await l.getByRole('button', { name: 'Send flag' }).click(); await l.waitForTimeout(1200);
for (let i = 0; i < 12 && (await l.locator('button.ck[aria-checked="false"]').count()); i++) { await l.locator('button.ck[aria-checked="false"]').first().click(); await l.waitForTimeout(700); }
await l.waitForTimeout(1200);
await l.getByRole('button', { name: /Seal and hand over to the driver/ }).click(); await l.waitForTimeout(1500);
await shot(l, 'l2-sealed');

step('Driver: start the trip, lose signal, record stops offline, reconnect');
const v = await as('Driver', phone);
await v.getByRole('button', { name: 'Start trip' }).waitFor(); await shot(v, 'v1-run');
await v.getByRole('button', { name: 'Start trip' }).click(); await v.waitForTimeout(1500);
await v.getByRole('button', { name: /^Arrived at/ }).click();
await v.getByPlaceholder('Name of store staff').fill('K. Perera');
const pad = v.locator('canvas.sig'); await pad.evaluate((e) => e.scrollIntoView({ block: 'center' })); await v.waitForTimeout(200); const b = await pad.boundingBox();
await v.mouse.move(b.x + 20, b.y + 60); await v.mouse.down(); await v.mouse.move(b.x + 120, b.y + 30, { steps: 8 }); await v.mouse.move(b.x + 200, b.y + 70, { steps: 8 }); await v.mouse.up();
await shot(v, 'v2-stop');
await v.getByRole('button', { name: /Complete stop/ }).click(); await v.waitForTimeout(1200);
// Signal drops: simulate from the menu.
await v.getByRole('button', { name: 'Connection and account' }).click();
await v.getByRole('checkbox').check(); await v.getByRole('button', { name: 'Connection and account' }).click();
let guard = 0;
while (await v.getByPlaceholder('Name of store staff').count() === 0 && guard++ < 3) { const b2 = v.getByRole('button', { name: /^Arrived at/ }); if (await b2.count()) await b2.click(); }
let first = true;
for (let i = 0; i < 8; i++) {
  if (!(await v.getByPlaceholder('Name of store staff').count())) break;
  await v.getByPlaceholder('Name of store staff').fill('S. Kumar');
  await v.locator('canvas.sig').evaluate((e) => e.scrollIntoView({ block: 'center' })); await v.waitForTimeout(200);
  const bb = await v.locator('canvas.sig').boundingBox();
  await v.mouse.move(bb.x + 20, bb.y + 60); await v.mouse.down(); await v.mouse.move(bb.x + 160, bb.y + 40, { steps: 6 }); await v.mouse.up();
  if (first) { await shot(v, 'g2-offline'); first = false; }
  try { await v.getByRole('button', { name: /^Save stop/ }).click({ timeout: 8000 }); }
  catch (e) { if (await v.getByPlaceholder('Name of store staff').count()) throw e; /* stop screen already closed: saved */ }
  await v.waitForTimeout(700);
}
await shot(v, 'g2-offline-run');

step('Dispatcher live board while the driver is offline');
await d.goto(`${BASE}/dispatcher/live`); await d.waitForTimeout(1500); await shot(d, 'd3-live-before-sync');

step('Store manager: ETA, truck is here, report the damaged items');
const m = await as('Store manager', phone);
await m.getByText('Deliveries').first().waitFor(); await shot(m, 'm2-arrival');
if (await m.getByRole('button', { name: 'The truck is here' }).count()) await m.getByRole('button', { name: 'The truck is here' }).click();
await m.getByRole('button', { name: 'Report an issue' }).click();
await m.getByRole('button', { name: 'Damaged' }).click(); await m.getByRole('button', { name: 'More' }).click();
await m.getByRole('button', { name: 'Send report' }).click(); await m.waitForTimeout(1500); await shot(m, 'm3-receipt');

step('Driver reconnects: sync report');
await v.getByRole('button', { name: 'Connection and account' }).click();
await v.getByRole('checkbox').uncheck();
const synced = await v.waitForResponse((r) => r.url().includes('/api/sync'), { timeout: 20000 }).catch(() => null);
console.log('  sync response:', synced ? synced.status() : 'none'); await v.waitForTimeout(2000);
await shot(v, 'g3-sync');

step('Store manager: the deferred outlet sees its notice');
const def = await d.request.get(`${BASE}/api/plans?depot=Peliyagoda`).then((r) => r.json());
const deferredOutlet = def.deferred.find((x) => x.status === 'confirmed')?.outlet.id;
await m.evaluate((o) => localStorage.setItem('wp-store-outlet', o), deferredOutlet);
await m.goto(`${BASE}/store`); await m.getByText(/arrives/).first().waitFor(); await shot(m, 'g4-deferral');
await m.getByRole('button', { name: 'Chiller will be empty' }).click(); await m.waitForTimeout(800);
await m.goto(`${BASE}/store/order`); await m.getByText('Orders close at 16:00').waitFor(); await shot(m, 'm1-order');
await m.getByRole('button', { name: /^Send/ }).click(); await m.getByText('Order confirmed').waitFor(); await shot(m, 'm1-confirmed');

step('Dispatcher: live board and forecast');
await d.goto(`${BASE}/dispatcher/live`); await d.waitForTimeout(1500); await shot(d, 'd3-live');
await d.goto(`${BASE}/dispatcher/forecast`); await d.getByText('Recommendation').waitFor(); await shot(d, 'd4-forecast');

await browser.close();
console.log(`\n✔ Walkthrough complete — screenshots in ${SHOTS}`);
