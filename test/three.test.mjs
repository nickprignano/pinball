// Checks for the 3D view's plain math (no browser or WebGL needed). Run with: node --test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Field } from '../src/field.js';
import {
  cornerHeights, FOOTPRINT_TOLERANCE, hasPart, MIN_RISE_INTERVAL_MS, newLight, SIZES, solidCells, stepLight, toWorld,
} from '../src/three/geometry.js';

const load = (id) => new Field(JSON.parse(readFileSync(`tables/${id}.json`, 'utf8')));
const tables = JSON.parse(readFileSync('tables/index.json', 'utf8'));

test('every element type in the listed tables has a 3D part', () => {
  for (const { id } of tables) {
    for (const element of load(id).elements) assert.ok(hasPart(element), `${id}: ${element.constructor.name} has no 3D part`);
  }
});

test('field coordinates map to the 3D world with the table centred and y running away from the player', () => {
  const field = load('classic');
  assert.deepEqual(toWorld(field, field.width / 2, field.height / 2), { x: 0, z: 0 });
  assert.deepEqual(toWorld(field, 0, field.height), { x: -field.width / 2, z: -field.height / 2 });
  assert.deepEqual(toWorld(field, field.width, 0), { x: field.width / 2, z: field.height / 2 });
});

test('solid parts stick out no more than 0.05 past their physics bodies', () => {
  const wallHalfThickness = 0.05; // createThinWall in src/physics.js
  const flipperHalfWidth = 0.12; // FlipperElement.createBodies
  assert.ok(SIZES.railHalfWidth <= wallHalfThickness + FOOTPRINT_TOLERANCE);
  assert.ok(SIZES.dropTargetHalfThickness <= wallHalfThickness + FOOTPRINT_TOLERANCE);
  assert.ok(SIZES.flipperPivotRadius <= flipperHalfWidth + FOOTPRINT_TOLERANCE);
  assert.ok(SIZES.flipperTipRadius <= flipperHalfWidth + FOOTPRINT_TOLERANCE);
  // Plastics slope up across one grid cell, starting inside the walls.
  assert.ok(SIZES.cell <= 2 * FOOTPRINT_TOLERANCE);
});

test('plastics are raised only where the ball can never go', () => {
  const field = load('deep-orbit');
  const grid = solidCells(field);
  const solidAt = (x, y) => grid.solid[Math.floor(y / grid.cell) * grid.nx + Math.floor(x / grid.cell)] === 1;
  // Open playfield, the launch lane, the flipper area and the top orbit stay flat.
  for (const [x, y] of [[9.5, 8], [19.3, 3], [9.5, 3], [9.5, 25], [10, 29.5]]) assert.equal(solidAt(x, y), false, `${x},${y}`);
  // Outside the round top of the table, and inside the slingshots, is plastic.
  for (const [x, y] of [[0.3, 29.7], [19.7, 29.7], [4.2, 6.5], [14.6, 6.5]]) assert.equal(solidAt(x, y), true, `${x},${y}`);
  // A corner is only raised when all four cells around it are solid.
  const heights = cornerHeights(grid);
  const i = Math.floor(9.5 / grid.cell);
  const j = Math.floor(8 / grid.cell);
  assert.equal(heights[j * (grid.nx + 1) + i], 0);
});

test('a light rises at most 3 times a second however fast the game flashes it', () => {
  const light = newLight();
  let rises = 0;
  let previous = 0;
  let rising = false;
  for (let now = 0; now < 3000; now += 16) {
    const level = stepLight(light, Math.floor(now / 50) % 2 === 0, now, 16);
    if (level > previous && !rising) rises++;
    rising = level > previous;
    previous = level;
    assert.ok(level >= 0 && level <= 1);
  }
  assert.ok(rises <= Math.ceil(3000 / MIN_RISE_INTERVAL_MS), `${rises} rises`);
  // A light that stays on stays fully lit.
  const steady = newLight();
  let level = 0;
  for (let now = 0; now < 1000; now += 16) level = stepLight(steady, true, now, 16);
  assert.equal(level, 1);
});

test('the ball never rolls through raised plastic in real play', async () => {
  const { seededRandom } = await import('../src/util.js');
  for (const { id } of tables) {
    const table = JSON.parse(readFileSync(`tables/${id}.json`, 'utf8'));
    let rules = {};
    try {
      rules = await import(`../tables/${id}.js`);
    } catch {
      // Standard rules.
    }
    const random = seededRandom(11);
    const field = new Field(table, { rules, random });
    const grid = solidCells(field);
    field.startGame();
    for (let ms = 0; ms < 120000 && field.state.inProgress; ms += 16) {
      field.launchBallIfNeeded();
      if (ms % 400 === 0) {
        field.setLeftFlippersEngaged(random() < 0.5);
        field.setRightFlippersEngaged(random() < 0.5);
      }
      field.advance(16);
      for (const ball of field.balls) {
        const { x, y } = ball.getPosition();
        const i = Math.floor(x / grid.cell);
        const j = Math.floor(y / grid.cell);
        if (i < 0 || j < 0 || i >= grid.nx || j >= grid.ny) continue;
        assert.equal(grid.solid[j * grid.nx + i], 0, `${id}: ball centre at ${x.toFixed(2)},${y.toFixed(2)} is inside plastic`);
      }
    }
  }
});
