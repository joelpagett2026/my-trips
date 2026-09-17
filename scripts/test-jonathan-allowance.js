// Run from the repository root with Node and Playwright available.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext();
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'allowance.test') return route.abort();
    if (url.pathname === '/auth.js' || url.pathname === '/db.js')
      return route.fulfill({ contentType: 'application/javascript', body: 'window.dbLoad = async () => ({});' });
    let file = path.join(process.cwd(), url.pathname);
    if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html', body: fs.readFileSync(file) });
  });
  const page = await context.newPage();
  const go = p => page.goto('https://allowance.test' + p);
  const text = id => page.locator('#' + id).textContent();
  for (const year of [2026, 2027]) {
    await go('/holidays/jonathan/' + year + '.html');
    await page.waitForFunction(() => document.getElementById('tot-hol').textContent !== '—');
    assert.equal(await page.locator('#tot-lieu').count(), 0);
    assert.equal(await page.getByText('Lieu time', { exact: true }).count(), 0);
    assert.equal(Number(await text('tot-remain')), 24 - Number(await text('tot-hol')));
    for (const used of [0, 2.5, 24, 25]) {
      await page.evaluate(used => recalc([{ hol: used, lieu: 99 }]), used);
      assert.equal(Number(await text('tot-remain')), 24 - used);
    }
    const totals = await page.evaluate(() => HolidayAllowance.summary([]));
    assert.deepEqual(totals, { used: 0, remaining: 24, total: 35 });
  }
  // Exercise the actual editor's change/add/delete handlers, then reload and
  // verify the same stored lists are consumed by Jonathan's read-only views.
  for (const period of ['2026-27', '2027-28']) {
    const year = Number(period.slice(0, 4));
    await go('/holidays/' + period + '.html');
    const cards = page.locator('.trip-card');
    const initialCount = await cards.count();
    await cards.first().locator('input').nth(0).fill('Persistence check');
    await cards.first().locator('input').nth(1).fill('12/06/' + year);
    await cards.first().locator('input').nth(6).fill('7');
    await page.reload();
    assert.equal(await cards.first().locator('input').nth(0).inputValue(), 'Persistence check');
    assert.equal(await cards.first().locator('input').nth(6).inputValue(), '7');
    await page.evaluate(year => addTrip({ dest: 'Added trip', start: '14/07/' + year, hol: 2, lieu: 0 }), year);
    await page.reload();
    assert.equal(await cards.count(), initialCount + 1);
    await cards.first().locator('.del-btn').click();
    await page.reload();
    assert.equal(await cards.count(), initialCount);
    const expected = await page.evaluate(year => {
      const saved = JSON.parse(localStorage.getItem('holiday-allowance-' + year + '-' + String(year + 1).slice(-2) + '-v1'));
      return saved;
    }, year);
    assert(!expected.some(t => t.dest === 'Persistence check'));
    await go('/holidays/jonathan/' + year + '.html');
    await page.waitForFunction(() => document.getElementById('tot-hol').textContent !== '—');
    assert.equal(await page.getByText('Added trip', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Persistence check', { exact: true }).count(), 0);
    await page.reload();
    await page.waitForFunction(() => document.getElementById('tot-hol').textContent !== '—');
    const summary = await page.evaluate(async year => HolidayAllowance.summary(await HolidayAllowance.loadJonathan(year)), year);
    assert.equal(Number(await text('tot-remain')), summary.remaining);
  }
  // Empty lists are deliberate deletions, not a reason to restore defaults.
  await page.evaluate(() => ['2025-26', '2026-27', '2027-28'].forEach(p => localStorage.setItem('holiday-allowance-' + p + '-v1', '[]')));
  for (const [url, id] of [['/holidays/jonathan/2026.html', 'tot-remain'], ['/holidays/jonathan/2027.html', 'tot-remain'], ['/holidays/', 'jon-rem'], ['/', 'jon-rem']]) {
    await go(url);
    await page.waitForFunction(id => document.getElementById(id).textContent === '24', id);
    assert.equal(await text(id), '24');
  }
  await page.evaluate(() => localStorage.setItem('holiday-allowance-2026-27-v1', '{invalid'));
  await go('/holidays/jonathan/2026.html');
  await page.waitForFunction(() => document.querySelectorAll('.trip-card').length > 0);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const url of ['/holidays/jonathan/2026.html', '/holidays/jonathan/2027.html', '/holidays/jonathan/', '/holidays/']) {
      await go(url);
      assert(await page.getByText('Bank Holidays', { exact: true }).count() > 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (process.env.TEST_SCREENSHOTS && url.endsWith('2026.html')) {
        await page.waitForFunction(() => document.getElementById('tot-hol').textContent !== '—');
        await page.screenshot({ path: path.join(process.env.TEST_SCREENSHOTS, 'jonathan-' + width + '.png'), fullPage: true });
      }
    }
  }
  await browser.close();
  console.log('PASS: calculations, no lieu UI, editor persistence, saved-data sync, empty/corrupt storage, desktop/mobile layouts');
})().catch(error => { console.error(error); process.exit(1); });
