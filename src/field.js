// The game: physics world, elements, balls, scoring and game state.
// After Vector Pinball's Field, FieldLayout and GameState classes.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.
//
// Runs without a browser, so the table checker and tests can drive it from Node.

import { Vec2, World } from '../vendor/planck.mjs';
import { Ball } from './ball.js';
import { BumperElement } from './elements/bumper.js';
import { FlipperElement } from './elements/flipper.js';
import { createElement, unsupportedClasses } from './elements/index.js';
import { color, num, nums, rgb } from './util.js';

// One physics step, in game time. Upstream steps about every 9.6 ms of game time at 60 fps.
export const STEP_MS = 1000 / 120;
const MAX_FRAME_GAME_MS = 250;
const STUCK_BALL_MS = 10_000;
const END_BALL_DELAY_MS = 750;

const KNOWN_TABLE_KEYS = new Set([
  'name', 'version', 'width', 'height', 'gravity', 'numballs', 'ballradius', 'ballcolor',
  'secondaryBallColor', 'targetTimeRatio', 'delegate', 'variables', 'launchPosition',
  'launchVelocity', 'launchVelocityRandomDelta', 'launchDeadZone', 'mercyBallDuration',
  'multiballSaverDuration', 'preserveMultiplierIncreaseDuration', 'script', 'elements',
]);

const noAudio = { play() {} };

export class Field {
  // table: parsed table JSON. rules: the table's rules module (or {}). random: () => [0, 1).
  constructor(table, { rules = {}, random = Math.random, audio = noAudio } = {}) {
    const unsupported = unsupportedClasses(table);
    if (unsupported.length) throw new Error(`Table uses unsupported elements: ${unsupported.join(', ')}`);
    for (const key of Object.keys(table)) {
      if (!KNOWN_TABLE_KEYS.has(key)) console.warn(`Ignoring unknown table key: ${key}`);
    }

    this.table = table;
    this.delegate = rules;
    this.random = random;
    this.audio = audio;

    this.width = num(table.width, 20);
    this.height = num(table.height, 30);
    this.numBalls = num(table.numballs, 3);
    this.ballRadius = num(table.ballradius, 0.5);
    this.ballColor = color(table.ballcolor, rgb(255, 0, 0));
    this.secondaryBallColor = color(table.secondaryBallColor, rgb(128, 128, 128));
    this.targetTimeRatio = num(table.targetTimeRatio, 1);
    this.launchPosition = nums(table.launchPosition);
    this.launchVelocity = nums(table.launchVelocity);
    this.launchVelocityRandomDelta = nums(table.launchVelocityRandomDelta) ?? [];
    this.launchDeadZone = nums(table.launchDeadZone);
    this.mercyBallMs = num(table.mercyBallDuration, 20000);
    this.multiballSaverMs = num(table.multiballSaverDuration, 30000);
    this.preserveMultiplierMs = num(table.preserveMultiplierIncreaseDuration, 7500);
    this.variables = { ...(table.variables ?? {}) };

    this.world = new World({ gravity: Vec2(0, -num(table.gravity, 4)) });
    this.contacts = [];
    this.world.on('end-contact', (contact) => this.recordContact(contact));

    this.elements = table.elements.map((params) => createElement(params));
    this.elementsById = new Map();
    this.elementByBody = new Map();
    for (const element of this.elements) {
      element.createBodies(this.world);
      if (element.id) this.elementsById.set(element.id, element);
      for (const body of element.bodies) this.elementByBody.set(body, element);
    }
    this.flippers = this.elements.filter((e) => e instanceof FlipperElement);
    this.leftFlippers = this.flippers.filter((f) => f.isLeftFlipper());
    this.rightFlippers = this.flippers.filter((f) => f.isRightFlipper());

    this.balls = [];
    this.scheduled = [];
    this.scoreAnimations = [];
    this.message = null;
    this.gameTimeMs = 0;
    this.realTimeMs = 0;
    this.accumulatorMs = 0;
    this.msSinceBallMoved = 0;
    this.lastBallPositions = [];
    this.state = { inProgress: false, ballNumber: 0, extraBalls: 0, score: 0, multiplier: 1 };
  }

