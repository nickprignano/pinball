// The page: table picker, game loop, controls, sound, scores and the site header.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

import { Audio } from './audio.js';
import { Field } from './field.js';
import { attachInput } from './input.js';
import { CanvasRenderer } from './render.js';
import { Scores } from './scores.js';
import { onThemeChange, Palette } from './theme.js';

const THEME_MODULE = 'https://cdn.jsdelivr.net/gh/nickprignano/prignano-theme@4c2effc3829269e40ad663baf130a6b899a402bb/index.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const audio = new Audio();
const scores = new Scores();
const renderer = new CanvasRenderer(canvas, Palette.fromDocument());
const stage = document.querySelector('.stage');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const installed = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;

// Installable app: sw.js keeps every game file so it plays offline. A new version downloads in the
// background, and the table menu offers it; it never reloads the page by itself.
let updateWaiting = null;
let installPrompt = null;
let reloadOnUpdate = false;
function showAppActions() {
  $('btn-update').hidden = !updateWaiting;
  $('btn-install').hidden = !installPrompt;
  $('app-actions').hidden = !updateWaiting && !installPrompt;
  // iPhone and iPad have no install button: Safari's Share menu does it.
  const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  $('ios-install').hidden = installed || !apple;
}
showAppActions();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((registration) => {
    const watch = (worker) => worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        updateWaiting = worker;
        showAppActions();
      }
    });
    if (registration.waiting && navigator.serviceWorker.controller) updateWaiting = registration.waiting;
    watch(registration.installing);
    registration.addEventListener('updatefound', () => watch(registration.installing));
    // Installed apps are reopened rather than reloaded, so look for a new version each time.
    document.addEventListener('visibilitychange', () => document.hidden || registration.update().catch(() => {}));
    showAppActions();
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => reloadOnUpdate && location.reload());
}
$('btn-update').addEventListener('click', () => {
  reloadOnUpdate = true;
  updateWaiting.postMessage('skip-waiting');
});
addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  showAppActions();
});
$('btn-install').addEventListener('click', async () => {
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  showAppActions();
});

let tables;
try {
  tables = await (await fetch('tables/index.json')).json();
} catch {
  document.body.textContent = "Pinball couldn't load. Check your connection and try again.";
  throw new Error('tables/index.json did not load');
}

let current = null; // { id, name, table, rules }
let field = null;
let paused = false;
let countdownUntil = 0;
let wasInProgress = false;

async function loadTable(entry) {
  const table = await (await fetch(`tables/${entry.id}.json`)).json();
  let rules = {};
  try {
    rules = await import(`../tables/${entry.id}.js`);
  } catch {
    // No rules file: the table plays on standard rules.
  }
  return { ...entry, table, rules };
}

// Graphics: Flat is the line drawing; 3D loads three.js only when chosen. Auto starts on High and,
// if frames are slow, steps down to Low and then Flat, always between balls.
const GFX_KEY = 'pinball-gfx';
const GFX = ['flat', 'auto', 'high', 'low'];
const params = new URLSearchParams(location.search);
let gfx = readGfx();
let view = null; // the 3D view while it's on
let tier = null; // 'high' or 'low' while 3D is on
let pendingTier = null;
let viewModule = null;
let draw3d = false; // the 3D view needs a frame even though the game is paused

function readGfx() {
  if (GFX.includes(params.get('gfx'))) return params.get('gfx');
  try {
    const saved = localStorage.getItem(GFX_KEY);
    if (GFX.includes(saved)) return saved;
  } catch {
    // Storage blocked: use the default.
  }
  return 'auto';
}

