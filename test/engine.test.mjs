// Run with: node --test
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkTable } from '../tools/check-table.mjs';
import { Field } from '../src/field.js';
import { num } from '../src/util.js';
import * as classicRules from '../tables/classic.js';

const classic = JSON.parse(readFileSync('tables/classic.json', 'utf8'));

function writeTable(table, rulesSource) {
  const dir = mkdtempSync(join(tmpdir(), 'pinball-'));
  const path = join(dir, 'table.json');
  writeFileSync(path, JSON.stringify(table));
  if (rulesSource) writeFileSync(join(dir, 'table.js'), rulesSource);
  return path;
}

test('numbers stored as strings are read as numbers', () => {
  assert.equal(num('2.3'), 2.3);
  assert.equal(num(4), 4);
  assert.equal(num(undefined, 7), 7);
});

test('Classic loads and its launch barrier starts retracted', () => {
  const field = new Field(classic, { rules: classicRules });
  field.startGame();
  assert.equal(field.flippers.length, 2);
  assert.equal(field.getFieldElementById('LaunchBarrier').isRetracted(), true);
  assert.equal(field.launchBallIfNeeded(), true);
  assert.equal(field.balls.length, 1);
});

test('a launched ball leaves the launch lane', () => {
  const field = new Field(classic, { rules: classicRules, random: () => 0.5 });
  field.startGame();
  field.launchBallIfNeeded();
  let top = 0;
  for (let i = 0; i < 120; i++) {
    field.advance(1000 / 60);
    top = Math.max(top, field.balls[0]?.getPosition().y ?? 0);
  }
  assert.ok(top > 25, `ball only reached y=${top}`);
});

test('Classic passes the table checker, and the result repeats with the same seed', async () => {
  const a = await checkTable('tables/classic.json', { balls: 10, seed: 7 });
  const b = await checkTable('tables/classic.json', { balls: 10, seed: 7 });
  assert.deepEqual(a.problems, []);
  assert.deepEqual(a.stats, b.stats);
});

test('the checker catches a trapped ball', async () => {
  const table = structuredClone(classic);
  delete table.delegate;
  table.elements.push({ class: 'WallElement', position: [0, 12, 18.5, 12] });
  const { problems } = await checkTable(writeTable(table), { balls: 3 });
  assert.ok(problems.some((p) => p.includes('trapped') || p.includes('never drained')), problems.join('; '));
});

test('the checker catches unknown hooks and field calls in a rules file', async () => {
  const table = structuredClone(classic);
  const rules = 'export function ballDrained(field) { field.doMagic(); }\n';
  const { problems } = await checkTable(writeTable(table, rules), { balls: 1 });
  assert.ok(problems.some((p) => p.includes('"ballDrained"')));
  assert.ok(problems.some((p) => p.includes('field.doMagic()')));
});

test('a table with unsupported elements is hidden, not failed', async () => {
  const table = structuredClone(classic);
  table.elements.push({ class: 'SpinnerElement' });
  const result = await checkTable(writeTable(table));
  assert.equal(result.hidden, true);
  assert.deepEqual(result.problems, []);
});
