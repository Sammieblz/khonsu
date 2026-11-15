// Browser acceptance against a running static export and the real local API.
// Install Playwright separately; this adds no application runtime dependency.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.KHONSU_TEST_URL || 'http://localhost:3001';
const api = process.env.KHONSU_TEST_API || 'http://localhost:8000';
const output = resolve(process.env.KHONSU_TEST_OUTPUT || '.cache/console');
await mkdir(output, { recursive: true });
const json = async path => {
  const response = await fetch(`${api}${path}`);
  assert.equal(response.status, 200, path);
  return response.json();
};
const examples = await json('/v1/examples');
const presets = await json('/v1/presets');
assert.equal(presets.length, 5);
const primary = examples.find(item => item.sequence_id === 'real-wise-0855');
const backup = examples.find(item => item.sequence_id === 'real-epsilon-indi-b');
assert(primary && backup, 'Both verified real bundles must be present');
const report = {
  testedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  frontend: base, api, browsers: [],
  realExamples: [primary, backup].map(item => ({
    sequence: item.sequence_id, frames: item.frames.map(frame => ({
      id: frame.observation_id, utc: frame.observed_start_utc, release: frame.release,
    })),
  })),
};
const button = (page, name) => page.getByRole('button', { name, exact: true });
const date = page => page.getByRole('slider', { name: 'Observation time', exact: true });
const waitRender = async page => {
  await page.waitForFunction(() => document.querySelector('canvas')?.style.visibility === 'visible');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};
const openDisplay = async page => {
  const summary = page.locator('summary').filter({ hasText: 'IMAGE DISPLAY' });
  if (!(await summary.evaluate(element => element.parentElement.open))) await summary.click();
};
async function load(page, example = primary) {
  await page.getByLabel('Cached real field', { exact: true }).selectOption(example.sequence_id);
  await button(page, 'LOAD CACHED REAL EXAMPLE').click();
  await page.waitForFunction(label => document.querySelector('canvas')?.getAttribute('aria-label') === label,
    `Observation ${example.frames[0].observation_id}`);
  await waitRender(page);
  assert.equal(await page.locator('#explorer').getAttribute('tabindex'), '-1');
}
async function capture(page, key) {
  await waitRender(page);
  await page.evaluate(key => {
    const canvas = document.querySelector('canvas');
    window[key] = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  }, key);
}
async function delta(page, key) {
  await waitRender(page);
  return page.evaluate(key => {
    const canvas = document.querySelector('canvas');
    const current = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let maximum = 0;
    for (let i = 0; i < current.length; i++) maximum = Math.max(maximum, Math.abs(current[i] - window[key][i]));
    return maximum;
  }, key);
}
async function cpuGpu(page) {
  await openDisplay(page);
  await page.waitForFunction(() => document.querySelector('[data-renderer]')?.textContent !== 'Preparing display');
  const initialMode = await page.locator('[data-renderer]').textContent();
  assert.equal(initialMode, 'WebGL2', 'This parity run requires WebGL2; fallback runs are separate');
  await capture(page, '__gpu');
  await page.getByLabel('Rendering mode', { exact: true }).selectOption('cpu');
  await page.waitForFunction(() => document.querySelector('[data-renderer]')?.textContent?.startsWith('CPU'));
  const difference = await delta(page, '__gpu');
  assert(difference <= 1, `CPU/GPU maximum byte difference ${difference}`);
  return difference;
}

// Transpile the actual renderer into isolated browser modules for a controlled,
// explicitly synthetic ramp. The app's bundled path is tested with real data.
const { browserDisplayModules } = await import('./browser-display-modules.mjs');
const modules = await browserDisplayModules();
async function rampCheck(page) {
  await page.route('**/__acceptance/*.js', route => route.fulfill({
    contentType: 'text/javascript', body: modules[new URL(route.request().url()).pathname.split('/').at(-1)],
  }));
  return page.evaluate(async () => {
    const { DisplayRenderer } = await import('/__acceptance/displayRenderer.js');
    const { renderPixels } = await import('/__acceptance/display.js');
    const raster = { width: 64, height: 8, values: new Float32Array(512), valid: new Uint8Array(512) };
    for (let i = 0; i < 512; i++) { raster.values[i] = (i - 32) / 400; raster.valid[i] = i % 9 ? 1 : 0; }
    const renderer = new DisplayRenderer(() => {});
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 8;
    const context = canvas.getContext('2d');
    const results = [];
    try {
      for (const curve of ['linear', 'asinh']) for (const mask of ['quiet', 'hatch']) {
        const options = { low: 0, high: 1, a: .3, gamma: 1.35, curve, mask };
        const result = await renderer.render(raster, options);
        if (renderer.mode !== 'WebGL2') throw Error('Ramp did not use WebGL2');
        context.drawImage(result, 0, 0);
        const gpu = context.getImageData(0, 0, 64, 8).data, cpu = renderPixels(raster, options);
        let difference = 0;
        for (let i = 0; i < gpu.length; i++) difference = Math.max(difference, Math.abs(gpu[i] - cpu[i]));
        if (difference > 1) throw Error(`Ramp CPU/GPU difference ${difference}`);
        // Check independent analytic values too, including mask and clipping.
        for (let i = 0; i < 512; i++) {
          let expected;
          if (!raster.valid[i]) expected = mask === 'hatch' && ((i % 64) + Math.floor(i / 64)) % 8 < 2 ? [70, 82, 99] : [39, 49, 64];
          else {
            let value = Math.max(0, Math.min(1, raster.values[i]));
            if (curve === 'asinh') value = Math.asinh(value / .3) / Math.asinh(1 / .3);
            const byte = Math.round(255 * value ** (1 / 1.35)); expected = [byte, byte, byte];
          }
          if (expected.some((value, channel) => Math.abs(value - gpu[4 * i + channel]) > 1) || gpu[4 * i + 3] !== 255) throw Error('Analytic ramp mismatch');
        }
        results.push({ curve, mask, difference });
      }
    } finally { renderer.dispose(); }
    return results;
  });
}

