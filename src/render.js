// Draws the table on a canvas. Field coordinates have y pointing up; the canvas has y pointing down.
// This is the plain renderer; theme colors and fake depth come in a later change.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

const css = ([r, g, b, a]) => `rgba(${r},${g},${b},${a / 255})`;

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  // Fit the field into the canvas, keeping its proportions.
  layout(field) {
    const dpr = globalThis.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.scale = Math.min(this.canvas.width / field.width, this.canvas.height / field.height);
    this.offsetX = (this.canvas.width - field.width * this.scale) / 2;
    this.offsetY = (this.canvas.height - field.height * this.scale) / 2;
    this.fieldHeight = field.height;
    this.lineWidth = Math.max(1, this.scale * 0.08);
  }

  x(fx) {
    return this.offsetX + fx * this.scale;
  }

  y(fy) {
    return this.offsetY + (this.fieldHeight - fy) * this.scale;
  }

  frame(field) {
    const { ctx } = this;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.lineWidth = this.lineWidth;
    ctx.lineCap = 'round';
    field.draw(this);
    this.drawScoreAnimations(field);
    this.drawStatus(field);
  }

  drawLine(x1, y1, x2, y2, color) {
    const { ctx } = this;
    ctx.strokeStyle = css(color);
    ctx.beginPath();
    ctx.moveTo(this.x(x1), this.y(y1));
    ctx.lineTo(this.x(x2), this.y(y2));
    ctx.stroke();
  }

  drawLinePath(xs, ys, color) {
    const { ctx } = this;
    ctx.strokeStyle = css(color);
    ctx.beginPath();
    xs.forEach((x, i) => (i ? ctx.lineTo(this.x(x), this.y(ys[i])) : ctx.moveTo(this.x(x), this.y(ys[i]))));
    ctx.stroke();
  }

  drawArc(cx, cy, rx, ry, start, end, color) {
    const { ctx } = this;
    ctx.strokeStyle = css(color);
    ctx.beginPath();
    // Flipping y reverses the direction of angles.
    ctx.ellipse(this.x(cx), this.y(cy), rx * this.scale, ry * this.scale, 0, -end, -start);
    ctx.stroke();
  }

  fillCircle(cx, cy, r, color) {
    const { ctx } = this;
    ctx.fillStyle = css(color);
    ctx.beginPath();
    ctx.arc(this.x(cx), this.y(cy), r * this.scale, 0, Math.PI * 2);
    ctx.fill();
  }

  frameCircle(cx, cy, r, color) {
    const { ctx } = this;
    ctx.strokeStyle = css(color);
    ctx.beginPath();
    ctx.arc(this.x(cx), this.y(cy), r * this.scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawScoreAnimations(field) {
    const { ctx } = this;
    ctx.font = `${Math.round(this.scale * 0.8)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    for (const a of field.scoreAnimations) {
      const t = (field.gameTimeMs - a.startMs) / 1000;
      ctx.fillStyle = `rgba(255,255,160,${1 - t})`;
      ctx.fillText(String(a.points), this.x(a.x), this.y(a.y + t * 2));
    }
  }

  drawStatus(field) {
    const { ctx } = this;
    const size = Math.round(this.scale * 1.1);
    ctx.font = `${size}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(field.state.score.toLocaleString(), this.x(0.5), this.y(field.height - 1.5));
    ctx.textAlign = 'right';
    const s = field.state;
    const status = s.inProgress ? `Ball ${s.ballNumber}  ${s.multiplier}x` : 'Tap or press a key to start';
    ctx.fillText(status, this.x(field.width - 0.5), this.y(field.height - 1.5));
    if (field.message) {
      ctx.textAlign = 'center';
      ctx.fillText(field.message.text, this.x(field.width / 2), this.y(field.height / 2));
    }
  }
}
