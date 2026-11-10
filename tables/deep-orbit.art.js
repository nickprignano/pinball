// Playfield art for Deep Orbit in the 3D view: deep space, nebulas, orbit rings around the pop
// bumpers and a ringed planet behind the asteroid targets. Original art, drawn in code.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

export const plastic = '#33267a';

export function paint({ ctx, X, Y, S, width, height, rnd }) {
  const { canvas } = ctx;
  const sky = ctx.createLinearGradient(0, Y(height), 0, Y(0));
  sky.addColorStop(0, '#0b1030');
  sky.addColorStop(0.55, '#140a2e');
  sky.addColorStop(1, '#06121f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Nebulas, painted as colored light pools.
  for (const [x, y, r, color] of [
    [5, 22, 7, 'rgba(120, 60, 220, 0.38)'],
    [15, 12, 8, 'rgba(0, 170, 200, 0.24)'],
    [9.5, 6, 6, 'rgba(255, 120, 40, 0.14)'],
    [15.5, 24, 4, 'rgba(255, 90, 60, 0.18)'],
  ]) {
    const glow = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), S(r));
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Stars.
  for (let i = 0; i < 1100; i++) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.2 + rnd() * 0.7})`;
    ctx.beginPath();
    ctx.arc(rnd() * canvas.width, rnd() * canvas.height, S(0.01 + rnd() * 0.03), 0, Math.PI * 2);
    ctx.fill();
  }

  // Orbit rings around the pop bumpers.
  ctx.lineWidth = S(0.06);
  for (const [rx, ry, color] of [[5.2, 3.4, 'rgba(120, 200, 255, 0.4)'], [6.4, 4.4, 'rgba(255, 170, 60, 0.3)']]) {
    ctx.strokeStyle = color;
    ctx.setLineDash([S(0.3), S(0.22)]);
    ctx.beginPath();
    ctx.ellipse(X(9.5), Y(21.4), S(rx), S(ry), -0.15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // A ringed planet behind the asteroid targets.
  const planet = ctx.createRadialGradient(X(8.6), Y(13.8), 0, X(9.5), Y(12.6), S(2.6));
  planet.addColorStop(0, '#ffb35c');
  planet.addColorStop(0.6, '#c2410c');
  planet.addColorStop(1, 'rgba(60, 10, 0, 0)');
  ctx.fillStyle = planet;
  ctx.beginPath();
  ctx.arc(X(9.5), Y(12.6), S(2.2), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 220, 180, 0.7)';
  ctx.lineWidth = S(0.09);
  ctx.beginPath();
  ctx.ellipse(X(9.5), Y(12.6), S(3.6), S(0.9), -0.2, 0, Math.PI * 2);
  ctx.stroke();

  // Lane arrows up the left orbit and the right ramp lane.
  ctx.fillStyle = 'rgba(255, 200, 80, 0.55)';
  for (const [x, y, angle] of [[1.6, 17.6, 0.05], [1.3, 21.2, -0.15], [16.2, 21.5, 0.2], [17.2, 17.2, 0.05]]) {
    ctx.save();
    ctx.translate(X(x), Y(y));
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, -S(0.45));
    ctx.lineTo(S(0.3), S(0.15));
    ctx.lineTo(0, 0);
    ctx.lineTo(-S(0.3), S(0.15));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // The table's name.
  ctx.font = `900 ${S(1.05)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#60a5fa';
  ctx.shadowBlur = S(0.35);
  ctx.fillText('DEEP ORBIT', X(width / 2 - 0.5), Y(4.8));
  ctx.shadowBlur = 0;
}
