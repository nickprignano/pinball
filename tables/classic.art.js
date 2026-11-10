// Playfield art for Classic in the 3D view: an old-school sunburst behind the extra-ball rollovers,
// a star under the pop bumpers and chevrons up the left lane. Original art, drawn in code.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

export const plastic = '#7a1d3b';

export function paint({ ctx, X, Y, S, width, height, rnd }) {
  const { canvas } = ctx;
  const back = ctx.createLinearGradient(0, Y(height), 0, Y(0));
  back.addColorStop(0, '#160b2e');
  back.addColorStop(0.5, '#2c0b24');
  back.addColorStop(1, '#3a1206');
  ctx.fillStyle = back;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Sunburst rays from the extra-ball rollovers.
  const [cx, cy] = [9.4, 10];
  const rays = 28;
  for (let i = 0; i < rays; i += 2) {
    const a1 = (i / rays) * Math.PI * 2;
    const a2 = ((i + 1) / rays) * Math.PI * 2;
    const g = ctx.createRadialGradient(X(cx), Y(cy), S(3), X(cx), Y(cy), S(16));
    g.addColorStop(0, 'rgba(255, 170, 60, 0.2)');
    g.addColorStop(1, 'rgba(255, 170, 60, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(X(cx), Y(cy));
    ctx.arc(X(cx), Y(cy), S(16), a1, a2);
    ctx.closePath();
    ctx.fill();
  }
  // Gold rings around them.
  ctx.strokeStyle = 'rgba(255, 196, 80, 0.75)';
  for (const [r, w] of [[3.4, 0.08], [3.75, 0.04]]) {
    ctx.lineWidth = S(w);
    ctx.beginPath();
    ctx.arc(X(cx), Y(cy), S(r), 0, Math.PI * 2);
    ctx.stroke();
  }

  // Warm light pools.
  for (const [x, y, r, color] of [
    [8, 20.5, 6, 'rgba(255, 60, 140, 0.22)'],
    [cx, cy, 4, 'rgba(255, 200, 90, 0.18)'],
    [12, 27.2, 4, 'rgba(80, 160, 255, 0.16)'],
  ]) {
    const glow = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), S(r));
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // A big star under the pop bumpers.
  star(ctx, X(8.2), Y(20.6), S(4.4), S(1.9), -0.1);
  ctx.fillStyle = 'rgba(255, 70, 150, 0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 196, 80, 0.6)';
  ctx.lineWidth = S(0.06);
  ctx.stroke();

  // Sparkles.
  ctx.fillStyle = 'rgba(255, 236, 200, 0.75)';
  for (let i = 0; i < 70; i++) {
    const r = S(0.05 + rnd() * 0.1);
    star(ctx, rnd() * canvas.width, rnd() * canvas.height, r * 2.5, r * 0.5, 0, 4);
    ctx.fill();
  }

  // Chevrons up the left lane, pointing the way.
  ctx.fillStyle = 'rgba(255, 196, 80, 0.6)';
  for (const [x, y, angle] of [[1.5, 17.4, 0], [1.25, 21.2, -0.2], [2.0, 25.1, -0.5]]) {
    chevron(ctx, X(x), Y(y), S(0.5), angle);
  }

  // The table's name.
  ctx.font = `italic 900 ${S(1.15)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  const name = ctx.createLinearGradient(0, Y(5.8), 0, Y(4.4));
  name.addColorStop(0, '#fff3c4');
  name.addColorStop(1, '#f59e0b');
  ctx.lineWidth = S(0.12);
  ctx.strokeStyle = '#3a0a10';
  ctx.strokeText('CLASSIC', X(width / 2 - 0.5), Y(4.8));
  ctx.fillStyle = name;
  ctx.fillText('CLASSIC', X(width / 2 - 0.5), Y(4.8));
}

// A star path with `points` points, outer and inner radius in pixels.
function star(ctx, x, y, outer, inner, rotation, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = rotation - Math.PI / 2 + (i * Math.PI) / points;
    ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  ctx.closePath();
}

function chevron(ctx, x, y, size, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.7, 0);
  ctx.lineTo(size * 0.35, 0);
  ctx.lineTo(0, -size * 0.5);
  ctx.lineTo(-size * 0.35, 0);
  ctx.lineTo(-size * 0.7, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