async function setGfx(value) {
  try {
    localStorage.setItem(GFX_KEY, value);
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
  await applyGfx(value);
}

async function applyGfx(value) {
  gfx = value;
  const next = gfx === 'flat' ? null : gfx === 'auto' ? 'high' : gfx;
  if (next !== tier) await switchTier(next);
}

async function switchTier(next, note) {
  view?.dispose();
  view = null;
  tier = null;
  clearOverlay();
  if (next) {
    try {
      viewModule ??= await import('./three/view.js');
      if (!viewModule.supportsWebGL2()) throw new Error('WebGL 2 is not available');
      view = new viewModule.ThreeView(stage, next, { onContextLost });
      tier = next;
      document.body.classList.add('three');
      if (field) await view.setTable(field, current);
    } catch (error) {
      console.warn('3D view unavailable:', error);
      view?.dispose();
      view = null;
      tier = null;
      note = "3D can't run on this device, so the table is drawn flat.";
    }
  }
  document.body.classList.toggle('three', Boolean(view));
  resetTiming();
  draw3d = true;
  if (field) {
    renderer.layout(field);
    if (note) field.showGameMessage(note, 5000, false);
  }
}

// If the GPU drops the 3D view's context and doesn't give it back within 3 seconds, go flat.
function onContextLost(lost) {
  if (lost !== view) return;
  lost.lost = true;
  lost.canvas.addEventListener('webglcontextrestored', () => view === lost && switchTier(tier), { once: true });
  setTimeout(() => view === lost && lost.lost && switchTier(null, 'The 3D view stopped, so the table is drawn flat.'), 3000);
}

let playMs = 0;
let samples = [];
function resetTiming() {
  playMs = 0;
  samples = [];
  pendingTier = null;
}

// Auto quality: after 5 seconds of play, a median frame over 20 ms (3-second window) steps down.
function watchFrameTime(now, dt) {
  if (gfx !== 'auto' || !view || !isPlaying()) return;
  playMs += dt;
  if (playMs < 5000 || pendingTier) return;
  samples.push([now, dt]);
  while (now - samples[0][0] > 3000) samples.shift();
  if (now - samples[0][0] < 2900) return;
  const times = samples.map(([, t]) => t).sort((a, b) => a - b);
  const median = times[times.length >> 1];
  if (tier === 'high' && median > 20) pendingTier = 'low';
  else if (tier === 'low' && median > 40) pendingTier = 'flat';
}

const isPlaying = () => Boolean(field?.state.inProgress) && !paused && performance.now() >= countdownUntil;

function newGame() {
  field = new Field(current.table, { rules: current.rules, audio });
  renderer.layout(field);
  clearOverlay();
  if (view?.tableId === current.id) view.bind(field);
  field.startGame();
  field.showGameMessage('Tap or press Enter to launch', 4000, false);
  wasInProgress = true;
  setPaused(false);
}

async function chooseTable(entry) {
  current = await loadTable(entry);
  const url = new URL(location.href);
  url.searchParams.set('table', entry.id);
  history.replaceState(null, '', url);
  document.title = `${entry.name} · Pinball`;
  $('menu').close();
  newGame();
  if (view) await view.setTable(field, current);
}

// Menus

function showMenu() {
  if (field?.state.inProgress) setPaused(true, false);
  const list = $('table-list');
  list.replaceChildren(
    ...tables.map((entry) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      const best = scores.best(entry.id);
      button.innerHTML = '<span class="name"></span><span class="best"></span>';
      button.querySelector('.name').textContent = entry.name;
      button.querySelector('.best').textContent = best ? `Best ${best.toLocaleString()}` : '';
      button.addEventListener('click', () => chooseTable(entry));
      li.append(button);
      return li;
    }),
  );
  $('menu').showModal();
}

function setPaused(value, showDialog = true) {
  paused = value;
  $('btn-pause').textContent = paused ? 'Resume' : 'Pause';
  if (paused && field) field.setAllFlippersEngaged(false);
  if (paused && showDialog && !$('paused').open) $('paused').showModal();
  if (!paused && $('paused').open) $('paused').close();
}

// Resuming counts down 3 seconds so the player can get ready.
function resume() {
  setPaused(false);
  countdownUntil = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : performance.now() + 3000;
}

function togglePause() {
  if (!field?.state.inProgress) return;
  if (paused) resume();
  else setPaused(true);
}

