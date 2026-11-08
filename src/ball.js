// A ball in play, after Vector Pinball's Ball class.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

import { createCircle } from './physics.js';

export class Ball {
  constructor(world, x, y, radius, primaryColor, secondaryColor) {
    this.layer = 0;
    this.radius = radius;
    this.primaryColor = primaryColor;
    this.secondaryColor = secondaryColor;
    this.mostRecentSensorId = null;
    this.body = createCircle(world, x, y, radius, false);
    this.body.setBullet(true);
    // Heavier or lighter balls keep the same mass as a 0.5-radius ball.
    this.body.getFixtureList().setDensity((0.5 * 0.5) / (radius * radius));
    this.body.resetMassData();
  }

  getPosition() {
    return this.body.getPosition();
  }

  getLinearVelocity() {
    return this.body.getLinearVelocity();
  }

  applyLinearImpulse(impulse) {
    this.body.applyLinearImpulse(impulse, this.body.getWorldCenter(), true);
  }

  draw(field, renderer) {
    const c = this.getPosition();
    renderer.fillCircle(c.x, c.y, this.radius, this.primaryColor, { ball: true });
    const angle = this.body.getAngle();
    renderer.fillCircle(
      c.x + (this.radius / 2) * Math.cos(angle),
      c.y + (this.radius / 2) * Math.sin(angle),
      this.radius / 4,
      this.secondaryColor,
      { ball: true },
    );
  }

  destroy() {
    this.body.getWorld().destroyBody(this.body);
  }
}