for (const engine of [chromium, firefox]) {
  const browser = await engine.launch({ headless: true,
    ...(engine === chromium && process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
  });
  const result = { browser: engine.name(), version: browser.version() };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await page.addInitScript(() => {
      window.__glContexts = [];
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const value = original.apply(this, args);
        if (args[0] === 'webgl2' && value) window.__glContexts.push(value);
        return value;
      };
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.skip-link').evaluate(element => element === document.activeElement), true);
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    for (const target of presets) {
      await page.getByRole('button', { name: target.label, exact: false }).click();
      await page.waitForFunction(expected => document.querySelector('#ra').value !== '' && Number(document.querySelector('#ra').value) === expected, target.ra_deg);
      assert.equal(Number(await page.locator('#ra').inputValue()), target.ra_deg);
      assert.equal(Number(await page.locator('#dec').inputValue()), target.dec_deg);
    }
    result.presets = 5;
    await load(page);
    assert.equal(await button(page, 'Pause observations').count(), 0, 'No automatic animation');
    result.primaryCpuGpuDifference = await cpuGpu(page);
    await page.getByLabel('No-data style', { exact: true }).selectOption('hatch');
    await page.getByLabel('Gamma', { exact: true }).fill('1.5');
    await page.getByLabel('Display stretch', { exact: true }).selectOption('linear');
    for (let i = 0; i < 8; i++) {
      await page.getByLabel('Gamma', { exact: true }).fill(i % 2 ? '1.2' : '1.8');
      await date(page).fill(i % 2 ? '1000' : '0');
    }
    await waitRender(page);
    assert.equal(await page.getByLabel('Gamma', { exact: true }).inputValue(), '1.2');
    assert.equal(await page.locator('canvas').getAttribute('aria-label'), `Observation ${primary.frames.at(-1).observation_id}`);
    await button(page, 'ORIGINAL / RESET').click();
    assert.equal(await page.getByLabel('Gamma', { exact: true }).inputValue(), '1');
    assert.equal(await page.getByLabel('Asinh softness', { exact: true }).inputValue(), '0.1');
    await button(page, 'QUIET PRESET').click();
    await page.getByLabel('Rendering mode', { exact: true }).selectOption('auto');
    await page.waitForFunction(() => document.querySelector('[data-renderer]')?.textContent === 'WebGL2');
    await page.evaluate(() => window.__glContexts.findLast(gl => !gl.isContextLost()).getExtension('WEBGL_lose_context').loseContext());
    await page.waitForFunction(() => document.querySelector('[data-renderer]')?.textContent?.startsWith('CPU'));
    await waitRender(page); result.contextLossRecovery = true;

    await button(page, 'EARLIEST').count().then(async count => {
      if (count) await button(page, 'EARLIEST').click();
      else await page.getByRole('button', { name: /^EARLIEST/ }).click();
    });
    const firstDate = await date(page).getAttribute('aria-valuetext');
    await date(page).focus(); await page.keyboard.press('End');
    assert.notEqual(await date(page).getAttribute('aria-valuetext'), firstDate);
    await page.keyboard.press('Home');
    const hold = button(page, 'HOLD FOR B');
    await hold.focus(); await page.keyboard.down('Space');
    assert.notEqual(await date(page).getAttribute('aria-valuetext'), firstDate);
    await page.keyboard.up('Space');
    assert.equal(await date(page).getAttribute('aria-valuetext'), firstDate);
    await hold.hover(); await page.mouse.down();
    await hold.dispatchEvent('pointercancel', { pointerId: 1 }); await page.mouse.up();
    assert.equal(await date(page).getAttribute('aria-valuetext'), firstDate);
    await hold.focus(); await page.keyboard.down('Space');
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.keyboard.up('Space');
    assert.equal(await date(page).getAttribute('aria-valuetext'), firstDate);
    await button(page, 'BLINK A/B').click();
    await page.waitForFunction(first => document.querySelector('#observation-index').getAttribute('aria-valuetext') !== first, firstDate);
    await button(page, 'STOP BLINK').click();
    result.holdCancelBlurAndBlink = true;

    await button(page, 'PAN').click(); await button(page, 'Zoom in').click();
    const field = page.getByRole('group', { name: 'Observation canvas', exact: true });
    await field.focus(); await page.keyboard.press('ArrowRight');
    await button(page, 'MARK').click(); await waitRender(page); await field.scrollIntoViewIfNeeded();
    const canvasBox = await page.locator('canvas').boundingBox();
    const x = Math.floor(primary.grid.width_px / 2), y = Math.floor(primary.grid.height_px / 2);
    await page.mouse.click(canvasBox.x + (x + .5) / primary.grid.width_px * canvasBox.width,
      canvasBox.y + (y + .5) / primary.grid.height_px * canvasBox.height);
    assert.match(await page.locator('#explorer').innerText(), new RegExp(`Grid pixel X ${x}, Y ${y} on observation`));
    await field.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
    assert.match(await page.locator('#explorer').innerText(), new RegExp(`Grid pixel X ${x + 1}, Y ${y} on observation`));
    await page.getByLabel('Observation note', { exact: true }).fill('Acceptance note: investigate, not a discovery.');
    await button(page, 'SAVE CANDIDATE NOTE').click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('khonsu.candidates.v2')));
    assert.equal(stored.version, 2); assert.equal(stored.candidates.length, 1);
    assert.equal(stored.candidates[0].selection.x, x + 1); assert.equal(stored.candidates[0].selection.y, y);
    assert.equal(stored.candidates[0].selection.coordinateSpace, 'natural-raster');
    assert.equal(stored.candidates[0].sky.frame, 'ICRS'); assert.equal(stored.candidates[0].sky.unit, 'deg');
    assert.equal(stored.sequences[primary.sequence_id].frames.length, primary.frames.length);
    await button(page, 'FIT / RESET').click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('canvas')).transform === 'matrix(1, 0, 0, 1, 0, 0)');
    assert.equal(await page.locator('canvas').evaluate(element => getComputedStyle(element).transform), 'matrix(1, 0, 0, 1, 0, 0)');
    await button(page, 'EXPAND').click(); await field.focus(); await page.keyboard.press('Escape');
    await button(page, 'EXPAND').waitFor();
    result.transformedMarksAndLocalNotes = true;

    await button(page, 'PAN').click(); await field.hover(); await page.mouse.wheel(0, -160);
    await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('canvas')).transform).a > 1);
    await button(page, 'FIT / RESET').click(); result.wheelZoom = true;
    if (engine === chromium) {
      const cdp = await page.context().newCDPSession(page);
      await field.scrollIntoViewIfNeeded(); const touchBox = await field.boundingBox();
      const cx = touchBox.x + touchBox.width / 2, cy = touchBox.y + touchBox.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 40, y: cy, id: 1 }, { x: cx + 40, y: cy, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 80, y: cy, id: 1 }, { x: cx + 80, y: cy, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('canvas')).transform).a > 1.5);
      await cdp.detach(); await button(page, 'FIT / RESET').click(); result.chromiumTouchPinch = true;
    }

    // Real pointer drag rewinds to the earliest actual observation.
    await button(page, 'REWIND').click(); await date(page).fill('1000'); await field.scrollIntoViewIfNeeded();
    const box = await field.boundingBox();
    // Cross the first epoch's midpoint decisively, including rounded pointer coordinates.
    await page.mouse.move(box.x + box.width * .98, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x, box.y + box.height / 2, { steps: 6 }); await page.mouse.up();
    assert.equal(await date(page).getAttribute('aria-valuetext'), firstDate);
    result.rewindDrag = true;
    await load(page, backup); result.backupCpuGpuDifference = await cpuGpu(page);
    assert.equal(await page.getByLabel('Comparison B', { exact: true }).inputValue(), '1');
    assert.equal(await page.locator('canvas').getAttribute('aria-label'), `Observation ${backup.frames[0].observation_id}`);
    await date(page).focus(); await page.keyboard.press('End'); await waitRender(page);
    assert.equal(await page.locator('canvas').getAttribute('aria-label'), `Observation ${backup.frames[1].observation_id}`);

    assert.equal(await page.locator('iframe').count(), 0);
    const beforeMission = await date(page).getAttribute('aria-valuetext');
    await button(page, 'THE MISSION').click();
    assert.equal(await page.locator('iframe').getAttribute('src'), 'https://eyes.nasa.gov/apps/solar-system/#/sc_spherex');
    assert.equal(await page.getByRole('link', { name: 'open NASA Eyes in a new tab' }).getAttribute('target'), '_blank');
    await button(page, 'CLOSE MISSION').click();
    assert.equal(await page.locator('iframe').count(), 0);
    assert.equal(await date(page).getAttribute('aria-valuetext'), beforeMission);
    result.missionDateIsolation = true;
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `${output}/${engine.name()}-backup-mobile.png`, fullPage: true });
    result.mobileWidth = 390;
    result.syntheticRamp = await rampCheck(page);
    await page.reload({ waitUntil: 'domcontentloaded' }); await load(page);
    await page.getByText('Acceptance note: investigate, not a discovery.', { exact: true }).waitFor();
    result.notesSurviveReload = true;
    assert.deepEqual(errors, []);
    await page.close();

    const fallback = await browser.newPage();
    await fallback.addInitScript(() => {
      window.Worker = undefined;
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        return args[0] === 'webgl2' ? null : original.apply(this, args);
      };
    });
    await fallback.goto(base, { waitUntil: 'domcontentloaded' }); await load(fallback);
    assert.equal(await fallback.locator('[data-renderer]').textContent(), 'CPU canvas');
    result.noGpuNoWorker = 'CPU canvas'; await fallback.close();

    const corrupt = await browser.newPage();
    await corrupt.route('**/*.bin', async route => {
      const response = await route.fetch(); const bytes = await response.body(); bytes[0] ^= 1;
      await route.fulfill({ response, body: bytes });
    });
    await corrupt.goto(base, { waitUntil: 'domcontentloaded' }); await load(corrupt); await openDisplay(corrupt);
    assert.equal(await corrupt.locator('[data-renderer]').textContent(), 'Original PNG');
    assert.equal(await corrupt.getByLabel('Gamma', { exact: true }).isDisabled(), true);
    assert.match(await corrupt.locator('#explorer').innerText(), /could not be verified/);
    result.badChecksumPngRecovery = true; await corrupt.close();

    const failed = await browser.newPage();
    await failed.route('**/frame-*.png', route => route.abort());
    await failed.goto(base, { waitUntil: 'domcontentloaded' });
    await button(failed, 'LOAD CACHED REAL EXAMPLE').click();
    await button(failed, 'RETRY IMAGE').waitFor();
    assert.equal(await failed.locator('canvas').isVisible(), false);
    await failed.unroute('**/frame-*.png'); await button(failed, 'RETRY IMAGE').click(); await waitRender(failed);
    result.failedImageRetry = true; await failed.close();

    // Simulated transport failures exercise the integrated recovery UI. These
    // responses never supply synthetic observations as real scientific data.
    const recovery = await browser.newPage();
    let calls = 0;
    await recovery.route('**/v1/sequences', route => {
      calls++;
      return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({
        error: { code: 'INSUFFICIENT_COMPARABLE_EPOCHS', message: 'Synthetic acceptance scenario: insufficient epochs.', details: ['No sequence was created.'] },
      }) });
    });
    await recovery.goto(base, { waitUntil: 'domcontentloaded' });
    await recovery.locator('#ra').fill('360'); await recovery.locator('#dec').fill('0');
    await button(recovery, 'EXPLORE THE SKY').click(); await recovery.locator('form [role="alert"]').waitFor();
    assert.equal(calls, 0, 'Invalid coordinates must not start a job');
    await recovery.locator('#ra').fill('270'); await button(recovery, 'EXPLORE THE SKY').click();
    await recovery.getByText('NOT ENOUGH COMPARABLE OBSERVATIONS', { exact: true }).waitFor();
    assert.equal(await recovery.locator('canvas').count(), 0);
    await button(recovery, 'EDIT SEARCH').click();
    assert.equal(await recovery.locator('#ra').evaluate(element => element === document.activeElement), true);
    await button(recovery, 'LOAD CACHED REAL EXAMPLE').first().click(); await waitRender(recovery);
    assert.equal(await recovery.locator('canvas').getAttribute('aria-label'), `Observation ${primary.frames[0].observation_id}`);
    result.invalidInputAndCoverageRecovery = true;
    await recovery.unroute('**/v1/sequences');
    await recovery.route('**/v1/sequences', route => route.abort());
    await button(recovery, 'EXPLORE THE SKY').click();
    await button(recovery, 'RETRY SEARCH').waitFor();
    assert.equal(await recovery.locator('canvas').count(), 0);
    result.backendUnavailableHonestState = true; await recovery.close();
    report.browsers.push(result); console.log(`${engine.name()}: combined observatory acceptance passed`);
  } finally { await browser.close(); }
}
await writeFile(`${output}/acceptance-report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Evidence saved to ${output}`);