function showGameOver() {
  const score = field.state.score;
  $('final-score').textContent = score.toLocaleString();
  const form = $('initials-form');
  form.hidden = !scores.qualifies(current.id, score);
  renderHighScores();
  $('gameover').showModal();
  if (!form.hidden) $('initials').focus();
}

function renderHighScores(highlight) {
  $('high-scores').replaceChildren(
    ...scores.list(current.id).map((s) => {
      const li = document.createElement('li');
      li.textContent = `${s.name}  ${s.score.toLocaleString()}`;
      if (s === highlight) li.className = 'new';
      return li;
    }),
  );
}

$('initials-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const score = field.state.score;
  const list = scores.add(current.id, $('initials').value, score);
  $('initials-form').hidden = true;
  renderHighScores(list.find((s) => s.score === score));
});
$('btn-again').addEventListener('click', () => {
  $('gameover').close();
  newGame();
});
$('btn-change').addEventListener('click', () => {
  $('gameover').close();
  showMenu();
});
$('btn-tables').addEventListener('click', showMenu);
$('btn-pause').addEventListener('click', togglePause);
$('btn-resume').addEventListener('click', resume);
$('btn-quit').addEventListener('click', () => {
  setPaused(false);
  field.endGame();
});
$('paused').addEventListener('cancel', (event) => {
  event.preventDefault();
  resume();
});
$('menu').addEventListener('close', () => {
  if (field?.state.inProgress && paused && !$('paused').open) resume();
});
$('about-link').addEventListener('click', (event) => {
  event.preventDefault();
  $('about').showModal();
});
$('btn-about-close').addEventListener('click', () => $('about').close());

// In 3D, in-table messages and score pop-ups are HTML over the table.
const popups = new Map();
function updateOverlay() {
  const text = field.message?.text ?? '';
  const box = $('table-message');
  if (box.textContent !== text) box.textContent = text;
  box.hidden = !text;
  const live = new Set(field.scoreAnimations);
  for (const [animation, label] of popups) {
    if (!live.has(animation)) {
      label.remove();
      popups.delete(animation);
    }
  }
  for (const animation of field.scoreAnimations) {
    let label = popups.get(animation);
    if (!label) {
      label = document.createElement('span');
      label.textContent = animation.points.toLocaleString();
      $('popups').append(label);
      popups.set(animation, label);
    }
    const t = (field.gameTimeMs - animation.startMs) / 1000;
    const p = view.project(animation.x, animation.y, 0.8 + (reducedMotion ? 0 : t * 1.5));
    label.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
    label.style.opacity = String(Math.max(0, 1 - t));
  }
}
function clearOverlay() {
  $('table-message').hidden = true;
  for (const label of popups.values()) label.remove();
  popups.clear();
}

$('gfx').value = gfx;
$('gfx').addEventListener('change', (event) => setGfx(event.target.value));

// ?fps=1 shows the median frame time, for checking a real phone.
const fpsTimes = [];
let fpsShownAt = 0;
function showFps(now, dt) {
  if (params.get('fps') !== '1') return;
  fpsTimes.push(dt);
  if (fpsTimes.length > 120) fpsTimes.shift();
  if (now - fpsShownAt < 500) return;
  fpsShownAt = now;
  const sorted = [...fpsTimes].sort((a, b) => a - b);
  $('fps').hidden = false;
  $('fps').textContent = `${sorted[sorted.length >> 1].toFixed(1)} ms · ${tier ?? 'flat'}`;
}

// Sound

function updateMuteButton() {
  const button = $('btn-mute');
  button.textContent = audio.muted ? 'Muted' : 'Sound';
  button.setAttribute('aria-pressed', String(audio.muted));
  button.setAttribute('aria-label', audio.muted ? 'Turn sound on' : 'Mute sound');
}
function toggleMute() {
  audio.setMuted(!audio.muted);
  updateMuteButton();
}
$('btn-mute').addEventListener('click', toggleMute);
updateMuteButton();
for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => audio.unlock());

