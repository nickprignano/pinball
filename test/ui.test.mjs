// Run with: node --test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Field } from '../src/field.js';
import { Scores } from '../src/scores.js';
import { Palette } from '../src/theme.js';
import * as classicRules from '../tables/classic.js';

const classic = JSON.parse(readFileSync('tables/classic.json', 'utf8'));

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
}

test('scores keep the top 10 per table with 3-letter initials', () => {
  const scores = new Scores(memoryStorage());
  for (let i = 1; i <= 12; i++) scores.add('classic', 'abcd', i * 100);
  const list = scores.list('classic');
  assert.equal(list.length, 10);
  assert.equal(list[0].name, 'ABC');
  assert.equal(scores.best('classic'), 1200);
  assert.equal(scores.qualifies('classic', 200), false);
  assert.equal(scores.qualifies('classic', 400), true);
  assert.deepEqual(scores.list('ringmaster'), []);
});

test('scores still work when storage is blocked', () => {
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const scores = new Scores(blocked);
  assert.equal(scores.best('classic'), 0);
  assert.equal(scores.add('classic', 'zz', 500)[0].score, 500);
});

test('three nudges within 2 seconds tilt the table until the ball drains', () => {
  const field = new Field(classic, { rules: classicRules, random: () => 0.5 });
  field.startGame();
  field.launchBallIfNeeded();
  field.advance(2000);
  field.nudge();
  field.nudge();
  assert.equal(field.tilted, undefined);
  field.nudge();
  assert.equal(field.tilted, true);
  field.setAllFlippersEngaged(true);
  assert.ok(field.flippers.every((f) => !f.isFlipperEngaged()));
  for (let i = 0; i < 600 && field.state.ballNumber === 1; i++) field.advance(100);
  assert.equal(field.state.ballNumber, 2);
  assert.equal(field.tilted, false);
});

test('table colors follow the theme', () => {
  const light = { '--bg': '#f6f7f9', '--fg': '#111418', '--accent': '#2563d6', '--active': '#17804a' };
  const dark = { '--bg': '#0d1117', '--fg': '#e6edf3', '--accent': '#58a6ff', '--active': '#3fb950' };
  const lightness = (css) => Number(css.match(/%,(\d+)%/)[1]);
  const white = [255, 255, 255, 255];
  assert.ok(lightness(new Palette(dark, true).css(white)) > 80);
  assert.ok(lightness(new Palette(light, false).css(white)) < 25);
  // A blue close to the accent takes the accent's hue.
  const accentHue = new Palette(dark, true).css([0, 0, 255, 255]).match(/hsla\((\d+)/)[1];
  assert.equal(accentHue, '212');
});
