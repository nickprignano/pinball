// Box2D body helpers, matching Vector Pinball's Box2DFactory so tables keep their tuning.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

import { Box, Circle, Vec2 } from '../vendor/planck.mjs';

export const DEFAULT_WALL_FRICTION = 0.2;

export function createCircle(world, x, y, radius, isStatic) {
  const body = world.createBody({
    type: isStatic ? 'static' : 'dynamic',
    position: Vec2(x, y),
    allowSleep: true,
  });
  body.createFixture(new Circle(radius), { density: 1, friction: 0.3, restitution: 0.6 });
  return body;
}

// A rectangle from (xmin, ymin) to (xmax, ymax), rotated counterclockwise by angle.
export function createWall(world, xmin, ymin, xmax, ymax, angle, restitution = 0, friction = DEFAULT_WALL_FRICTION) {
  const cx = (xmin + xmax) / 2;
  const cy = (ymin + ymax) / 2;
  const hx = Math.abs((xmax - xmin) / 2);
  const hy = Math.abs((ymax - ymin) / 2);
  const body = world.createBody({ type: 'static', position: Vec2(cx, cy), angle });
  body.createFixture(new Box(hx, hy), {
    density: 1,
    friction,
    restitution: restitution > 0 ? restitution : 0,
  });
  return body;
}

// A segment-like wall 0.1 thick from (x1, y1) to (x2, y2).
export function createThinWall(world, x1, y1, x2, y2, restitution = 0, friction = DEFAULT_WALL_FRICTION) {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const mag = Math.hypot(y2 - y1, x2 - x1);
  return createWall(world, cx - mag / 2, cy - 0.05, cx + mag / 2, cy + 0.05, angle, restitution, friction);
}
