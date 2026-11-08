// Loads a table and runs the game loop in the browser.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

import { Field } from './field.js';
import { attachInput } from './input.js';
import { CanvasRenderer } from './render.js';

export async function loadTable(id) {
  const table = await (await fetch(`tables/${id}.json`)).json();
  let rules = {};
  try {
    rules = await import(`../tables/${id}.js`);
  } catch {
    // No rules file: the table plays on standard rules.
  }
  return { table, rules };
}

const canvas = document.getElementById('game');
const renderer = new CanvasRenderer(canvas);
const tables = await (await fetch('tables/index.json')).json();
const params = new URLSearchParams(location.search);
const { table, rules } = await loadTable(params.get('table') ?? tables[0].id);

let field = new Field(table, { rules });
const newGame = () => {
  field = new Field(table, { rules });
  renderer.layout(field);
  field.startGame();
  field.launchBallIfNeeded();
};
attachInput(canvas, () => field, newGame);

renderer.layout(field);
addEventListener('resize', () => renderer.layout(field));

let last = performance.now();
let paused = false;
document.addEventListener('visibilitychange', () => {
  paused = document.hidden;
  last = performance.now();
});

function frame(now) {
  if (!paused) field.advance(Math.min(now - last, 100));
  last = now;
  renderer.frame(field);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// For scripted browser tests.
globalThis.pinball = { get field() { return field; }, newGame };
