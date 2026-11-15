// Production viewer acceptance using replayed transport of real CPython products.
// Run verify-hd-field.py first. No synthetic image data or live search is claimed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.KHONSU_TEST_URL || 'http://localhost:3001';
const inspect = process.argv.includes('--inspect');
const products = resolve('.cache/hd-field/output');
const output = resolve(process.env.KHONSU_TEST_OUTPUT || '.cache/hd-field/browser');
await mkdir(output, { recursive: true });
const manifest = JSON.parse(await readFile(`${products}/manifest.json`, 'utf8'));
assert.equal(manifest.grid.width_px, 2048);
assert.equal(manifest.frames.length, 2);
const assets = new Map();
for (const frame of manifest.frames) {
  for (const path of [frame.image_url, frame.raster.url]) assets.set(path, await readFile(`${products}/${path.split('/').pop()}`));
  assert.equal(createHash('sha256').update(assets.get(frame.raster.url)).digest('hex'), frame.raster.sha256);
}
const report = { testedAt: new Date().toISOString(), baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope: 'Production static viewer; controlled job/asset transport replay of two real 2-degree CPython products. Not a live archive query or public deployment.',
  sourceHashes: {}, observations: manifest.frames.map(f => ({ id: f.observation_id, utc: f.observed_start_utc, sha256: f.raster.sha256 })), browsers: [] };
