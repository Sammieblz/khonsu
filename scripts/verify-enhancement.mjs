// Authentic-frame display parity, experimental-control acceptance and bounded timing.
// Use the same static export, API and external Playwright setup as verify-observatory.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, unlink, rmdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { browserDisplayModules } from './browser-display-modules.mjs';
const require = createRequire(import.meta.url);
const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.KHONSU_TEST_URL || 'http://localhost:3001';
const api = process.env.KHONSU_TEST_API || 'http://localhost:8000';
const output = resolve(process.env.KHONSU_TEST_OUTPUT || '.cache/enhancement/browser');
await mkdir(output, { recursive: true });
const examples = await (await fetch(`${api}/v1/examples`)).json();
const primary = examples.find(item => item.sequence_id === 'real-wise-0855');
const modules = await browserDisplayModules();
// Serve actual files: Firefox worker module imports bypass Playwright routing.
// This directory is inside the ignored static export and removed after success.
const moduleDirectory = new URL('../apps/web/out/__enhancement/', import.meta.url);
await mkdir(moduleDirectory, { recursive: true });
for (const [name, source] of Object.entries(modules)) await writeFile(new URL(name, moduleDirectory), source);
const report = {
  testedAt: new Date().toISOString(), baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  workingTree: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  timingScope: '12 warm render + 2D copy + synchronous readback samples after 2 warmups; excludes download and FITS processing. Headless browser on this machine, not a general performance guarantee.',
  browsers: [],
};
report.sourceHashes = {};
for (const path of ['apps/web/src/features/viewer/display.ts', 'apps/web/src/features/viewer/displayRenderer.ts',
  'apps/web/src/features/viewer/display.worker.ts', 'apps/web/src/features/viewer/SkyViewer.tsx',
  'apps/web/src/features/viewer/viewer.module.css', 'scripts/verify-enhancement.mjs']) {
  report.sourceHashes[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
}
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('canvas')?.style.visibility === 'visible');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function load(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await button(page, 'LOAD CACHED REAL EXAMPLE').click(); await ready(page);
}
async function capture(page, name) {
  await ready(page);
  await page.evaluate(name => {
    const canvas = document.querySelector('canvas');
    window[name] = Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
  }, name);
}
async function difference(page, name) {
  await ready(page);
  return page.evaluate(name => {
    const canvas = document.querySelector('canvas'), pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    if (pixels.length !== window[name].length) throw Error('Changed dimensions during comparison');
    let maximum = 0;
    for (let i = 0; i < pixels.length; i++) maximum = Math.max(maximum, Math.abs(pixels[i] - window[name][i]));
    return maximum;
  }, name);
}

