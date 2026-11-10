// Playfield art for the 3D view, painted in code into a canvas and used as the playfield texture.
// A table can have tables/<id>.art.js (listed with "art": true in tables/index.json) exporting `paint(p)` (and optionally `plastic`, the color
// of its raised plastics). p gives the canvas context and helpers that take field units:
// X(fx) and Y(fy) for positions (y up the table), S(n) for lengths, plus field, name and rnd().
// After the table's own art, every table gets soft shadows around its walls and bumpers and a
// socket under each rollover light.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

import { BumperElement } from '../elements/bumper.js';
import { RolloverGroupElement } from '../elements/targets.js';
import { seededRandom } from '../util.js';
import { wallSegments } from './geometry.js';

export const DEFAULT_PLASTIC = '#3b4fb8';

// entry is the table's line in tables/index.json; "art": true says it has an art file.
export async function loadArt(entry) {
  if (!entry.art) return {};
  try {
    return await import(`../../tables/${entry.id}.art.js`);
  } catch {
    return {};
  }
}

// Draws the playfield at pxPerUnit pixels per field unit and returns the canvas.
export function paintPlayfield(field, art, pxPerUnit, name = '') {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(field.width * pxPerUnit);
  canvas.height = Math.round(field.height * pxPerUnit);
  const ctx = canvas.getContext('2d');
  const p = {
    ctx,
    field,
    name,
    width: field.width,
    height: field.height,
    X: (fx) => fx * pxPerUnit,
    Y: (fy) => (field.height - fy) * pxPerUnit,
    S: (n) => n * pxPerUnit,
    rnd: seededRandom(1),
  };
  (art.paint ?? paintDefault)(p);
  paintShadows(p);
  paintSockets(p);
  return canvas;
}

function paintDefault({ ctx, name, X, Y, S, width, height }) {
  const g = ctx.createLinearGradient(0, Y(height), 0, Y(0));
  g.addColorStop(0, '#101830');
  g.addColorStop(1, '#0a0d18');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.font = `800 ${S(1)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(230, 237, 243, 0.85)';
  ctx.fillText(name.toUpperCase(), X(width / 2), Y(5));
}

// Light falls from above, so everything standing on the playfield darkens it nearby.
function paintShadows({ ctx, field, X, Y, S }) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.lineWidth = S(0.35);
  ctx.filter = `blur(${Math.max(1, S(0.12))}px)`;
  ctx.beginPath();
  for (const s of wallSegments(field)) {
    if (s.element.params.ignoreBall === true) continue;
    ctx.moveTo(X(s.x1), Y(s.y1));
    ctx.lineTo(X(s.x2), Y(s.y2));
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  for (const e of field.elements) {
    if (!(e instanceof BumperElement)) continue;
    ctx.beginPath();
    ctx.arc(X(e.cx), Y(e.cy), S(Math.max(e.radius, e.outerRadius) + 0.15), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintSockets({ ctx, field, X, Y, S }) {
  ctx.save();
  ctx.lineWidth = Math.max(1, S(0.05));
  for (const e of field.elements) {
    if (!(e instanceof RolloverGroupElement)) continue;
    for (const r of e.rollovers) {
      ctx.beginPath();
      ctx.arc(X(r.x), Y(r.y), S(r.radius * 1.12), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.stroke();
    }
  }
  ctx.restore();
}
