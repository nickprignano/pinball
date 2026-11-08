// FlipperElement, after Vector Pinball's class of the same name: a motor-driven revolute joint.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

import { RevoluteJoint, Vec2 } from '../../vendor/planck.mjs';
import { createCircle, createWall } from '../physics.js';
import { num, nums, rgb, toRadians } from '../util.js';
import { FieldElement } from './base.js';

const DEFAULT_COLOR = rgb(0, 255, 0);

export class FlipperElement extends FieldElement {
  constructor(params) {
    super(params);
    [this.cx, this.cy] = nums(params.position);
    this.length = num(params.length);
    this.upspeed = num(params.upspeed);
    this.downspeed = num(params.downspeed);
    const minAngle = toRadians(num(params.minangle));
    const maxAngle = toRadians(num(params.maxangle));
    this.downAngle = this.isReversed() ? -minAngle : minAngle;
    this.upAngle = this.isReversed() ? -maxAngle : maxAngle;
  }

  isReversed() {
    return this.length < 0;
  }

  isLeftFlipper() {
    return !this.isReversed();
  }

  isRightFlipper() {
    return this.isReversed();
  }

  createBodies(world) {
    this.anchorBody = createCircle(world, this.cx, this.cy, 0.05, true);
    const ext = this.isReversed() ? 0.05 : -0.05;
    const cos = Math.cos(this.downAngle);
    const sin = Math.sin(this.downAngle);
    const midX = (this.cx + ext * cos + this.cx + this.length * cos) / 2;
    const midY = (this.cy + ext * sin + this.cy + this.length * sin) / 2;
    const bodyLength = Math.abs(this.length) + Math.abs(ext);
    this.body = createWall(world, midX - bodyLength / 2, midY - 0.12, midX + bodyLength / 2, midY + 0.12, this.downAngle);
    this.body.setDynamic();
    this.body.setBullet(true);
    this.body.getFixtureList().setDensity(5);
    this.body.resetMassData();

    const range = this.upAngle - this.downAngle;
    this.lowerAngle = this.isReversed() ? range : 0;
    this.upperAngle = this.isReversed() ? 0 : range;
    this.joint = world.createJoint(
      new RevoluteJoint(
        {
          enableLimit: true,
          enableMotor: true,
          lowerAngle: this.lowerAngle,
          upperAngle: this.upperAngle,
          maxMotorTorque: 1000,
        },
        this.anchorBody,
        this.body,
        Vec2(this.cx, this.cy),
      ),
    );
    this.bodies = [this.body];
    this.setEffectiveMotorSpeed(-this.downspeed);
  }

  getEffectiveMotorSpeed() {
    const speed = this.joint.getMotorSpeed();
    return this.isReversed() ? -speed : speed;
  }

  setEffectiveMotorSpeed(speed) {
    this.joint.setMotorSpeed(this.isReversed() ? -speed : speed);
  }

  tick(field, ms) {
    super.tick(field, ms);
    // Slow the motor near the top so the flipper doesn't bounce against its limit.
    if (this.getEffectiveMotorSpeed() > 0.5) {
      const top = this.isReversed() ? this.lowerAngle : this.upperAngle;
      if (Math.abs(top - this.joint.getJointAngle()) < 0.05) this.setEffectiveMotorSpeed(0.5);
    }
  }

  isFlipperEngaged() {
    return this.getEffectiveMotorSpeed() > 0;
  }

  setFlipperEngaged(active) {
    if (active !== this.isFlipperEngaged()) {
      this.setEffectiveMotorSpeed(active ? this.upspeed : -this.downspeed);
    }
  }

  draw(field, renderer) {
    const pos = this.anchorBody.getPosition();
    const jointAngle = Math.min(Math.max(this.joint.getJointAngle(), this.lowerAngle), this.upperAngle);
    const angle = this.downAngle + jointAngle;
    renderer.drawLine(
      pos.x,
      pos.y,
      pos.x + this.length * Math.cos(angle),
      pos.y + this.length * Math.sin(angle),
      this.currentColor(DEFAULT_COLOR),
    );
  }
}