  // Game flow

  startGame() {
    this.ballStartMs = null;
    this.multiballStartMs = null;
    this.lastLaunchMs = null;
    this.lostBallRealMs = null;
    this.lastMultiplierIncrementMs = null;
    this.usedMercyBall = false;
    this.state = { inProgress: true, ballNumber: 1, extraBalls: 0, score: 0, multiplier: 1 };
    this.delegate.gameStarted?.(this);
  }

  endGame() {
    for (const ball of this.balls) ball.destroy();
    this.balls = [];
    this.state.inProgress = false;
    this.showGameMessage('Game Over', 2500);
    this.audio.play('gameOver');
    this.delegate.gameEnded?.(this);
  }

  // Called on any player input, like upstream: launches a ball when none is in play.
  launchBallIfNeeded() {
    if (!this.state.inProgress) return false;
    if (this.lostBallRealMs != null && this.realTimeMs - this.lostBallRealMs <= END_BALL_DELAY_MS) return false;
    const removed = this.removeDeadBalls();
    if (this.balls.length === 0 || removed > 0) {
      this.launchBall();
      return true;
    }
    return false;
  }

  launchBall() {
    const [x, y] = this.launchPosition;
    let [vx, vy] = this.launchVelocity;
    const [dx = 0, dy = 0] = this.launchVelocityRandomDelta;
    if (dx > 0) vx += dx * this.random();
    if (dy > 0) vy += dy * this.random();
    const ball = this.createBall(x, y);
    ball.body.setLinearVelocity(Vec2(vx, vy));
    this.audio.play('launch');
    this.lostBallRealMs = null;
    this.lastLaunchMs = this.gameTimeMs;
    if (this.balls.length > 1) this.multiballStartMs ??= this.gameTimeMs;
    else this.ballStartMs = this.gameTimeMs;
    return ball;
  }

  createBall(x, y) {
    const ball = new Ball(this.world, x, y, this.ballRadius, this.ballColor, this.secondaryBallColor);
    this.balls.push(ball);
    return ball;
  }

  // Balls resting in the launch lane's dead zone are relaunched instead of counted as lost.
  removeDeadBalls() {
    if (!this.launchDeadZone) return 0;
    const [x1, y1, x2, y2] = this.launchDeadZone;
    const dead = this.balls.filter((b) => {
      const p = b.getPosition();
      return p.x > x1 && p.y > y1 && p.x < x2 && p.y < y2;
    });
    for (const b of dead) this.removeBallWithoutBallLoss(b);
    return dead.length;
  }

  removeBall(ball) {
    this.removeBallWithoutBallLoss(ball);
    if (this.balls.length === 0) {
      if (!this.usedMercyBall && this.gameTimeMs - this.ballStartMs <= this.mercyBallMs) {
        this.usedMercyBall = true;
        this.showGameMessage('Ball Saved', 1500);
        this.launchBall();
      } else {
        this.doBallLost();
      }
    } else if (this.multiballStartMs != null && this.gameTimeMs - this.multiballStartMs <= this.multiballSaverMs) {
      // Upstream compares nanoseconds to 1000 here; we use the evident intent of one second.
      if (this.gameTimeMs - this.lastLaunchMs >= 1000) {
        this.showGameMessage('Ball Saved', 1000);
        this.launchBall();
      }
    }
  }

  removeBallWithoutBallLoss(ball) {
    if (!this.balls.includes(ball)) return;
    ball.destroy();
    this.balls = this.balls.filter((b) => b !== ball);
  }

