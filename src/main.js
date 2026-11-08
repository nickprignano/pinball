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
const tables = await (await fetch('tables/index.json')).json();

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

const isPlaying = () => Boolean(field?.state.inProgress) && !paused && performance.now() >= countdownUntil;

function newGame() {
  field = new Field(current.table, { rules: current.rules, audio });
  renderer.layout(field);
  field.startGame();
  field.showGameMessage('Tap or press Enter to launch', 4000, false);
  wasInProgress = true;
  setPaused(false);
}

async function chooseTable(entry) {
  current = await loadTable(entry);
  history.replaceState(null, '', `?table=${entry.id}`);
  document.title = `${entry.name} · Pinball`;
  $('menu').close();
  newGame();
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
for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => audio.unlock(), { once: true });

// Controls

attachInput(canvas, {
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
$('btn-header').addEventListener('click', () => {
  const header = $('site-header');
  const collapsed = header.classList.toggle('collapsed');
  $('btn-header').textContent = collapsed ? '▾' : '▴';
  $('btn-header').setAttribute('aria-expanded', String(!collapsed));
  $('btn-header').setAttribute('aria-label', collapsed ? 'Show the site header' : 'Hide the site header');
});
import(THEME_MODULE)
  .then(({ headerHtml, initThemeToggle }) => {
    $('site-header').innerHTML = headerHtml({ bio: 'Pinball, open source', links: [] });
    initThemeToggle();
  })
  .catch(() => $('btn-header').remove());

onThemeChange(() => renderer.setPalette(Palette.fromDocument()));
// The shared theme stylesheet may finish loading after this script starts.
addEventListener('load', () => renderer.setPalette(Palette.fromDocument()));
new ResizeObserver(() => field && renderer.layout(field)).observe(canvas);

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
    renderer.frame(field);

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

// Start straight away when a table is named in the address, otherwise show the picker.
const requested = tables.find((t) => t.id === new URLSearchParams(location.search).get('table'));
if (requested) await chooseTable(requested);
else showMenu();

// For scripted browser tests.
globalThis.pinball = { get field() { return field; }, chooseTable, tables };