for (const engine of [chromium, firefox]) {
  const browser = await engine.launch({ headless: true,
    ...(engine === chromium && process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
  });
  const result = { browser: engine.name(), version: browser.version() };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await load(page);
    assert.equal(await button(page, 'SMOOTH').getAttribute('aria-pressed'), 'true');
    assert.equal(await button(page, 'DETAIL EXPERIMENT').getAttribute('aria-pressed'), 'false');
    const originalUtc = await page.locator('#observation-index').getAttribute('aria-valuetext');
    await capture(page, '__original');
    const geometry = await page.locator('canvas').evaluate(canvas => ({ width: canvas.width, height: canvas.height, cssWidth: canvas.getBoundingClientRect().width, dpr: devicePixelRatio }));
    assert(Math.abs(geometry.width - geometry.cssWidth * geometry.dpr) <= 2);
    result.viewport = geometry;
    await button(page, 'PIXELS').click();
    assert(await difference(page, '__original') > 0);
    await page.getByRole('region', { name: 'Sky image viewer' }).screenshot({ path: `${output}/${engine.name()}-pixels.png` });
    await button(page, 'SMOOTH').click(); assert.equal(await difference(page, '__original'), 0);
    await page.getByRole('region', { name: 'Sky image viewer' }).screenshot({ path: `${output}/${engine.name()}-smooth.png` });
    await button(page, 'DETAIL EXPERIMENT').click(); assert(await difference(page, '__original') > 0);
    await capture(page, '__detail');
    await page.getByRole('region', { name: 'Sky image viewer' }).screenshot({ path: `${output}/${engine.name()}-detail.png` });
    const hold = button(page, 'HOLD ORIGINAL');
    await hold.focus(); await page.keyboard.down('Space');
    assert.equal(await difference(page, '__original'), 0);
    assert.equal(await page.locator('#observation-index').getAttribute('aria-valuetext'), originalUtc);
    await page.keyboard.up('Space'); assert.equal(await difference(page, '__detail'), 0);
    await hold.hover(); await page.mouse.down(); await ready(page);
    await hold.dispatchEvent('pointercancel', { pointerId: 1 }); await page.mouse.up();
    assert.equal(await difference(page, '__detail'), 0);
    await hold.focus(); await page.keyboard.down('Space');
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.keyboard.up('Space');
    assert.equal(await difference(page, '__detail'), 0);
    await button(page, 'MARK').click(); await ready(page);
    assert.equal(await page.locator('[data-detail]').getAttribute('data-detail'), 'off');
    assert.equal(await button(page, 'DETAIL EXPERIMENT').isDisabled(), true);
    await button(page, 'REWIND').click(); assert.equal(await difference(page, '__detail'), 0);
    result.sameFrameOriginalHoldCancelBlurAndMark = true;
    await page.locator('summary').filter({ hasText: 'IMAGE DISPLAY' }).click();
    await page.getByLabel('Detail amount', { exact: true }).fill('0.5');
    await page.locator('#observation-index').fill('1000'); await ready(page);
    assert.equal(await page.getByLabel('Detail amount', { exact: true }).inputValue(), '0.5');
    assert.equal(await page.locator('[data-detail]').getAttribute('data-detail'), 'on');
    await button(page, 'ORIGINAL / RESET').click(); await ready(page);
    assert.equal(await page.locator('[data-detail]').getAttribute('data-detail'), 'off');
    result.sharedSettingsAndReset = true;
    await page.getByLabel('Rendering mode', { exact: true }).selectOption('cpu'); await ready(page);
    assert.equal(await page.locator('[data-renderer]').textContent(), 'CPU worker', 'The production bundle must execute its worker');
    result.productionCpuWorker = true;
    await page.getByLabel('Rendering mode', { exact: true }).selectOption('auto'); await ready(page);
    await page.setViewportSize({ width: 390, height: 844 }); await ready(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('canvas').evaluate(element => document.activeElement?.blur());
    await page.getByRole('region', { name: 'Sky image viewer' }).screenshot({ path: `${output}/${engine.name()}-mobile.png` });
    result.mobileWidth = 390;

    result.renderers = await page.evaluate(async ({ api, examples }) => {
      const { DisplayRenderer } = await import('/__enhancement/displayRenderer.js');
      const { decodeRaster, renderPixels } = await import('/__enhancement/display.js');
      const gpu = new DisplayRenderer(() => {}), worker = new DisplayRenderer(() => {}, true);
      const canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true });
      const checks = [], timings = [];
      let firstRaster, firstOptions;
      const paint = (image, size) => {
        if (canvas.width !== size.width) canvas.width = size.width;
        if (canvas.height !== size.height) canvas.height = size.height;
        if (image instanceof ImageData) context.putImageData(image, 0, 0);
        else context.drawImage(image, 0, 0);
        const result = context.getImageData(0, 0, size.width, size.height).data;
        if (image instanceof ImageBitmap) image.close();
        return result;
      };
      const compare = (a, b) => {
        let maximum = 0;
        for (let i = 0; i < a.length; i++) maximum = Math.max(maximum, Math.abs(a[i] - b[i]));
        if (maximum > 1) throw Error(`GPU/CPU byte difference ${maximum}`);
        return maximum;
      };
      try {
        for (const example of examples.filter(item => ['real-wise-0855', 'real-epsilon-indi-b'].includes(item.sequence_id))) {
          for (const frame of example.frames) {
            const bytes = await (await fetch(`${api}${frame.raster.url}`)).arrayBuffer();
            const before = Array.from(new Uint8Array(bytes));
            const raster = decodeRaster(bytes, example.grid.width_px, example.grid.height_px);
            const options = { low: example.display.vmin, high: example.display.vmax, a: .3, gamma: 1, curve: 'asinh', mask: 'quiet' };
            if (!firstRaster) { firstRaster = raster; firstOptions = options; }
            for (const sampling of ['smooth', 'pixels']) for (const detail of [0, .35, .5]) {
              const opts = { ...options, sampling, detail }, size = { width: 331, height: 287 };
              const rendered = paint(await gpu.render(raster, opts, size), size);
              if (gpu.mode !== 'WebGL2') throw Error('This comparison requires WebGL2');
              const maximum = compare(rendered, renderPixels(raster, opts, size));
              checks.push({ observation: frame.observation_id, utc: frame.observed_start_utc, rasterSha256: frame.raster.sha256, sampling, detail, maximum });
            }
            if (before.some((value, i) => new Uint8Array(bytes)[i] !== value)) throw Error('Source buffer was mutated');
          }
        }
        // Non-square signed ramp tests orientation, clipping and mask boundaries.
        const ramp = { width: 11, height: 7, values: new Float32Array(77), valid: new Uint8Array(77) };
        for (let i = 0; i < 77; i++) { ramp.values[i] = (i - 10) / 60; ramp.valid[i] = i % 13 ? 1 : 0; }
        for (const sampling of ['smooth', 'pixels']) {
          const opts = { low: -.1, high: .9, a: .3, gamma: 1.2, curve: 'asinh', mask: 'hatch', sampling, detail: .5 };
          const size = { width: 71, height: 47 }, expected = renderPixels(ramp, opts, size);
          compare(paint(await gpu.render(ramp, opts, size), size), expected);
          compare(paint(await worker.render(ramp, opts, size), size), expected);
        }
        for (const renderer of [gpu, worker]) for (const side of [440, 880]) for (const detail of [0, .35]) {
          const size = { width: side, height: side }, samples = [];
          for (let iteration = 0; iteration < 14; iteration++) {
            // Small amount changes exercise the native detail pass, not just its cache.
            const opts = { ...firstOptions, sampling: 'smooth', detail: detail ? detail + (iteration % 2) * .05 : 0 };
            const start = performance.now(); paint(await renderer.render(firstRaster, opts, size), size);
            if (iteration >= 2) samples.push(performance.now() - start);
          }
          samples.sort((a, b) => a - b);
          timings.push({ mode: renderer.mode, side, detail, detailAmounts: detail ? [.35, .4] : [0], samples: samples.length, medianMs: (samples[5] + samples[6]) / 2, p95Ms: samples[11] });
        }
        if (worker.mode !== 'CPU worker') throw Error('Isolated module worker failed');
        return { adapter: gpu.adapter, checks, timings, signedRectangularRamp: true, workerMode: worker.mode, originalBuffersPreserved: true };
      } finally { gpu.dispose(); worker.dispose(); }
    }, { api, examples });
    assert.deepEqual(errors, []); await page.close();

    const noFloat = await browser.newPage();
    await noFloat.addInitScript(() => {
      const original = WebGL2RenderingContext.prototype.getExtension;
      WebGL2RenderingContext.prototype.getExtension = function (name) {
        return name === 'EXT_color_buffer_float' ? null : original.call(this, name);
      };
    });
    await load(noFloat); await button(noFloat, 'DETAIL EXPERIMENT').click(); await ready(noFloat);
    assert.match(await noFloat.locator('[data-renderer]').textContent(), /^CPU/);
    await button(noFloat, 'DETAIL EXPERIMENT').click(); await ready(noFloat);
    assert.equal(await noFloat.locator('[data-renderer]').textContent(), 'WebGL2');
    result.missingFloatTargetFallback = true; await noFloat.close();

    const noGpu = await browser.newPage();
    await noGpu.addInitScript(() => {
      window.Worker = undefined;
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) { return args[0] === 'webgl2' ? null : original.apply(this, args); };
    });
    await load(noGpu); await button(noGpu, 'DETAIL EXPERIMENT').click(); await ready(noGpu);
    assert.equal(await noGpu.locator('[data-renderer]').textContent(), 'CPU canvas');
    assert.equal(await noGpu.locator('[data-detail]').getAttribute('data-detail'), 'on');
    result.noGpuNoWorkerDetail = true; await noGpu.close();
    report.browsers.push(result);
    await writeFile(`${output}/enhancement-report.json`, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${engine.name()}: enhancement acceptance passed`);
  } finally { await browser.close(); }
}
await writeFile(`${output}/enhancement-report.json`, `${JSON.stringify(report, null, 2)}\n`);
for (const name of Object.keys(modules)) await unlink(new URL(name, moduleDirectory));
await rmdir(moduleDirectory);
console.log(`Evidence saved to ${output}`);
