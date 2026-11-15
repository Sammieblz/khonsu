// Real-image parity, honest data labels and controls for the static research lab.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ts = createRequire(new URL('../apps/web/package.json', import.meta.url))('typescript');
const base = process.env.KHONSU_TEST_URL || 'http://localhost:3001';
const output = new URL('../.cache/resolution/browser/', import.meta.url);
await mkdir(output, { recursive: true });
const module = ts.transpileModule(await readFile(new URL('../apps/web/src/features/viewer/display.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(module).toString('base64')}`;
const fixture = JSON.parse(await readFile(new URL('../fixtures/real/real-wise-0855/manifest.json', import.meta.url), 'utf8'));
const raster = await readFile(new URL('../fixtures/real/real-wise-0855/frame-0001.bin', import.meta.url));
const report = { testedAt: new Date().toISOString(), baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), browsers: [], sourceHashes: {} };
for (const path of ['apps/web/src/features/viewer/ResolutionLab.tsx', 'apps/web/src/features/viewer/resolutionLab.module.css', 'apps/web/public/experiments/resolution/manifest.json', 'scripts/verify-resolution-lab.mjs']) {
  report.sourceHashes[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
}
const button = (page, name) => page.getByRole('button', { name, exact: true });
const region = page => page.getByRole('region', { name: 'Comparison image; scroll to pan when zoomed', exact: true });
async function ready(page) { await region(page).getAttribute('data-ready'); await page.waitForFunction(() => document.querySelector('[data-ready]')?.dataset.ready === 'true'); }
async function visibleSource(page) { return page.locator('img[aria-hidden="false"]').getAttribute('src'); }

for (const engine of [chromium, firefox]) {
  const browser = await engine.launch({ headless: true, ...(engine === chromium && process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`${base}/resolution-lab/`, { waitUntil: 'domcontentloaded' }); await ready(page);
    const manifest = await (await page.request.get(`${base}/experiments/resolution/manifest.json`)).json();
    assert.equal(manifest.fields[0].fov_arcmin, 20);
    assert.equal(await region(page).getAttribute('data-kind'), 'real');
    assert(await button(page, 'RECONSTRUCTION').isDisabled());
    await page.screenshot({ path: new URL(`${engine.name()}-desktop.png`, output).pathname.replace(/^\/(.:)/, '$1'), fullPage: true });
    const originalMode = await region(page).getAttribute('data-mode');
    const hold = button(page, 'HOLD ORIGINAL');
    await hold.focus(); await page.keyboard.down('Space');
    assert.equal(await region(page).getAttribute('data-mode'), 'current');
    assert.equal(await region(page).getAttribute('data-shoulder'), 'false');
    assert((await visibleSource(page)).endsWith('-current-standard.png'));
    await page.keyboard.up('Space');
    assert.equal(await region(page).getAttribute('data-mode'), originalMode);
    const holdBox = await hold.boundingBox();
    await page.mouse.move(holdBox.x+holdBox.width/2, holdBox.y+holdBox.height/2); await page.mouse.down();
    await hold.dispatchEvent('pointercancel', { pointerId: 1 });
    await page.mouse.up();
    assert.equal(await hold.getAttribute('aria-pressed'), 'false');
    await hold.focus(); await page.keyboard.down('Enter'); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.keyboard.up('Enter'); assert.equal(await hold.getAttribute('aria-pressed'), 'false');
    await button(page, 'Zoom in').click(); await button(page, 'Zoom in').click();
    await region(page).evaluate(element => { element.scrollLeft = 70; element.scrollTop = 90; });
    const position = await region(page).evaluate(element => [element.scrollLeft, element.scrollTop]);
    await hold.focus(); await page.keyboard.down('Space'); await page.keyboard.up('Space');
    assert.deepEqual(await region(page).evaluate(element => [element.scrollLeft, element.scrollTop]), position);
    await button(page, 'FIT / RESET').click();
    assert.deepEqual(await region(page).evaluate(element => [element.scrollLeft, element.scrollTop]), [0, 0]);
    const closeup = manifest.fields.findIndex(field => field.id === 'real-wise-0855');
    await page.getByLabel('CHOOSE THE FIELD', { exact: true }).selectOption(String(closeup)); await ready(page);
    await button(page, 'CURRENT').click(); await button(page, 'PRESERVE BRIGHT CORES').click(); await ready(page);
    const difference = await page.evaluate(async ({ moduleUrl, base64, fixture }) => {
      const { decodeRaster, renderPixels } = await import(moduleUrl);
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const raster = decodeRaster(bytes.buffer, fixture.grid.width_px, fixture.grid.height_px);
      const expected = renderPixels(raster, { low: fixture.display.vmin, high: fixture.display.vmax, a: .3, gamma: 1, curve: 'asinh', mask: 'quiet', sampling: 'smooth', detail: 0 }, { width: 768, height: 768 });
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 768;
      const image = document.querySelector('img[aria-hidden="false"]');
      canvas.getContext('2d').drawImage(image, 0, 0);
      const actual = canvas.getContext('2d').getImageData(0, 0, 768, 768).data;
      let max = 0; for (let i = 0; i < actual.length; i++) max = Math.max(max, Math.abs(actual[i]-expected[i]));
      return max;
    }, { moduleUrl, base64: raster.toString('base64'), fixture });
    assert(difference <= 1, `Current view differs from actual production CPU display: ${difference}`);
    await button(page, 'NATIVE RESAMPLE').click(); await button(page, 'PRESERVE BRIGHT CORES').click(); await ready(page);
    assert((await visibleSource(page)).endsWith('-native-shoulder.png'));
    const synthetic = manifest.fields.findIndex(field => field.kind === 'synthetic');
    await page.getByLabel('CHOOSE THE FIELD', { exact: true }).selectOption(String(synthetic)); await ready(page);
    assert.equal(await region(page).getAttribute('data-kind'), 'synthetic');
    await page.getByText('NO REAL OBSERVATION DATE', { exact: true }).waitFor();
    await button(page, 'RECONSTRUCTION').click(); await ready(page);
    assert((await visibleSource(page)).includes('synthetic-stack'));
    await button(page, 'KNOWN TRUTH').click(); await ready(page);
    assert((await visibleSource(page)).includes('synthetic-truth'));
    await button(page, 'COVERAGE').click(); await ready(page);
    assert((await visibleSource(page)).includes('synthetic-coverage'));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    for (const control of await page.getByRole('button').all()) {
      const box = await control.boundingBox(); assert(box.height >= 44);
    }
    await button(page, 'RECONSTRUCTION').click(); await ready(page);
    await page.evaluate(() => document.activeElement?.blur());
    await page.screenshot({ path: new URL(`${engine.name()}-mobile.png`, output).pathname.replace(/^\/(.:)/, '$1'), fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();

    const unavailable = await browser.newPage();
    await unavailable.route('**/experiments/resolution/manifest.json', route => route.fulfill({ status: 503, body: '' }));
    await unavailable.goto(`${base}/resolution-lab/`);
    await unavailable.getByRole('alert').filter({ hasText: 'The comparison report could not be loaded.' }).waitFor();
    await unavailable.unroute('**/experiments/resolution/manifest.json');
    await button(unavailable, 'RETRY COMPARISON').click(); await ready(unavailable); await unavailable.close();
    const imageFailure = await browser.newPage();
    await imageFailure.route('**/*native-shoulder.png', route => route.abort());
    await imageFailure.goto(`${base}/resolution-lab/`);
    await imageFailure.getByText('This comparison image could not be loaded. Refresh to retry.', { exact: true }).waitFor();
    assert.equal(await imageFailure.locator('img[aria-hidden="false"]').isVisible(), false);
    await button(imageFailure, 'CURRENT').click(); await ready(imageFailure); await imageFailure.close();
    report.browsers.push({ browser: engine.name(), version: browser.version(), currentDisplayMaxByteDifference: difference,
      realAndSyntheticLabels: true, originalHoldCancelBlur: true, zoomPanReset: true, coverageAndTruth: true,
      narrowLayoutAnd44pxButtons: true, reportRetryAndImageFailure: true });
    await writeFile(new URL('report.json', output), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${engine.name()}: resolution lab passed`);
  } finally { await browser.close(); }
}
