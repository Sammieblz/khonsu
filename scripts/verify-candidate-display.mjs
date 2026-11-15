// Browser acceptance for the candidate-record and display-renderer integration.
// Uses actual cached observations and isolated browser storage, never user notes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.KHONSU_TEST_URL || 'http://localhost:3001';
const api = process.env.KHONSU_TEST_API || 'http://localhost:8000';
const output = resolve(process.env.KHONSU_TEST_OUTPUT || '.cache/enhancement/integration');
await mkdir(output, { recursive: true });
const examples = await (await fetch(`${api}/v1/examples`)).json();
const primary = examples.find(item => item.sequence_id === 'real-wise-0855');
const bytes = Buffer.from(await (await fetch(`${api}${primary.frames[0].raster.url}`)).arrayBuffer());
const width = primary.grid.width_px, height = primary.grid.height_px, mask = bytes.subarray(width * height * 4);
const report = { testedAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), browsers: [] };
report.sourceHashes = {};
for (const path of ['apps/web/src/features/viewer/SkyViewer.tsx', 'apps/web/src/features/annotations/useAnnotations.ts', 'scripts/verify-candidate-display.mjs']) {
  report.sourceHashes[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
}
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('canvas')?.style.visibility === 'visible');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function load(page) {
  await page.getByLabel('Cached real field', { exact: true }).selectOption(primary.sequence_id);
  await button(page, 'LOAD CACHED REAL EXAMPLE').click(); await ready(page);
}
async function mark(page, x, y) {
  await button(page, 'MARK').click(); await ready(page);
  await page.getByRole('group', { name: 'Observation canvas', exact: true }).scrollIntoViewIfNeeded();
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + (x + .5) * box.width / width, box.y + (y + .5) * box.height / height);
  assert.match(await page.locator('#explorer').innerText(), new RegExp(`Grid pixel X ${x}, Y ${y} on observation`));
}
async function ring(page, x, y, color) {
  await ready(page);
  // Inspect actual colored pixels around the expected grid center, independently
  // of the draw calls. Grayscale stars and slate masks cannot satisfy this check.
  return page.locator('canvas').evaluate((canvas, { x, y, width, height, color }) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const cx = (x + .5) * canvas.width / width, cy = (y + .5) * canvas.height / height;
    const radius = Math.max(10, canvas.width / 40), tolerance = Math.max(3, canvas.width / 200);
    let found = 0;
    for (let i = 0; i < 64; i++) {
      const angle = i * 2 * Math.PI / 64;
      let hit = false;
      for (let delta = -tolerance; delta <= tolerance && !hit; delta++) {
        const px = Math.round(cx + (radius + delta) * Math.cos(angle)), py = Math.round(cy + (radius + delta) * Math.sin(angle));
        if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
        const offset = (py * canvas.width + px) * 4;
        hit = color.every((value, channel) => Math.abs(pixels[offset + channel] - value) < 6);
      }
      if (hit) found++;
    }
    return found;
  }, { x, y, width, height, color });
}
const amber = [243, 188, 96], cyan = [121, 199, 232];