// Controls

attachInput(stage, {
  field: () => field,
  isPlaying,
  launch: () => isPlaying() && field.launchBallIfNeeded(),
  nudge: () => isPlaying() && field.nudge(),
  togglePause,
  toggleMute,
});
$('btn-nudge').addEventListener('click', () => isPlaying() && field.nudge());

// Site header from prignano-theme, loaded at runtime so this repo carries no personal details.
// The game works without it.
function setHeaderCollapsed(collapsed) {
  $('site-header').classList.toggle('collapsed', collapsed);
  $('btn-header').textContent = collapsed ? '▾' : '▴';
  $('btn-header').setAttribute('aria-expanded', String(!collapsed));
  $('btn-header').setAttribute('aria-label', collapsed ? 'Show the site header' : 'Hide the site header');
}
$('btn-header').addEventListener('click', () => setHeaderCollapsed(!$('site-header').classList.contains('collapsed')));
// The installed app starts with the header hidden, to leave the screen to the table.
if (installed) setHeaderCollapsed(true);
import(THEME_MODULE)
  .then(({ headerHtml, initThemeToggle }) => {
    $('site-header').innerHTML = headerHtml({ bio: 'Pinball, open source', links: [] });
    initThemeToggle();
  })
  .catch(() => $('btn-header').remove());

// The phone's status bar takes the page background (theme-color), in both themes.
function applyTheme() {
  renderer.setPalette(Palette.fromDocument());
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (bg) document.querySelector('meta[name="theme-color"]').content = bg;
}
onThemeChange(applyTheme);
// The shared theme stylesheet may finish loading after this script starts.
addEventListener('load', applyTheme);
applyTheme();
new ResizeObserver(() => {
  if (field) renderer.layout(field);
  view?.resize();
  draw3d = true;
}).observe(stage);

// Pause when the tab is hidden.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isPlaying()) setPaused(true);
});

// Game loop

let last = performance.now();
let hud = '';
function frame(now) {
  const dt = Math.min(now - last, 100);
  last = now;
  if (field) {
    if (isPlaying() || (field.state.inProgress === false && !paused)) field.advance(dt);
    if (view?.tableId === current.id && !view.lost) {
      // The 3D view stops drawing while paused, apart from one frame after a resize.
      if (!paused || draw3d) view.frame(now, dt);
      draw3d = false;
      updateOverlay();
      watchFrameTime(now, dt);
      if (pendingTier && field.balls.length === 0) {
        const next = pendingTier;
        switchTier(next === 'flat' ? null : next, next === 'flat' ? 'Switched to the flat view to keep the game smooth. Tables, then Graphics, brings 3D back.' : null);
      }
    } else if (!view) {
      renderer.frame(field);
    }
    showFps(now, dt);

    const s = field.state;
    const text = `${s.score}|${s.ballNumber}|${s.multiplier}|${s.inProgress}`;
    if (text !== hud) {
      hud = text;
      $('score').textContent = s.score.toLocaleString();
      $('ball').textContent = s.inProgress
        ? `Ball ${s.ballNumber} of ${field.numBalls}${s.multiplier > 1 ? ` · ${s.multiplier}x` : ''}`
        : '';
    }
    if (wasInProgress && !s.inProgress) {
      wasInProgress = false;
      setTimeout(showGameOver, 1500);
    }
  }
  const remaining = Math.ceil((countdownUntil - now) / 1000);
  const countdown = $('countdown');
  countdown.hidden = !(remaining > 0 && field?.state.inProgress);
  if (!countdown.hidden) countdown.textContent = String(remaining);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (gfx !== 'flat') await applyGfx(gfx);

// Start straight away when a table is named in the address, otherwise show the picker.
const requested = tables.find((t) => t.id === new URLSearchParams(location.search).get('table'));
if (requested) await chooseTable(requested);
else showMenu();

// For scripted browser tests.
globalThis.pinball = { get field() { return field; }, get tier() { return tier; }, get view() { return view; }, chooseTable, tables };
