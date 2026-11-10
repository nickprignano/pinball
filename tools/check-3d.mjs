// Browser check for the 3D view (needs Playwright; run it before each pull request that touches
// the 3D view). Serves the repo, then for each table and each 3D quality tier: loads it, launches
// a ball, plays a few seconds with scripted flips, and fails on any page error, a blank frame or a
// fall back to the flat view. The last run per table drains the ball and steps quality down from
// high to low, as Auto does on a slow phone. Saves phone and desktop screenshots to the folder
// given as the first argument (default: a temp folder).
// Usage: node tools/check-3d.mjs [screenshot-folder] [table-id]

import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';

// Through require, so a globally installed Playwright (NODE_PATH) is found too.
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const root = join(new URL('.', import.meta.url).pathname, '..');
const outDir = process.argv[2] ?? join(tmpdir(), 'pinball-3d');
mkdirSync(outDir, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
    const body = readFileSync(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;

const tables = JSON.parse(readFileSync(join(root, 'tables/index.json'), 'utf8')).filter((t) => !process.argv[3] || t.id === process.argv[3]);
// Software WebGL in headless Chromium; slow, but it draws the same thing.
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const failures = [];

for (const table of tables) {
  for (const [label, options, tier, start = tier] of [
    ['phone', { ...devices['iPhone 13'] }, 'high'],
    ['desktop', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, 'high'],
    ['phone-low', { ...devices['iPhone 13'] }, 'low'],
    ['phone-drain-step-down', { ...devices['iPhone 13'] }, 'low', 'high'],
  ]) {
    const name = `${table.id}-${label}`;
    const page = await browser.newPage(options);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // The aborted theme requests log net::ERR_FAILED; anything else is a real error.
    page.on('console', (m) => m.type() === 'error' && !m.text().includes('net::ERR_FAILED') && errors.push(m.text()));
    // The theme files come from a CDN; the game works without them, so don't wait on them.
    await page.route(/cdn\.jsdelivr\.net/, (route) => route.abort());
    await page.goto(`${base}/?table=${table.id}&gfx=${start}`);
    await page.waitForFunction(() => globalThis.pinball?.view?.tableId, null, { timeout: 30000 }).catch(() => {});
    const started = await page.evaluate(() => Boolean(globalThis.pinball?.view?.tableId));
    if (started) {
      // Launch, then flip whenever a ball comes down near the flippers.
      await page.evaluate(() => {
        const { field } = globalThis.pinball;
        field.launchBallIfNeeded();
        setInterval(() => {
          for (const b of field.balls) {
            const p = b.getPosition();
            const near = p.y < 4.2 && b.getLinearVelocity().y < 0;
            if (p.x < field.width / 2) field.setLeftFlippersEngaged(near);
            else field.setRightFlippersEngaged(near);
          }
          if (!field.balls.length) field.launchBallIfNeeded();
        }, 30);
      });
      await page.waitForTimeout(6000);
      if (start !== tier) {
        // Lose the ball (no ball saver), then switch quality while no ball is in play.
        await page.evaluate((next) => {
          const { field } = globalThis.pinball;
          field.usedMercyBall = true;
          for (const ball of [...field.balls]) field.removeBall(ball);
          const select = document.getElementById('gfx');
          select.value = next;
          select.dispatchEvent(new Event('change'));
        }, tier);
        await page.waitForTimeout(5000);
      }
    }
    const state = await page.evaluate(() => ({ tier: globalThis.pinball?.tier, threeOn: document.body.classList.contains('three'), lost: globalThis.pinball?.view?.lost }));
    // A blank frame is one colour all over: sample the 3D canvas.
    const colours = await page.evaluate(() => {
      const { view } = globalThis.pinball;
      if (!view) return 0;
      // Read the canvas right after drawing a frame, before the browser clears it.
      view.frame(performance.now(), 16);
      const canvas = view.canvas;
      const copy = document.createElement('canvas');
      copy.width = 64;
      copy.height = 64;
      const g = copy.getContext('2d');
      g.drawImage(canvas, 0, 0, 64, 64);
      const data = g.getImageData(0, 0, 64, 64).data;
      const seen = new Set();
      for (let i = 0; i < data.length; i += 4) seen.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
      return seen.size;
    });
    await page.screenshot({ path: join(outDir, `${name}.png`) });
    const problems = [];
    if (!started) problems.push('3D view never started');
    if (state.tier !== tier || !state.threeOn || state.lost) problems.push(`fell back (tier ${state.tier}${state.lost ? ', context marked lost' : ''})`);
    if (colours < 20) problems.push(`blank frame (${colours} colours)`);
    problems.push(...errors);
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${name}${problems.length ? `: ${problems.join('; ')}` : ''}`);
    if (problems.length) failures.push(name);
    await page.close();
  }
}

await browser.close();
server.close();
console.log(`screenshots in ${outDir}`);
if (failures.length) process.exit(1);
