// WallElement, WallArcElement and WallPathElement, after Vector Pinball's classes of the same names.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

import { Vec2 } from '../../vendor/planck.mjs';
import { createThinWall, DEFAULT_WALL_FRICTION } from '../physics.js';
import { num, nums, toRadians } from '../util.js';
import { DEFAULT_WALL_COLOR, FieldElement } from './base.js';

export class WallElement extends FieldElement {
  constructor(params) {
    super(params);
    [this.x1, this.y1, this.x2, this.y2] = nums(params.position);
    this.restitution = num(params.restitution);
    this.friction = num(params.friction, DEFAULT_WALL_FRICTION);
    this.kick = num(params.kick);
    this.killBall = params.kill === true;
    this.retractWhenHit = params.retractWhenHit === true;
    this.disabled = params.disabled === true;
    this.ignoreBall = params.ignoreBall === true;
    this.visible = true;
  }

  createBodies(world) {
    if (this.ignoreBall) return;
    this.body = createThinWall(world, this.x1, this.y1, this.x2, this.y2, this.restitution, this.friction);
    this.bodies = [this.body];
    if (this.disabled) this.setRetracted(true);
  }

  isRetracted() {
    return this.body != null && !this.body.isActive();
  }

  setRetracted(retracted) {
    if (this.body && retracted !== this.isRetracted()) this.body.setActive(!retracted);
  }

  setVisible(visible) {
    this.visible = visible;
  }

  impulseForBall(ball) {
    if (this.kick <= 0.01) return null;
    let ix = this.y2 - this.y1;
    let iy = this.x1 - this.x2;
    const scale = this.kick / Math.hypot(ix, iy);
    ix *= scale;
    iy *= scale;
    const pos = ball.getPosition();
    if ((pos.x - this.x1) * ix + (pos.y - this.y1) * iy < 0) {
      ix = -ix;
      iy = -iy;
    }
    return Vec2(ix, iy);
  }

  handleCollision(ball, body, field) {
    if (this.retractWhenHit) this.setRetracted(true);
    if (this.killBall) {
      field.removeBall(ball);
    } else {
      const impulse = this.impulseForBall(ball);
      if (impulse) {
        ball.applyLinearImpulse(impulse);
        this.flashForMs(100);
      }
    }
  }

  draw(field, renderer) {
    if (!this.visible || this.isRetracted()) return;
    renderer.drawLine(this.x1, this.y1, this.x2, this.y2, this.currentColor(DEFAULT_WALL_COLOR));
  }
}

// Builds thin walls between consecutive points.
class WallPolyline extends FieldElement {
  createBodies(world) {
    if (this.params.ignoreBall === true) return;
    const restitution = num(this.params.restitution);
    const friction = num(this.params.friction, DEFAULT_WALL_FRICTION);
    for (let i = 1; i < this.xs.length; i++) {
      this.bodies.push(createThinWall(world, this.xs[i - 1], this.ys[i - 1], this.xs[i], this.ys[i], restitution, friction));
    }
  }

  draw(field, renderer) {
    renderer.drawLinePath(this.xs, this.ys, this.currentColor(DEFAULT_WALL_COLOR));
  }
}

export class WallArcElement extends WallPolyline {
  constructor(params) {
    super(params);
    [this.cx, this.cy] = nums(params.center);
    if (params.radius != null) {
      this.rx = this.ry = num(params.radius);
    } else {
      this.rx = num(params.xradius);
      this.ry = num(params.yradius);
    }
    const segments = params.segments != null ? Math.trunc(num(params.segments)) : 5;
    this.startAngle = toRadians(num(params.minangle));
    this.endAngle = toRadians(num(params.maxangle));
    const diff = this.endAngle - this.startAngle;
    this.xs = [];
    this.ys = [];
    for (let i = 0; i <= segments; i++) {
      const angle = this.startAngle + (i * diff) / segments;
      this.xs.push(this.cx + this.rx * Math.cos(angle));
      this.ys.push(this.cy + this.ry * Math.sin(angle));
    }
  }

  draw(field, renderer) {
    renderer.drawArc(this.cx, this.cy, this.rx, this.ry, this.startAngle, this.endAngle, this.currentColor(DEFAULT_WALL_COLOR));
  }
}

export class WallPathElement extends WallPolyline {
  constructor(params) {
    super(params);
    this.xs = params.positions.map((p) => num(p[0]));
    this.ys = params.positions.map((p) => num(p[1]));
  }
}
