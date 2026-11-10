// Plain math for the 3D view, kept free of three.js so Node tests can check it: where things go,
// how big the solid parts are next to their physics bodies, which areas the ball can never reach,
// and how fast a light may flash.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

import { BumperElement } from '../elements/bumper.js';
import { FlipperElement } from '../elements/flipper.js';
import { SensorElement } from '../elements/sensor.js';
import { DropTargetGroupElement, RolloverGroupElement } from '../elements/targets.js';
import { WallArcElement, WallElement, WallPathElement } from '../elements/walls.js';

// Element types the 3D view can draw. A table using any other type can't be shown in 3D.
export const PART_TYPES = [
  WallElement, WallPathElement, WallArcElement, BumperElement, FlipperElement,
  DropTargetGroupElement, RolloverGroupElement, SensorElement,
];
export const hasPart = (element) => PART_TYPES.some((type) => element.constructor === type);

// Sizes of the solid parts, in field units. Physics walls are 0.1 thick and flippers 0.24 wide
// (src/physics.js, src/elements/flipper.js); nothing solid may stick out more than 0.05 past them.
export const SIZES = {
  railHalfWidth: 0.08,
  railHeight: 0.55,
  dropTargetHalfThickness: 0.07,
  flipperPivotRadius: 0.14,
  flipperTipRadius: 0.1,
  plasticHeight: 0.6,
  cell: 0.05, // grid size for finding the raised plastics
};
export const FOOTPRINT_TOLERANCE = 0.05;

// Field coordinates have y pointing up the table; the 3D world has x across, y up off the
// playfield and z toward the player.
export function toWorld(field, fx, fy) {
  return { x: fx - field.width / 2, z: field.height / 2 - fy };
}

// Every straight wall piece, with the element it belongs to.
export function wallSegments(field) {
  const segments = [];
  for (const element of field.elements) {
    if (element instanceof WallElement) {
      segments.push({ element, index: 0, x1: element.x1, y1: element.y1, x2: element.x2, y2: element.y2 });
    } else if (element instanceof WallPathElement || element instanceof WallArcElement) {
      for (let i = 1; i < element.xs.length; i++) {
        segments.push({ element, index: i - 1, x1: element.xs[i - 1], y1: element.ys[i - 1], x2: element.xs[i], y2: element.ys[i] });
      }
    }
  }
  return segments;
}

// A wall that's always there blocks the ball for good. Walls with an id can be retracted by the
// rules, and some retract or vanish on their own.
const isFixedWall = (e) => !e.id && !e.retractWhenHit && !e.disabled && e.params.ignoreBall !== true;

// Marks every grid cell the ball can never touch. Walls are drawn into a grid; the ball's centre
// can only be where it's at least a ball radius from every wall, so the fill from the launch
// position goes only there, and anything further than a radius from every place the centre can
// reach is raised as plastic. Gaps narrower than the ball stay closed, like the strip between an
// outlane guide and the drain. Returns { nx, ny, cell, solid } with solid[j * nx + i] = 1 for
// raised cells, j counting up the table.
export function solidCells(field, cell = SIZES.cell) {
  const nx = Math.ceil(field.width / cell);
  const ny = Math.ceil(field.height / cell);
  const wall = new Uint8Array(nx * ny);
  const mark = (x, y) => {
    const i = Math.floor(x / cell);
    const j = Math.floor(y / cell);
    if (i >= 0 && j >= 0 && i < nx && j < ny) wall[j * nx + i] = 1;
  };
  for (const s of wallSegments(field)) {
    if (!isFixedWall(s.element)) continue;
    const steps = Math.ceil(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / (cell / 3)) + 1;
    for (let k = 0; k <= steps; k++) mark(s.x1 + ((s.x2 - s.x1) * k) / steps, s.y1 + ((s.y2 - s.y1) * k) / steps);
  }
  // The centre must stay a full radius from each wall's centre line (a little closer than the
  // physics allows, since walls are 0.1 thick); touching reaches one cell further, for the grid.
  const radius = field.ballRadius;
  const fromWalls = distances(wall, nx, ny, cell);
  const reached = new Uint8Array(nx * ny);
  const [lx, ly] = field.launchPosition;
  const stack = [Math.floor(ly / cell) * nx + Math.floor(lx / cell)];
  while (stack.length) {
    const c = stack.pop();
    if (reached[c] || fromWalls[c] < radius) continue;
    reached[c] = 1;
    const i = c % nx;
    if (i > 0) stack.push(c - 1);
    if (i < nx - 1) stack.push(c + 1);
    if (c >= nx) stack.push(c - nx);
    if (c < nx * (ny - 1)) stack.push(c + nx);
  }
  const fromReached = distances(reached, nx, ny, cell);
  const solid = new Uint8Array(nx * ny);
  for (let c = 0; c < solid.length; c++) solid[c] = fromReached[c] > radius + cell ? 1 : 0;
  return { nx, ny, cell, solid };
}

