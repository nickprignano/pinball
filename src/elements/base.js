// Base class for table elements, after Vector Pinball's FieldElement.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

import { color, inverse, num, rgb } from '../util.js';

export const DEFAULT_WALL_COLOR = rgb(64, 64, 160);

export class FieldElement {
  constructor(params) {
    this.params = params;
    this.id = params.id ?? '';
    this.initialColor = color(params.color);
    this.newColor = null;
    this.score = num(params.score);
    this.layer = num(params.layer);
    this.flashMs = 0;
    this.bodies = [];
  }

  // Subclasses create their Box2D bodies here.
  createBodies(world) {}

  tick(field, ms) {
    if (this.flashMs > 0) this.flashMs = Math.max(this.flashMs - ms, 0);
  }

  flippersActivated(field, flippers) {}

  handleCollision(ball, body, field) {}

  draw(field, renderer) {}

  flashForMs(ms) {
    this.flashMs = ms;
  }

  setNewColor(value) {
    this.newColor = value;
  }

  getElementId() {
    return this.id;
  }

  getScore() {
    return this.score;
  }

  setScore(value) {
    this.score = value;
  }

  currentColor(defaultColor) {
    const base = this.newColor ?? this.initialColor ?? defaultColor;
    return this.flashMs > 0 ? inverse(base) : base;
  }
}
