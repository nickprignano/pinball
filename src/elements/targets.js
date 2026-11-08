// DropTargetGroupElement and RolloverGroupElement, after Vector Pinball's classes of the same names.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

import { createThinWall } from '../physics.js';
import { color, num, nums, rgb } from '../util.js';
import { FieldElement } from './base.js';

const DEFAULT_COLOR = rgb(0, 255, 0);

export class DropTargetGroupElement extends FieldElement {
  constructor(params) {
    super(params);
    if (params.positions?.length) {
      this.positions = params.positions.map((p) => nums(p));
    } else {
      // Targets laid out along a wall.
      const [sx, sy] = nums(params.wallStart);
      const [ex, ey] = nums(params.wallEnd);
      const gap = num(params.gapFromWall);
      const start = num(params.startDistanceAlongWall);
      const width = num(params.targetWidth);
      const between = num(params.gapBetweenTargets);
      const wallAngle = Math.atan2(ey - sy, ex - sx);
      const perp = wallAngle + Math.PI / 2;
      const gx = gap * Math.cos(perp);
      const gy = gap * Math.sin(perp);
      this.positions = [];
      for (let i = 0; i < num(params.numTargets); i++) {
        const a = start + i * (width + between);
        const b = a + width;
        this.positions.push([
          sx + a * Math.cos(wallAngle) + gx,
          sy + a * Math.sin(wallAngle) + gy,
          sx + b * Math.cos(wallAngle) + gx,
          sy + b * Math.sin(wallAngle) + gy,
        ]);
      }
    }
  }

  createBodies(world) {
    this.bodies = this.positions.map(([x1, y1, x2, y2]) => createThinWall(world, x1, y1, x2, y2, 0));
  }

  allTargetsHit() {
    return this.bodies.every((b) => !b.isActive());
  }

  handleCollision(ball, body, field) {
    body.setActive(false);
    if (this.allTargetsHit()) {
      field.delegate.allDropTargetsInGroupHit?.(field, this, ball);
      const resetSeconds = num(this.params.reset);
      if (resetSeconds > 0) field.scheduleAction(resetSeconds * 1000, () => this.makeAllTargetsVisible());
    }
  }

  makeAllTargetsVisible() {
    for (const b of this.bodies) b.setActive(true);
  }

  draw(field, renderer) {
    const c = this.currentColor(DEFAULT_COLOR);
    this.bodies.forEach((b, i) => {
      if (b.isActive()) {
        const [x1, y1, x2, y2] = this.positions[i];
        renderer.drawLine(x1, y1, x2, y2, c);
      }
    });
  }
}

export class RolloverGroupElement extends FieldElement {
  constructor(params) {
    super(params);
    this.canToggleOff = params.toggleOff === true;
    this.cycleOnFlipper = params.cycleOnFlipper === true;
    this.ignoreBall = params.ignoreBall === true;
    this.visible = true;
    const defaultRadius = num(params.radius);
    const defaultReset = num(params.reset);
    this.rollovers = params.rollovers.map((r) => {
      const [x, y] = nums(r.position);
      const radius = r.radius != null ? num(r.radius) : defaultRadius;
      return {
        x,
        y,
        radius,
        radiusSquared: radius * radius,
        color: color(r.color),
        score: r.score != null ? num(r.score) : this.score,
        resetDelay: r.reset != null ? num(r.reset) : defaultReset,
      };
    });
    this.active = new Set();
    this.hitOnPreviousTick = new Set();
  }

  rolloversHitByBall(ball) {
    if (ball.layer !== this.layer) return [];
    const p = ball.getPosition();
    return this.rollovers.filter((r) => (p.x - r.x) ** 2 + (p.y - r.y) ** 2 <= r.radiusSquared);
  }

  allRolloversActive() {
    return this.active.size === this.rollovers.length;
  }

  activateFirstUnactivatedRollover() {
    const r = this.rollovers.find((r) => !this.active.has(r));
    if (r) this.active.add(r);
  }

  numberOfRollovers() {
    return this.rollovers.length;
  }

  isRolloverActiveAtIndex(i) {
    return this.active.has(this.rollovers[i]);
  }

  setRolloverActiveAtIndex(i, isActive) {
    if (isActive) this.active.add(this.rollovers[i]);
    else this.active.delete(this.rollovers[i]);
  }

  getRolloverCenterAtIndex(i) {
    return { x: this.rollovers[i].x, y: this.rollovers[i].y };
  }

  setRolloverCenterAtIndex(i, x, y) {
    this.rollovers[i].x = x;
    this.rollovers[i].y = y;
  }

  getRolloverRadiusAtIndex(i) {
    return this.rollovers[i].radius;
  }

  setRolloverRadiusAtIndex(i, radius) {
    this.rollovers[i].radius = radius;
    this.rollovers[i].radiusSquared = radius * radius;
  }

  setRolloverColorAtIndex(i, value) {
    this.rollovers[i].color = value;
  }

  setAllRolloversActivated(isActive) {
    this.active = new Set(isActive ? this.rollovers : []);
  }

  setIgnoreBall(value) {
    this.ignoreBall = value;
  }

  setVisible(value) {
    this.visible = value;
  }

  tick(field, ms) {
    super.tick(field, ms);
    if (this.ignoreBall) return;
    const allActivePrevious = this.allRolloversActive();
    const allHit = new Set();
    for (const ball of field.getBalls()) {
      for (const r of this.rolloversHitByBall(ball)) {
        if (allHit.has(r)) continue;
        allHit.add(r);
        if (this.hitOnPreviousTick.has(r)) continue;
        if (!this.active.has(r)) {
          this.active.add(r);
          if (r.score !== 0) field.addScoreWithAnimation(r.score, ball.getPosition());
          field.audio.play('rollover');
          if (r.resetDelay > 0) field.scheduleAction(r.resetDelay * 1000, () => this.active.delete(r));
          if (!allActivePrevious && this.allRolloversActive()) {
            field.delegate.allRolloversInGroupActivated?.(field, this, ball);
          }
        } else if (this.canToggleOff) {
          this.active.delete(r);
          if (r.score !== 0) field.addScoreWithAnimation(r.score, ball.getPosition());
          field.audio.play('rollover');
        }
      }
    }
    this.hitOnPreviousTick = allHit;
  }

  flippersActivated(field, flippers) {
    if (this.cycleOnFlipper) this.cycleRollovers(flippers.some((f) => f.isRightFlipper()));
  }

  cycleRollovers(toRight) {
    const n = this.rollovers.length;
    const next = new Set();
    for (let i = 0; i < n; i++) {
      const prev = toRight ? (i + n - 1) % n : (i + 1) % n;
      if (this.active.has(this.rollovers[prev])) next.add(this.rollovers[i]);
    }
    this.active = next;
  }

  draw(field, renderer) {
    if (!this.visible) return;
    const groupColor = this.currentColor(DEFAULT_COLOR);
    for (const r of this.rollovers) {
      if (!this.active.has(r)) renderer.frameCircle(r.x, r.y, r.radius, r.color ?? groupColor);
    }
    for (const r of this.rollovers) {
      if (this.active.has(r)) renderer.fillCircle(r.x, r.y, r.radius, r.color ?? groupColor);
    }
  }
}
