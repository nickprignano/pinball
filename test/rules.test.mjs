// Drives each table's rules directly, to reach paths random play rarely hits (like multiball).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Field } from '../src/field.js';

async function load(id) {
  const table = JSON.parse(readFileSync(`tables/${id}.json`, 'utf8'));
  const rules = await import(`../tables/${id}.js`);
  const field = new Field(table, { rules, random: () => 0.5 });
  field.startGame();
  field.launchBallIfNeeded();
  return { field, rules, el: (id) => field.getFieldElementById(id) };
}

const runFor = (field, ms) => {
  for (let t = 0; t < ms; t += 1000 / 60) field.advance(1000 / 60);
};

test('Classic: lit multiball rollovers plus the ramp start multiball', async () => {
  const { field, rules, el } = await load('classic');
  el('ExtraBallRollovers').setAllRolloversActivated(true);
  rules.allRolloversInGroupActivated(field, el('RampRollovers'), field.balls[0]);
  assert.equal(field.message.text, 'Multiball!');
  assert.equal(el('BallSaver-left').isRetracted(), false);
  runFor(field, 4000 / field.targetTimeRatio);
  assert.ok(field.balls.length >= 2, `balls: ${field.balls.length}`);
});

test('Round and Round: bumpers rotate, and the red bumper starts multiball when lit', async () => {
  const { field, rules, el } = await load('round-and-round');
  const before = { ...el('RotatingBumper1A').getCenter() };
  runFor(field, 500);
  assert.notDeepEqual(el('RotatingBumper1A').getCenter(), before);
  for (const id of ['DropTargetLeft', 'DropTargetTopLeft', 'DropTargetRight', 'DropTargetLeft', 'DropTargetTopLeft', 'DropTargetRight']) {
    rules.allDropTargetsInGroupHit(field, el(id), field.balls[0]);
  }
  const lights = el('ExtraBallRollovers');
  for (let i = 0; i < lights.numberOfRollovers(); i++) lights.setRolloverActiveAtIndex(i, true);
  rules.processCollision(field, el('CenterBumper1'), null, field.balls[0]);
  assert.equal(field.message.text, 'Multiball!');
  assert.equal(lights.allRolloversActive(), false);
});

test('Ringmaster: energy and both target banks light multiball, then a ramp starts it', async () => {
  const { field, rules, el } = await load('ringmaster');
  const bumper = field.elements.find((e) => e.constructor.name === 'BumperElement');
  for (let i = 0; i < 5; i++) rules.allDropTargetsInGroupHit(field, el('LowerMultiballTargets'), field.balls[0]);
  for (let i = 0; i < 2; i++) rules.allDropTargetsInGroupHit(field, el('UpperMultiballTargets'), field.balls[0]);
  assert.equal(el('BumperIndicator').isRolloverActiveAtIndex(0), false);
  for (let i = 0; i < 200; i++) rules.processCollision(field, bumper, null, field.balls[0]);
  assert.equal(el('BumperIndicator').isRolloverActiveAtIndex(0), true);
  rules.allRolloversInGroupActivated(field, el('LeftRampRollover'), field.balls[0]);
  assert.equal(field.message.text, 'Multiball!');
  runFor(field, 4000 / field.targetTimeRatio);
  assert.ok(field.balls.length >= 2, `balls: ${field.balls.length}`);
});
