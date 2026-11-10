// Playfield art for Ringmaster in the 3D view: a striped circus tent overhead, bunting under the top
// lanes, spotlights on the pop bumpers and a sawdust ring around the target indicators. Original
// art, drawn in code.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

export const plastic = '#8a1c1c';

export function paint({ ctx, X, Y, S, width, height, rnd }) {
  const { canvas } = ctx;
  ctx.fillStyle = '#1c0f0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Tent stripes fanning down from the top of the table.
  const [ax, ay] = [9.5, 36];
  const stripes = 22;
  for (let i = 0; i < stripes; i++) {
    const a1 = Math.PI * 1.5 - 0.75 + (i / stripes) * 1.5;
    const a2 = a1 + 1.5 / stripes;
    ctx.fillStyle = i % 2 ? 'rgba(150, 24, 36, 0.55)' : 'rgba(110, 80, 40, 0.35)';
    ctx.beginPath();
    ctx.moveTo(X(ax), Y(ay));
    ctx.lineTo(X(ax + 60 * Math.cos(a1)), Y(ay + 60 * Math.sin(a1)));
    ctx.lineTo(X(ax + 60 * Math.cos(a2)), Y(ay + 60 * Math.sin(a2)));
    ctx.closePath();
    ctx.fill();
  }
  // Darker toward the player, so the ring and the name stand out.
  const shade = ctx.createLinearGradient(0, Y(height), 0, Y(0));
  shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  shade.addColorStop(0.55, 'rgba(10, 4, 2, 0.45)');
  shade.addColorStop(1, 'rgba(10, 4, 2, 0.8)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Spotlights on the pop bumpers and on the ring.
  for (const [x, y, r, color] of [
    [12.2, 21.7, 4.5, 'rgba(255, 230, 150, 0.22)'],
    [9.4, 10, 4.5, 'rgba(255, 200, 120, 0.2)'],
  ]) {
    const glow = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), S(r));
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // The ring: sawdust inside a red and white curb.
  const [cx, cy] = [9.4, 10];
  const dust = ctx.createRadialGradient(X(cx), Y(cy), 0, X(cx), Y(cy), S(3.1));
  dust.addColorStop(0, '#8a6430');
  dust.addColorStop(1, '#4a3016');
  ctx.fillStyle = dust;
  ctx.beginPath();
  ctx.arc(X(cx), Y(cy), S(3.1), 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 300; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 3;
    ctx.fillStyle = `rgba(230, 190, 120, ${0.15 + rnd() * 0.3})`;
    ctx.fillRect(X(cx + r * Math.cos(a)), Y(cy + r * Math.sin(a)), S(0.05), S(0.05));
  }
  const segments = 24;
  ctx.lineWidth = S(0.32);
  for (let i = 0; i < segments; i++) {
    ctx.strokeStyle = i % 2 ? '#e8ded0' : '#b91c1c';
    ctx.beginPath();
    ctx.arc(X(cx), Y(cy), S(3.3), (i / segments) * Math.PI * 2, ((i + 1) / segments) * Math.PI * 2);
    ctx.stroke();
  }

  // Bunting under the top lanes.
  const flags = ['#dc2626', '#facc15', '#2563eb', '#16a34a'];
  const [x1, x2, top] = [9.2, 16.4, 26.2];
  ctx.strokeStyle = 'rgba(240, 230, 210, 0.6)';
  ctx.lineWidth = S(0.03);
  const sag = (x) => top - 0.35 * Math.sin(((x - x1) / (x2 - x1)) * Math.PI);
  ctx.beginPath();
  for (let x = x1; x <= x2; x += 0.1) ctx.lineTo(X(x), Y(sag(x)));
  ctx.stroke();
  for (let k = 0, x = x1 + 0.3; x < x2 - 0.3; k++, x += 0.6) {
    ctx.fillStyle = flags[k % flags.length];
    ctx.beginPath();
    ctx.moveTo(X(x - 0.2), Y(sag(x - 0.2)));
    ctx.lineTo(X(x + 0.2), Y(sag(x + 0.2)));
    ctx.lineTo(X(x), Y(sag(x) - 0.45));
    ctx.closePath();
    ctx.fill();
  }

  // Gold stars.
  ctx.fillStyle = 'rgba(250, 204, 21, 0.7)';
  for (const [x, y, r] of [[3.2, 13.5, 0.35], [15.8, 13.2, 0.35], [4.3, 21.8, 0.25], [7.2, 26.8, 0.3], [16.3, 17.2, 0.25], [9.4, 16.2, 0.3]]) {
    star(ctx, X(x), Y(y), S(r), S(r * 0.42));
    ctx.fill();
  }

  // The table's name on a banner.
  const [bx, by, bw, bh] = [width / 2 - 0.5, 4.8, 5.2, 1];
  ctx.fillStyle = '#7f1d1d';
  ctx.beginPath();
  ctx.moveTo(X(bx - bw / 2 - 0.5), Y(by + bh / 2));
  ctx.lineTo(X(bx + bw / 2 + 0.5), Y(by + bh / 2));
  ctx.lineTo(X(bx + bw / 2 + 0.15), Y(by));
  ctx.lineTo(X(bx + bw / 2 + 0.5), Y(by - bh / 2));
  ctx.lineTo(X(bx - bw / 2 - 0.5), Y(by - bh / 2));
  ctx.lineTo(X(bx - bw / 2 - 0.15), Y(by));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = S(0.05);
  ctx.stroke();
  ctx.font = `900 ${S(0.72)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fde68a';
  ctx.fillText('RINGMASTER', X(bx), Y(by));
  ctx.textBaseline = 'alphabetic';
}

function star(ctx, x, y, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  ctx.closePath();
}