// Approximate distance from each cell to the nearest seed cell (two-pass chamfer).
function distances(seed, nx, ny, cell) {
  const d = new Float32Array(nx * ny);
  for (let c = 0; c < d.length; c++) d[c] = seed[c] ? 0 : Infinity;
  const diagonal = cell * Math.SQRT2;
  const relax = (c, other, step) => {
    if (d[other] + step < d[c]) d[c] = d[other] + step;
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      if (i > 0) relax(c, c - 1, cell);
      if (j > 0) {
        relax(c, c - nx, cell);
        if (i > 0) relax(c, c - nx - 1, diagonal);
        if (i < nx - 1) relax(c, c - nx + 1, diagonal);
      }
    }
  }
  for (let j = ny - 1; j >= 0; j--) {
    for (let i = nx - 1; i >= 0; i--) {
      const c = j * nx + i;
      if (i < nx - 1) relax(c, c + 1, cell);
      if (j < ny - 1) {
        relax(c, c + nx, cell);
        if (i < nx - 1) relax(c, c + nx + 1, diagonal);
        if (i > 0) relax(c, c + nx - 1, diagonal);
      }
    }
  }
  return d;
}

// Heights at the grid's corners: a corner is raised only when every cell around it is solid, so
// slopes stay inside the walls and the ball never rolls through them.
export function cornerHeights({ nx, ny, solid }, height = SIZES.plasticHeight) {
  const heights = new Float32Array((nx + 1) * (ny + 1));
  const isSolid = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? 1 : solid[j * nx + i]);
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const raised = isSolid(i - 1, j - 1) && isSolid(i, j - 1) && isSolid(i - 1, j) && isSolid(i, j);
      heights[j * (nx + 1) + i] = raised ? height : 0;
    }
  }
  // Soften the grid's stair steps: each raised corner takes the average of its neighbours, but
  // never rises, so the plastics' footprint doesn't grow.
  const smooth = new Float32Array(heights.length);
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      let sum = 0;
      let count = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii > nx || jj > ny) continue;
          sum += heights[jj * (nx + 1) + ii];
          count++;
        }
      }
      const k = j * (nx + 1) + i;
      smooth[k] = Math.min(heights[k], sum / count);
    }
  }
  return smooth;
}

// Flash safety: a light may rise at most once every 333 ms (no more than 3 flashes a second),
// easing up and down instead of blinking. state is { level, target, lastRiseMs }; call it every
// frame with whether the light should be on. With reduced motion there are no flares: the light
// shows its steady state only.
export const MIN_RISE_INTERVAL_MS = 333;
const RISE_MS = 80;
const FALL_MS = 220;

export function newLight() {
  return { level: 0, target: 0, lastRiseMs: -Infinity };
}

export function stepLight(state, on, nowMs, dtMs) {
  if (on && state.target === 0 && nowMs - state.lastRiseMs >= MIN_RISE_INTERVAL_MS) {
    state.target = 1;
    state.lastRiseMs = nowMs;
  } else if (!on && state.target === 1 && nowMs - state.lastRiseMs >= RISE_MS) {
    state.target = 0;
  }
  if (state.target > state.level) state.level = Math.min(state.target, state.level + dtMs / RISE_MS);
  else state.level = Math.max(state.target, state.level - dtMs / FALL_MS);
  return state.level;
}
