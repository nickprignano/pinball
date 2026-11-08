// Draws the table on a canvas in the site theme's colors, with a little fake depth: the table
// narrows toward the top, the ball shrinks as it rolls away and casts a shadow, and lit
// elements glow. Field coordinates have y pointing up; the canvas has y pointing down.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

import { WallArcElement, WallElement, WallPathElement } from './elements/walls.js';

const PERSPECTIVE = 0.1; // how much narrower the top of the table is than the bottom
const BALL_SHRINK = 0.15; // extra shrink for the ball at the top of the table
const ARC_SEGMENTS = 32;

// Walls that can never change are drawn once to an offscreen canvas.
function isStatic(e) {
  if (e.id) return false;
  if (e instanceof WallArcElement || e instanceof WallPathElement) return true;
  return e instanceof WallElement && e.kick <= 0.01 && !e.retractWhenHit && !e.disabled;
}

export class CanvasRenderer {
  constructor(canvas, palette) {
    this.canvas = canvas;
    this.palette = palette;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.staticCanvas = document.createElement('canvas');
  }

  setPalette(palette) {
    this.palette = palette;
    this.staticField = null;
  }

  // Fit the field into the canvas, keeping its proportions.
  layout(field) {
    const dpr = globalThis.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.canvas.width = this.staticCanvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = this.staticCanvas.height = Math.max(1, Math.round(h * dpr));
    this.scale = Math.min(this.canvas.width / field.width, this.canvas.height / field.height);
    this.centerX = this.canvas.width / 2;
    this.offsetY = (this.canvas.height - field.height * this.scale) / 2;
    this.fieldWidth = field.width;
    this.fieldHeight = field.height;
    this.lineWidth = Math.max(1, this.scale * 0.08);
    this.staticField = null;
  }

  depth(fy) {
    return 1 - PERSPECTIVE * Math.min(Math.max(fy / this.fieldHeight, 0), 1);
  }

  x(fx, fy) {
    return this.centerX + (fx - this.fieldWidth / 2) * this.scale * this.depth(fy);
  }

  y(fy) {
    return this.offsetY + (this.fieldHeight - fy) * this.scale;
  }

  frame(field) {
    if (this.staticField !== field) this.drawStatic(field);
    const ctx = (this.ctx = this.canvas.getContext('2d'));
    ctx.fillStyle = this.palette.tokens['--bg'];
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.staticCanvas, 0, 0);
    this.setupLines(ctx);
    field.draw(this, (e) => !isStatic(e));
    this.drawScoreAnimations(field);
    this.drawMessage(field);
  }

  drawStatic(field) {
    const ctx = (this.ctx = this.staticCanvas.getContext('2d'));
    ctx.clearRect(0, 0, this.staticCanvas.width, this.staticCanvas.height);
    this.setupLines(ctx);
    for (const e of field.elements) if (isStatic(e)) e.draw(field, this);
    this.staticField = field;
  }

  setupLines(ctx) {
    ctx.lineWidth = this.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  drawLine(x1, y1, x2, y2, color) {
    this.drawLinePath([x1, x2], [y1, y2], color);
  }

  drawLinePath(xs, ys, color) {
    const { ctx } = this;
    ctx.strokeStyle = this.palette.css(color);
    ctx.beginPath();
    xs.forEach((x, i) => (i ? ctx.lineTo(this.x(x, ys[i]), this.y(ys[i])) : ctx.moveTo(this.x(x, ys[i]), this.y(ys[i]))));
    ctx.stroke();
  }

  // Arcs go through the perspective too, so they're drawn as short segments.
  drawArc(cx, cy, rx, ry, start, end, color) {
    const xs = [];
    const ys = [];
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const a = start + ((end - start) * i) / ARC_SEGMENTS;
      xs.push(cx + rx * Math.cos(a));
      ys.push(cy + ry * Math.sin(a));
    }
    this.drawLinePath(xs, ys, color);
  }

  fillCircle(cx, cy, r, color, { ball = false } = {}) {
    const { ctx } = this;
    let radius = r * this.scale * this.depth(cy);
    if (ball && !this.reducedMotion) {
      radius *= 1 - BALL_SHRINK * Math.min(Math.max(cy / this.fieldHeight, 0), 1);
      if (r > 0.3) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.arc(this.x(cx, cy) + radius * 0.35, this.y(cy) + radius * 0.45, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const css = this.palette.css(color);
    ctx.fillStyle = css;
    if (!ball && !this.reducedMotion) {
      ctx.shadowColor = css;
      ctx.shadowBlur = radius * 0.8;
    }
    ctx.beginPath();
    ctx.arc(this.x(cx, cy), this.y(cy), radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  frameCircle(cx, cy, r, color) {
    const { ctx } = this;
    ctx.strokeStyle = this.palette.css(color);
    ctx.beginPath();
    ctx.arc(this.x(cx, cy), this.y(cy), r * this.scale * this.depth(cy), 0, Math.PI * 2);
    ctx.stroke();
  }

  drawScoreAnimations(field) {
    const { ctx } = this;
    ctx.font = `600 ${Math.round(this.scale * 0.8)}px ${this.palette.tokens['--font'] || 'system-ui, sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = this.palette.tokens['--fg'];
    for (const a of field.scoreAnimations) {
      const t = (field.gameTimeMs - a.startMs) / 1000;
      ctx.globalAlpha = Math.max(0, 1 - t);
      const y = a.y + (this.reducedMotion ? 0 : t * 2);
      ctx.fillText(a.points.toLocaleString(), this.x(a.x, y), this.y(y));
    }
    ctx.globalAlpha = 1;
  }

  drawMessage(field) {
    if (!field.message) return;
    const { ctx } = this;
    const size = Math.round(this.scale * 1.2);
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const x = this.canvas.width / 2;
    const y = this.y(field.height * 0.55);
    const w = ctx.measureText(field.message.text).width + size * 1.5;
    ctx.fillStyle = this.palette.tokens['--bg'];
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - size, w, size * 2, size);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.palette.tokens['--fg'];
    ctx.fillText(field.message.text, x, y);
    ctx.textBaseline = 'alphabetic';
  }
}