  doBallLost() {
    this.tilted = false;
    this.lostBallRealMs = this.realTimeMs;
    this.usedMercyBall = false;
    this.multiballStartMs = null;
    const hasExtraBall = this.state.extraBalls > 0;
    const preserve = this.lastMultiplierIncrementMs != null &&
      this.gameTimeMs - this.lastMultiplierIncrementMs <= this.preserveMultiplierMs;
    if (preserve) this.state.multiplier -= 1;
    // Upstream's default: the multiplier is halved, rounded down, between balls.
    this.state.multiplier = Math.max(1, Math.floor(this.state.multiplier / 2));
    if (hasExtraBall) this.state.extraBalls -= 1;
    else if (this.state.ballNumber < this.numBalls) this.state.ballNumber += 1;
    else this.state.inProgress = false;
    if (preserve) this.state.multiplier += 1;
    this.lastMultiplierIncrementMs = null;

    if (hasExtraBall) {
      this.scheduleAction(1500, () => this.showGameMessage('Shoot Again', 1500, false));
    } else if (this.state.inProgress) {
      const n = this.state.ballNumber;
      this.scheduleAction(1500, () => this.showGameMessage(`Ball ${n}`, 1500, false));
    } else {
      this.endGame();
    }
    this.audio.play('ballLost');
    this.delegate.ballLost?.(this);
  }

  ballLostWithinMs(ms) {
    return this.lostBallRealMs != null && this.realTimeMs - this.lostBallRealMs <= ms;
  }

  // Nudging gives the balls a small push. Three nudges within 2 seconds tilt the table:
  // the flippers stop working and the ball drains with no ball saver.
  nudge() {
    if (!this.state.inProgress || this.tilted || !this.balls.length) return;
    this.nudgeTimes = (this.nudgeTimes ?? []).filter((t) => this.realTimeMs - t < 2000);
    this.nudgeTimes.push(this.realTimeMs);
    if (this.nudgeTimes.length >= 3) {
      this.tilted = true;
      this.nudgeTimes = [];
      this.usedMercyBall = true;
      this.multiballStartMs = null;
      this.setAllFlippersEngaged(false);
      this.showGameMessage('Tilt', 2000);
      return;
    }
    for (const b of this.balls) b.applyLinearImpulse(Vec2((this.random() - 0.5) * 1, 0.8));
    this.audio.play('nudge');
  }

  // Flippers

  setFlippersEngaged(flippers, engaged) {
    if (this.tilted) engaged = false;
    const activated = engaged ? flippers.filter((f) => !f.isFlipperEngaged()) : [];
    for (const f of flippers) f.setFlipperEngaged(engaged);
    if (activated.length) {
      this.audio.play('flipper');
      for (const e of this.elements) e.flippersActivated(this, activated);
      this.delegate.flippersActivated?.(this, activated);
    }
  }

  setLeftFlippersEngaged(engaged) {
    this.setFlippersEngaged(this.leftFlippers, engaged);
  }

  setRightFlippersEngaged(engaged) {
    this.setFlippersEngaged(this.rightFlippers, engaged);
  }

  setAllFlippersEngaged(engaged) {
    this.setFlippersEngaged(this.flippers, engaged);
  }

  // Time

  // Advance by real (wall clock) milliseconds. Game time runs targetTimeRatio times faster.
  advance(realMs) {
    this.realTimeMs += realMs;
    this.accumulatorMs = Math.min(this.accumulatorMs + realMs * this.targetTimeRatio, MAX_FRAME_GAME_MS);
    while (this.accumulatorMs >= STEP_MS) {
      this.step();
      this.accumulatorMs -= STEP_MS;
    }
    if (this.message && this.realTimeMs > this.message.untilRealMs) this.message = null;
  }

  step() {
    this.contacts = [];
    this.world.step(STEP_MS / 1000, 10, 10);
    this.processContacts();
    this.gameTimeMs += STEP_MS;
    for (const e of this.elements) e.tick(this, STEP_MS);
    this.processScheduledActions();
    this.checkForStuckBall(STEP_MS);
    this.scoreAnimations = this.scoreAnimations.filter((a) => this.gameTimeMs - a.startMs < 1000);
    this.delegate.tick?.(this, STEP_MS);
  }

  scheduleAction(ms, action) {
    this.scheduled.push({ at: this.gameTimeMs + ms, action });
    this.scheduled.sort((a, b) => a.at - b.at);
  }

  processScheduledActions() {
    while (this.scheduled.length && this.gameTimeMs >= this.scheduled[0].at) {
      this.scheduled.shift().action();
    }
  }

