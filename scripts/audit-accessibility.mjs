// Accessibility and layout audit of the static export (BYT-30).
//
// Checks three viewport sizes for page overflow, hidden primary actions,
// controls smaller than 44 px and axe-core WCAG 2.1 A/AA violations; checks
// animation and autoplay with and without reduced motion; and completes the
// main journey keyboard-only (load a cached example, step a frame, mark,
// write a note, save, export) while recording whether focus is visible.
//
// Needs the static export, the API serving the cached real examples, and
// Playwright plus axe-core (see docs/accessibility-acceptance.md). Uses the
// same environment variables as scripts/verify-observatory.mjs.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const axePath = process.env.AXE_CORE_PATH || require.resolve('axe-core/axe.min.js', { paths: [process.env.PLAYWRIGHT_MODULE ? resolve(process.env.PLAYWRIGHT_MODULE, '..') : process.cwd()] });
const axeSource = await readFile(axePath, 'utf8');
const base = process.env.KHONSU_TEST_URL || 'http://localhost:3001';
const output = resolve(process.env.KHONSU_TEST_OUTPUT || '.cache/accessibility');
await mkdir(output, { recursive: true });

const PRIMARY = ['LOAD CACHED REAL EXAMPLE', 'REWIND', 'PAN', 'MARK', 'NEXT', 'PREVIOUS', 'BLINK A/B', 'SAVE CANDIDATE NOTE', 'EXPORT ALL SAVED CANDIDATES'];
const button = (page, name) => page.getByRole('button', { name, exact: true });
const report = { testedAt: new Date().toISOString(), frontend: base, viewports: {}, motion: {}, keyboard: [] };

async function loadExample(page) {
  await button(page, 'LOAD CACHED REAL EXAMPLE').first().click();
  await page.locator('#search-status-title', { hasText: 'CACHED REAL EXAMPLE' }).waitFor();
  await page.waitForFunction(() => { const canvas = document.querySelector('canvas'); return !!canvas && getComputedStyle(canvas).visibility === 'visible'; });
}

async function markCenter(page, note) {
  await button(page, 'MARK').click();
  // Scroll the wider canvas center into view before clicking it.
  await page.locator('canvas').click();
  await page.getByLabel('Observation note', { exact: true }).fill(note);
  await button(page, 'SAVE CANDIDATE NOTE').click();
}

async function axe(page) {
  if (!await page.evaluate(() => !!window.axe)) await page.addScriptTag({ content: axeSource });
  return page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })
    .then(result => result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target.join(' ')) }))));
}

// Controls under 44 x 44 px. Links inside running text are excluded, as WCAG 2.5.8 allows.
const smallTargets = page => page.evaluate(() => [...document.querySelectorAll('button, a[href], select, input, textarea, summary')]
  .filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden'; })
  .filter(element => !(element.tagName === 'A' && element.closest('p, li, dd, q')))
  .filter(element => { const box = element.getBoundingClientRect(); return box.width < 44 || box.height < 44; })
  .map(element => `${(element.getAttribute('aria-label') || element.textContent || element.tagName).trim().slice(0, 40)} ${Math.round(element.getBoundingClientRect().width)}x${Math.round(element.getBoundingClientRect().height)}`));

const focused = page => page.evaluate(() => {
  const element = document.activeElement;
  if (!element || element === document.body) return { label: 'body', visible: false };
  const style = getComputedStyle(element);
  return {
    label: (element.getAttribute('aria-label') || element.textContent || element.id || element.tagName).trim().replace(/\s+/g, ' ').slice(0, 60),
    tag: element.tagName.toLowerCase(),
    visible: (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || (style.boxShadow && style.boxShadow !== 'none'),
  };
});

async function tabTo(page, test, { limit = 250, reverse = false } = {}) {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press(reverse ? 'Shift+Tab' : 'Tab');
    const info = await focused(page);
    if (test(info)) return info;
  }
  throw new Error('Keyboard focus never reached the expected control.');
}

const browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {});
try {
  for (const [name, width, height] of [['mobile', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(base);
    const entryViolations = await axe(page);
    await loadExample(page);
    await markCenter(page, 'Accessibility audit mark');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const missing = await page.evaluate(names => names.filter(name => {
      const element = [...document.querySelectorAll('button')].find(item => item.textContent.trim().toUpperCase().startsWith(name));
      const box = element?.getBoundingClientRect();
      return !box || box.width === 0 || box.right > document.documentElement.clientWidth + 1;
    }), PRIMARY);
    const small = await smallTargets(page);
    const loadedViolations = await axe(page);
    report.viewports[name] = { width, height, overflow, missing, small, entryViolations, loadedViolations };
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    assert.equal(overflow, 0, `${name}: page scrolls sideways`);
    assert.deepEqual(missing, [], `${name}: primary actions hidden or off-screen`);
    assert.deepEqual(small, [], `${name}: controls under 44 px`);
    assert.deepEqual([...entryViolations, ...loadedViolations], [], `${name}: axe violations`);
    console.log(`${name}: no overflow, all primary actions visible, no target under 44 px, no axe violations`);
    await page.close();
  }

  for (const reducedMotion of ['no-preference', 'reduce']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion });
    await page.goto(base);
    const onEntry = await page.evaluate(() => document.getAnimations().length);
    await loadExample(page);
    const date = () => page.locator('[class*="activeDate"]').textContent();
    const first = await date();
    await page.waitForTimeout(2000);
    const autoplay = (await date()) !== first;
    const running = await page.evaluate(() => document.getAnimations().filter(item => item.playState === 'running').length);
    report.motion[reducedMotion] = { onEntry, running, autoplay };
    assert.equal(autoplay, false, `${reducedMotion}: observations changed without a request`);
    if (reducedMotion === 'reduce') assert.equal(running, 0, 'reduced motion: animations still running');
    console.log(`motion ${reducedMotion}: ${onEntry} animations on entry, ${running} running after load, no autoplay`);
    await page.close();
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(base);
  // Loading the catalog temporarily disables this control; tabbing must start
  // once it is available, without forcing focus or bypassing keyboard navigation.
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(
    button => button.textContent.trim() === 'LOAD CACHED REAL EXAMPLE' && !button.disabled,
  ));
  const step = async (name, info) => {
    report.keyboard.push({ step: name, ...info });
    assert.ok(info.visible, `${name}: focus is not visible`);
  };
  await step('load cached example', await tabTo(page, info => info.label === 'LOAD CACHED REAL EXAMPLE'));
  await page.keyboard.press('Enter');
  await page.locator('#search-status-title', { hasText: 'CACHED REAL EXAMPLE' }).waitFor();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('canvas')).visibility === 'visible');
  const afterLoad = await focused(page);
  report.keyboard.push({ step: 'focus after loading', ...afterLoad });
  assert.notEqual(afterLoad.label, 'body', 'focus was lost to the page body after loading');
  await step('observation canvas', await tabTo(page, info => info.label === 'Observation canvas'));
  await page.keyboard.press('ArrowRight');
  await page.getByText(/^2 \/ \d+ OBSERVATIONS$/).waitFor();
  // The epoch label changes before its verified raster arrives. Wait for the
  // actual second observation before attempting to mark it with the keyboard.
  await page.waitForFunction(() => getComputedStyle(document.querySelector('canvas')).visibility === 'visible');
  await step('Mark tool', await tabTo(page, info => info.label === 'MARK', { limit: 30, reverse: true }));
  await page.keyboard.press('Enter');
  await step('canvas in Mark mode', await tabTo(page, info => info.label === 'Observation canvas'));
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await page.getByText(/^Grid pixel X \d+, Y \d+ on observation 2/).waitFor();
  await step('note field', await tabTo(page, info => info.tag === 'textarea'));
  await page.keyboard.type('Keyboard-only candidate');
  await step('save note', await tabTo(page, info => info.label.includes('SAVE CANDIDATE NOTE'), { limit: 10 }));
  await page.keyboard.press('Enter');
  await step('export candidate', await tabTo(page, info => info.label === 'Export candidate 01 as an evidence file', { limit: 30 }));
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  const evidence = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(evidence.format, 'khonsu-evidence');
  assert.equal(evidence.candidates[0].note, 'Keyboard-only candidate');
  report.keyboard.push({ step: 'evidence downloaded', file: download.suggestedFilename() });
  console.log(`keyboard: loaded, stepped, marked, saved and exported ${download.suggestedFilename()} with visible focus at every step`);
  await context.close();
} finally {
  await browser.close();
}
await writeFile(`${output}/accessibility-report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Report saved to ${output}`);