for (const engine of [chromium, firefox]) {
  const browser = await engine.launch({ headless: true,
    ...(engine === chromium && process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
  });
  const result = { browser: engine.name(), version: browser.version() };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await page.addInitScript(() => {
      window.__candidateWrites = [];
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'khonsu.candidates.v2') window.__candidateWrites.push(JSON.parse(value).candidates.length);
        return set.call(this, key, value);
      };
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' }); await load(page);
    await button(page, 'DETAIL EXPERIMENT').click();
    await page.getByLabel('Comparison A', { exact: true }).selectOption('1');
    await button(page, 'PAN').click();
    for (let i = 0; i < 4; i++) await button(page, 'Zoom in').click();
    const field = page.getByRole('group', { name: 'Observation canvas', exact: true });
    await field.focus(); await page.keyboard.press('ArrowRight');
    await mark(page, 59, 59);
    assert.equal(await page.locator('canvas').evaluate(canvas => canvas.width), 1536);
    assert.equal(await page.locator('[data-detail]').getAttribute('data-detail'), 'off');
    await page.getByLabel('Observation note', { exact: true }).fill('Integration control: compare original intensities.');
    await button(page, 'SAVE CANDIDATE NOTE').click(); await ready(page);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('khonsu.candidates.v2')));
    const candidate = stored.candidates[0];
    assert.equal(candidate.selection.x, 59); assert.equal(candidate.selection.y, 59);
    assert.equal(candidate.selection.pixelHasData, mask[59 * width + 59] === 1);
    assert.deepEqual(candidate.selection.comparison, { aFrameId: primary.frames[1].frame_id, bFrameId: primary.frames[2].frame_id });
    // Independent astropy 7.0.1 references already recorded in sky.test.ts.
    assert(Math.abs(candidate.sky.ra_deg - 133.75969425462017) < 1e-9);
    assert(Math.abs(candidate.sky.dec_deg - -7.242551669826732) < 1e-9);
    assert.deepEqual(stored.sequences[primary.sequence_id].frames.map(frame => frame.source_fits_url), primary.frames.map(frame => frame.source_fits_url));
    const solid = await ring(page, 59, 59, amber); assert(solid > 55);
    await button(page, 'Show candidate 01 on the image').click();
    assert(await ring(page, 59, 59, cyan) > 55, 'Selecting a candidate on the same frame must redraw the marker');
    await button(page, 'Show candidate 01 on the image').click();
    assert(await ring(page, 59, 59, amber) > 55);
    await button(page, 'REWIND').click(); await ready(page);
    assert.equal(await page.locator('[data-detail]').getAttribute('data-detail'), 'on');
    await page.locator('#observation-index').fill('1000'); await ready(page);
    const dashed = await ring(page, 59, 59, amber);
    assert(dashed > 15 && dashed < solid - 8, `Expected cross-epoch dashed marker: ${dashed} versus ${solid}`);
    await button(page, 'FIT / RESET').click(); assert(await ring(page, 59, 59, amber) > 15);
    await page.locator('summary').filter({ hasText: 'IMAGE DISPLAY' }).click();
    await page.getByLabel('Rendering mode', { exact: true }).selectOption('cpu'); await ready(page);
    assert.equal(await page.locator('[data-renderer]').textContent(), 'CPU worker');
    assert(await ring(page, 59, 59, amber) > 15);
    await page.setViewportSize({ width: 390, height: 844 }); await ready(page);
    assert(await ring(page, 59, 59, amber) > 15);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('#explorer').screenshot({ path: `${output}/${engine.name()}-candidate-mobile.png` });
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.getByLabel('Rendering mode', { exact: true }).selectOption('auto');
    await button(page, 'Show candidate 01 on the image').click(); await ready(page);
    assert.equal(await page.locator('canvas').getAttribute('aria-label'), `Observation ${primary.frames[0].observation_id}`);
    assert(await ring(page, 59, 59, cyan) > 55);
    await page.locator('#explorer').screenshot({ path: `${output}/${engine.name()}-candidate-desktop.png` });
    const missing = mask.findIndex((valid, i) => !valid && i % width > width * .3 && i % width < width * .7 && Math.floor(i / width) > height * .3 && Math.floor(i / width) < height * .7);
    assert(missing >= 0);
    await mark(page, missing % width, Math.floor(missing / width));
    await page.getByText(/No valid data at this pixel in this observation/).waitFor();
    await page.getByLabel('Observation note', { exact: true }).fill('Masked pixel control, not a measured source.');
    await button(page, 'SAVE CANDIDATE NOTE').click(); await ready(page);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('khonsu.candidates.v2')).candidates[1].selection.pixelHasData), false);
    await page.reload({ waitUntil: 'domcontentloaded' }); await load(page);
    await page.getByText('Integration control: compare original intensities.', { exact: true }).waitFor();
    await page.getByText('Masked pixel control, not a measured source.', { exact: true }).waitFor();
    const writes = await page.evaluate(() => window.__candidateWrites);
    assert(writes.length > 0 && writes.every(count => count === 2), `Reload must never temporarily overwrite saved notes with an empty list: ${writes}`);
    result.zoomPanAndBoundedCanvas = true;
    result.astropyPositionAndComparisonMetadata = true;
    result.solidSelectedAndDashedMarkers = { solidSamples: solid, dashedSamples: dashed };
    result.cpuGpuResizeAndMaskValidity = true;
    result.notesSurviveReloadWithoutEmptyWrite = true;
    assert.deepEqual(errors, []); await page.close();

    const legacy = await browser.newPage();
    await legacy.addInitScript(({ sequenceId, frameId }) => {
      const records = [{ id: 'legacy-control', selection: { sequenceId, frameId, x: 59, y: 59, coordinateSpace: 'natural-raster', pixelOrigin: 'top-left' }, note: 'Legacy migration control', createdAt: '2026-11-14T10:00:00Z' }];
      localStorage.setItem('khonsu.annotations.v1', JSON.stringify(records));
      window.__migrationWrites = [];
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'khonsu.candidates.v2') window.__migrationWrites.push(JSON.parse(value).candidates.length);
        return set.call(this, key, value);
      };
    }, { sequenceId: primary.sequence_id, frameId: primary.frames[0].frame_id });
    await legacy.goto(base, { waitUntil: 'domcontentloaded' }); await load(legacy);
    await legacy.getByText('Legacy migration control', { exact: true }).waitFor();
    const migrated = await legacy.evaluate(() => ({ store: JSON.parse(localStorage.getItem('khonsu.candidates.v2')), writes: window.__migrationWrites }));
    assert.equal(migrated.store.candidates.length, 1); assert.equal(migrated.store.candidates[0].sky, null);
    assert(migrated.writes.length > 0 && migrated.writes.every(count => count === 1), `Migration must persist the loaded records, never an empty initial store: ${migrated.writes}`);
    result.legacyMigration = true; await legacy.close();
    const unreadable = await browser.newPage();
    const futureStore = JSON.stringify({ schema: 'khonsu-candidates', version: 9, candidates: ['preserve this test data'] });
    await unreadable.addInitScript(raw => localStorage.setItem('khonsu.candidates.v2', raw), futureStore);
    await unreadable.goto(base, { waitUntil: 'domcontentloaded' }); await load(unreadable);
    await unreadable.getByText(/saved candidates use format version 9/).waitFor();
    assert.equal(await unreadable.evaluate(() => localStorage.getItem('khonsu.candidates.v2')), futureStore);
    await button(unreadable, "REPLACE IT WITH THIS PAGE'S CANDIDATES").click();
    await unreadable.waitForFunction(() => JSON.parse(localStorage.getItem('khonsu.candidates.v2')).version === 2);
    result.unreadablePreservedUntilExplicitReplacement = true; await unreadable.close();
    report.browsers.push(result);
    await writeFile(`${output}/candidate-display-report.json`, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${engine.name()}: candidate/display integration passed`);
  } finally { await browser.close(); }
}
