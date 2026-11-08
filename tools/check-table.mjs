#!/usr/bin/env node
// Table checker: node tools/check-table.mjs tables/<id>.json [more tables...]
// Checks a table loads, launches, and survives a seeded smoke test with random flipper presses.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unsupportedClasses } from '../src/elements/index.js';
import { Field } from '../src/field.js';
import { seededRandom } from '../src/util.js';

export const RULE_HOOKS = new Set([
  'gameStarted', 'gameEnded', 'ballLost', 'tick', 'processCollision', 'flippersActivated',
  'allRolloversInGroupActivated', 'allDropTargetsInGroupHit', 'ballInSensorRange', 'isFieldActive',
]);

const FRAME_MS = 1000 / 60;
const MAX_BALL_GAME_MS = 20 * 60 * 1000;
const MAX_BUMPS_IN_A_ROW = 3;

export async function checkTable(path, { balls = 30, seed = 1 } = {}) {
  const problems = [];
  let table;
  try {
    table = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { problems: [`not valid JSON: ${e.message}`] };
  }
  if (!Array.isArray(table.elements)) return { problems: ['no "elements" array'] };
  const unsupported = unsupportedClasses(table);
  if (unsupported.length) {
    return { hidden: true, problems: [], note: `hidden from the picker, unsupported elements: ${unsupported.join(', ')}` };
  }

  const rulesPath = path.replace(/\.json$/, '.js');
  let rules = {};
  if (existsSync(rulesPath)) {
    rules = await import(pathToFileURL(resolve(rulesPath)).href);
    for (const name of Object.keys(rules)) {
      if (!RULE_HOOKS.has(name)) problems.push(`rules export "${name}", which isn't a known hook`);
    }
    const source = readFileSync(rulesPath, 'utf8');
    for (const [, method] of source.matchAll(/\bfield\.(\w+)\s*\(/g)) {
      if (typeof Field.prototype[method] !== 'function') problems.push(`rules call field.${method}(), which doesn't exist`);
    }
  }

  const random = seededRandom(seed);
  const stats = { balls: 0, maxScore: 0, bumps: 0, reachedTop: false };
  try {
    let field = null;
    let ballSteps = 0;
    let bumpsInARow = 0;
    while (stats.balls < balls) {
      if (!field || !field.state.inProgress) {
        field = new Field(table, { rules, random });
        field.startGame();
      }
      // Like a player: any press launches a ball when none is in play or one sits in the lane.
      if (field.launchBallIfNeeded()) {
        stats.balls += 1;
        ballSteps = 0;
        bumpsInARow = 0;
      }
      const low = field.balls.some((b) => b.getPosition().y < field.height * 0.25);
      field.setLeftFlippersEngaged(low && random() < 0.4);
      field.setRightFlippersEngaged(low && random() < 0.4);

      const bumpsBefore = field.bumps ?? 0;
      field.advance(FRAME_MS);
      if ((field.bumps ?? 0) > bumpsBefore) {
        stats.bumps += 1;
        bumpsInARow += 1;
        if (bumpsInARow > MAX_BUMPS_IN_A_ROW) throw new Error(`ball trapped: ${bumpsInARow} stuck-ball bumps in a row`);
      } else if (field.balls.some((b) => b.getLinearVelocity().length() > 1)) {
        bumpsInARow = 0;
      }

      for (const b of field.balls) {
        const p = b.getPosition();
        if (p.x < -1 || p.y < -1 || p.x > field.width + 1 || p.y > field.height + 1) {
          throw new Error(`ball left the field at (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
        }
        if (p.y > field.height * 0.6) stats.reachedTop = true;
      }
      ballSteps += 1;
      if (ballSteps * FRAME_MS * field.targetTimeRatio > MAX_BALL_GAME_MS) throw new Error('a ball never drained');
      stats.maxScore = Math.max(stats.maxScore, field.state.score);
    }
  } catch (e) {
    problems.push(e.message);
  }
  if (!stats.reachedTop) problems.push('no ball ever reached the upper part of the table (launch lane blocked?)');
  if (stats.maxScore === 0) problems.push('no points were scored');
  return { problems, stats };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = process.argv.slice(2);
  if (!paths.length) {
    console.error('usage: node tools/check-table.mjs tables/<id>.json [...]');
    process.exit(2);
  }
  let failed = false;
  for (const path of paths) {
    const { problems, stats, note } = await checkTable(path);
    if (problems.length) {
      failed = true;
      console.log(`FAIL ${path}`);
      for (const p of problems) console.log(`  - ${p}`);
    } else {
      console.log(`ok   ${path}${note ? ` (${note})` : ''}${stats ? ` ${JSON.stringify(stats)}` : ''}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