for (const path of ['apps/web/src/features/viewer/SkyViewer.tsx', 'apps/web/src/features/viewer/display.ts', 'apps/web/src/features/viewer/viewport.ts', 'scripts/verify-hd-display.mjs']) {
  report.sourceHashes[path] = createHash('sha256').update(await readFile(path)).digest('hex');
}
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('canvas')?.style.visibility === 'visible');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
for (const engine of inspect ? [chromium] : [chromium, firefox]) {
  const browser = await engine.launch({ headless: !inspect, ...(engine === chromium && process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    let submitted;
    await page.route('**/v1/sequences**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      const headers = { 'access-control-allow-origin': new URL(base).origin, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (path === '/v1/sequences' && request.method() === 'POST') {
        submitted = request.postDataJSON();
        return route.fulfill({ status: 202, headers, json: { sequence_id: manifest.sequence_id, status: 'queued', progress: 0 } });
      }
      if (path === `/v1/sequences/${manifest.sequence_id}`) return route.fulfill({ headers, json: { sequence_id: manifest.sequence_id, status: 'ready', progress: 1 } });
      if (path.endsWith('/manifest')) return route.fulfill({ headers, json: manifest });
      if (assets.has(path)) return route.fulfill({ headers, contentType: path.endsWith('.png') ? 'image/png' : 'application/octet-stream', body: assets.get(path) });
      throw Error(`Unexpected replay request: ${request.method()} ${path}`);
    });
    await page.goto(`${base}/?ra_deg=${manifest.target.ra_deg}&dec_deg=${manifest.target.dec_deg}&fov_arcmin=120`, { waitUntil: 'domcontentloaded' });
    // Wait for hydration and shared-link restoration before changing the form.
    await page.waitForFunction(() => document.querySelector('#fov')?.value === '120');
    // Fill explicitly as well: the round-trip URL itself is covered below.
    await page.locator('#ra').fill(String(manifest.target.ra_deg));
    await page.locator('#dec').fill(String(manifest.target.dec_deg));
    await page.locator('#fov').fill('120');
    await button(page, 'EXPLORE THE SKY').click(); await ready(page);
    if (inspect) {
      await page.evaluate(() => {
        const notice = document.createElement('p');
        notice.textContent = 'LOCAL REVIEW: recorded real SPHEREx observations. Job transport is replayed; this is not a new archive search.';
        notice.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:1000;margin:0;padding:8px;background:#f3bc60;color:#070b12;font:14px sans-serif;text-align:center;pointer-events:none';
        document.body.prepend(notice);
      });
      console.log('Interactive review is open. Close the browser window to finish. No archive download is made by this replay.');
      await page.waitForEvent('close', { timeout: 0 });
      continue;
    }
    assert.equal(submitted.fov_arcmin, 120); assert.equal(submitted.max_frames, 4);
    assert.equal(new URL(page.url()).searchParams.get('fov_arcmin'), '120');
    const native = Number(await page.locator('[data-native-samples]').getAttribute('data-native-samples'));
    assert(native > 1170 && native < 1180);
    await button(page, 'EXPAND').click(); await ready(page);
    await button(page, 'NATIVE SCALE').click(); await ready(page);
    const canvas = page.locator('canvas');
    const nativeDisplay = await canvas.evaluate(c => ({ width: c.width, height: c.height }));
    assert(nativeDisplay.width >= 1080 && nativeDisplay.width <= 2160);
    await button(page, 'Zoom in').click(); await ready(page);
    const overview = page.getByRole('button', { name: 'Field overview: click to recenter, Enter to center the field', exact: true });
    await overview.click({ position: { x: 20, y: 20 } });
    assert.notEqual(await canvas.evaluate(c => c.style.transform), 'translate(0px, 0px) scale(1)');
    await overview.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => { const m = new DOMMatrix(getComputedStyle(document.querySelector('canvas')).transform); return m.e === 0 && m.f === 0; });
    assert.deepEqual(await canvas.evaluate(c => { const m = new DOMMatrix(getComputedStyle(c).transform); return [m.e, m.f]; }), [0, 0]);
    await page.keyboard.press('Escape'); await button(page, 'EXPAND').waitFor();
    await button(page, 'FIT / RESET').click(); await ready(page);
    const initial = await canvas.getAttribute('aria-label');
    await page.getByRole('button', { name: /^Show B,/ }).click(); await ready(page);
    assert.notEqual(await canvas.getAttribute('aria-label'), initial);
    await page.getByRole('button', { name: /^Show A,/ }).click(); await ready(page);
    assert.equal(await canvas.getAttribute('aria-label'), initial);
    // Displayed validity at sampled output pixels must match the transported mask.
    const mask = assets.get(manifest.frames[0].raster.url).subarray(2048 * 2048 * 4);
    const probes = await canvas.evaluate(c => {
      const rgba = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, values = [];
      for (let y = 11; y < c.height; y += 37) for (let x = 13; x < c.width; x += 31) {
        const i = (y * c.width + x) * 4;
        values.push({ source: Math.floor((y + .5) * 2048 / c.height) * 2048 + Math.floor((x + .5) * 2048 / c.width), masked: rgba[i] === 7 && rgba[i+1] === 11 && rgba[i+2] === 18 });
      }
      return values;
    });
    for (const probe of probes) assert.equal(probe.masked, mask[probe.source] === 0);
    const gpuMode = await page.locator('[data-renderer]').textContent();
    await page.locator('summary').filter({ hasText: 'IMAGE DISPLAY' }).click();
    await page.getByLabel('Rendering mode', { exact: true }).selectOption('cpu'); await ready(page);
    assert.equal(await page.locator('[data-renderer]').textContent(), 'CPU worker');
    await page.getByLabel('Rendering mode', { exact: true }).selectOption('auto'); await ready(page);
    await page.waitForFunction(mode => document.querySelector('[data-renderer]')?.textContent === mode, gpuMode);
    await ready(page);
    await page.locator('summary').filter({ hasText: 'IMAGE DISPLAY' }).click();
    await ready(page);
    // Read back the actual canvas. A locator screenshot can resize Chromium's
    // viewport to capture this tall square, starting a new responsive render.
    const captured = await canvas.evaluate(c => {
      const rgba = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let signal = 0;
      for (let i = 0; i < rgba.length; i += 4) if (rgba[i] > 80 && rgba[i] === rgba[i+1] && rgba[i] === rgba[i+2]) signal++;
      return { signal, image: c.toDataURL('image/jpeg', .85) };
    });
    assert(captured.signal > 1000, 'GPU restoration must show measured image structure, not an empty canvas');
    await writeFile(`${output}/${engine.name()}-hd-field.jpg`, Buffer.from(captured.image.split(',')[1], 'base64'));
    await button(page, 'MARK').click();
    await page.getByRole('group', { name: 'Observation canvas', exact: true }).focus(); await page.keyboard.press('Enter');
    await page.getByLabel('Observation note', { exact: true }).fill('Wide-field acceptance control, not a discovery.');
    await button(page, 'SAVE CANDIDATE NOTE').click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('khonsu.candidates.v2')));
    assert.equal(stored.candidates[0].selection.x, 1024);
    assert.equal(stored.candidates[0].selection.pixelHasData, mask[1024 * 2048 + 1024] === 1);
    assert.deepEqual(stored.sequences[manifest.sequence_id].frames.map(f => f.source_fits_url), manifest.frames.map(f => f.source_fits_url));
    await page.setViewportSize({ width: 390, height: 844 }); await ready(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('#explorer').screenshot({ path: `${output}/${engine.name()}-hd-mobile.jpg`, type: 'jpeg', quality: 75 });
    assert.deepEqual(errors, []);
    report.browsers.push({ browser: engine.name(), version: browser.version(), nativeDisplay, nativeSamples: native, automaticRenderer: gpuMode,
      requestAndUrl: true, overviewKeyboardAndPointer: true, actualEpochSwitch: true, maskProbes: probes.length, cpuWorker: true, restoredImageSignalPixels: captured.signal, candidateLineage: true, mobileNoOverflow: true });
    await writeFile(`${output}/hd-display-report.json`, JSON.stringify(report, null, 2) + '\n');
    console.log(`${engine.name()}: real HD replay passed`);
  } finally { await browser.close(); }
}
