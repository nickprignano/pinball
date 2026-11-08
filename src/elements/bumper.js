// BumperElement, after Vector Pinball's class of the same name.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

import { Vec2 } from '../../vendor/planck.mjs';
import { createCircle } from '../physics.js';
import { color, inverse, num, nums, rgb } from '../util.js';
import { FieldElement } from './base.js';

const DEFAULT_COLOR = rgb(0, 0, 255);
const DEFAULT_OUTER_COLOR = rgb(0, 0, 255, 128);

export class BumperElement extends FieldElement {
  constructor(params) {
    super(params);
    [this.cx, this.cy] = nums(params.position);
    this.radius = num(params.radius);
    this.outerRadius = num(params.outerRadius);
    this.kick = num(params.kick);
    this.outerColor = color(params.outerColor, DEFAULT_OUTER_COLOR);
    this.newOuterColor = null;
  }

  createBodies(world) {
    if (this.radius > 0) {
      this.body = createCircle(world, this.cx, this.cy, this.radius, true);
      this.bodies = [this.body];
    }
  }

  handleCollision(ball, body, field) {
    if (this.kick <= 0.01) return;
    const pos = ball.getPosition();
    const center = this.body.getPosition();
    const ix = pos.x - center.x;
    const iy = pos.y - center.y;
    const scale = this.kick / Math.hypot(ix, iy);
    ball.applyLinearImpulse(Vec2(ix * scale, iy * scale));
    this.flashForMs(100);
  }

  getCenter() {
    return { x: this.cx, y: this.cy };
  }

  setCenter(cx, cy) {
    this.cx = cx;
    this.cy = cy;
    if (this.body) this.body.setTransform(Vec2(cx, cy), this.body.getAngle());
  }

  setNewOuterColor(value) {
    this.newOuterColor = value;
  }

  draw(field, renderer) {
    if (this.outerRadius > 0) {
      const outer = this.newOuterColor ?? this.outerColor;
      renderer.fillCircle(this.cx, this.cy, this.outerRadius, this.flashMs > 0 ? inverse(outer) : outer);
    }
    if (this.radius > 0) {
      renderer.fillCircle(this.cx, this.cy, this.radius, this.currentColor(DEFAULT_COLOR));
    }
  }
}