  getGameTimeMs() {
    return this.gameTimeMs;
  }

  // Collisions are handled after each physics step, when bodies can be changed safely.
  recordContact(contact) {
    const a = contact.getFixtureA();
    const b = contact.getFixtureB();
    let ball = this.balls.find((x) => x.body === a.getBody());
    let other = b;
    if (!ball) {
      ball = this.balls.find((x) => x.body === b.getBody());
      other = a;
    }
    if (ball) this.contacts.push({ ball, body: other.getBody() });
  }

  processContacts() {
    for (const { ball, body } of this.contacts) {
      if (!this.balls.includes(ball)) continue;
      const element = this.elementByBody.get(body);
      if (!element) continue;
      element.handleCollision(ball, body, this);
      this.delegate.processCollision?.(this, element, body, ball);
      if (element.getScore() !== 0) {
        this.addScoreWithAnimation(element.getScore(), ball.getPosition());
        this.audio.play('score');
      }
    }
  }

  // A ball that hasn't moved for 10 seconds, with no flipper held up, gets a small bump.
  checkForStuckBall(ms) {
    const positions = this.balls.map((b) => ({ x: b.getPosition().x, y: b.getPosition().y }));
    const prev = this.lastBallPositions;
    this.lastBallPositions = positions;
    const maybeStuck = this.balls.length > 0 && prev.length === this.balls.length &&
      this.balls.every((b, i) => {
        const v = b.getLinearVelocity();
        const p = positions[i];
        return v.x * v.x + v.y * v.y <= 0.01 && (p.x - prev[i].x) ** 2 + (p.y - prev[i].y) ** 2 <= 0.01;
      });
    if (!maybeStuck) {
      this.msSinceBallMoved = 0;
      return;
    }
    if (this.flippers.some((f) => f.isFlipperEngaged())) return;
    this.msSinceBallMoved += ms;
    if (this.msSinceBallMoved > STUCK_BALL_MS) {
      this.showGameMessage('Bump!', 1000);
      for (const b of this.balls) b.applyLinearImpulse(Vec2(this.random() < 0.5 ? 1 : -1, 1.5));
      this.msSinceBallMoved = 0;
      this.bumps = (this.bumps ?? 0) + 1;
    }
  }

  // Scoring and messages

  addScoreWithAnimation(points, position) {
    const added = this.addScore(points);
    this.scoreAnimations.push({ points: added, x: position.x, y: position.y, startMs: this.gameTimeMs });
  }

  addScore(points) {
    const added = Math.round(points * this.state.multiplier);
    this.state.score += added;
    return added;
  }

  getScore() {
    return this.state.score;
  }

  getScoreMultiplier() {
    return this.state.multiplier;
  }

  setScoreMultiplier(value) {
    this.state.multiplier = value;
  }

  incrementAndDisplayScoreMultiplier(ms) {
    this.lastMultiplierIncrementMs = this.gameTimeMs;
    this.state.multiplier += 1;
    this.showGameMessage(`${this.state.multiplier}x Multiplier`, ms);
  }

  addExtraBall() {
    this.state.extraBalls += 1;
  }

  showGameMessage(text, ms, playSound = true) {
    if (playSound) this.audio.play('message');
    this.message = { text, untilRealMs: this.realTimeMs + ms };
  }

  // Lookups used by table rules

  getFieldElementById(id) {
    return this.elementsById.get(id);
  }

  getBalls() {
    return this.balls;
  }

  getValueWithKey(key) {
    return this.variables[key];
  }

  setValueWithKey(key, value) {
    this.variables[key] = value;
  }

  // Draw order follows upstream: walls and targets, then balls, then bumpers on top.
  draw(renderer, include = () => true) {
    const rank = (e) => (e instanceof Ball ? 3 : e instanceof BumperElement ? 4 : 2);
    const items = [...this.elements.filter(include), ...this.balls].sort((a, b) => a.layer - b.layer || rank(a) - rank(b));
    for (const item of items) item.draw(this, renderer);
  }
}
