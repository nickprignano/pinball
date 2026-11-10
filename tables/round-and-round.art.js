// Playfield art for Round and Round in the 3D view: a deep-water whirlpool spiralling out from the
// extra-ball rollovers, and a carousel ring with arrows around the bumper wheel. Original art,
// drawn in code.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

export const plastic = '#0f5f6e';

export function paint({ ctx, X, Y, S, width, height, rnd }) {
  const { canvas } = ctx;
  const back = ctx.createLinearGradient(0, Y(height), 0, Y(0));
  back.addColorStop(0, '#04202b');
  back.addColorStop(0.5, '#06303a');
  back.addColorStop(1, '#03121a');
  ctx.fillStyle = back;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Light pools in the colors of the bumpers above them.
  for (const [x, y, r, color] of [
    [14, 22, 5, 'rgba(60, 140, 255, 0.24)'],
    [5.7, 19.5, 3.5, 'rgba(40, 230, 230, 0.2)'],
    [5.2, 26.5, 3.5, 'rgba(240, 230, 60, 0.16)'],
    [9.4, 13, 4.5, 'rgba(230, 40, 230, 0.18)'],
  ]) {
    const glow = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), S(r));
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // The whirlpool: three spiral arms winding out from the rollover grid.
  const [cx, cy] = [9.35, 13];
  ctx.lineCap = 'round';
  for (let arm = 0; arm < 3; arm++) {
    ctx.beginPath();
    for (let t = 0; t <= 1; t += 0.004) {
      const angle = arm * ((Math.PI * 2) / 3) + t * Math.PI * 4.2;
      const r = 1.6 + t * 12;
      ctx.lineTo(X(cx + r * Math.cos(angle)), Y(cy + r * Math.sin(angle)));
    }
    ctx.strokeStyle = 'rgba(90, 220, 230, 0.16)';
    ctx.lineWidth = S(0.5);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(160, 245, 250, 0.3)';
    ctx.lineWidth = S(0.05);
    ctx.stroke();
  }

  // Bubbles.
  for (let i = 0; i < 160; i++) {
    ctx.strokeStyle = `rgba(190, 250, 255, ${0.15 + rnd() * 0.35})`;
    ctx.lineWidth = S(0.02);
    ctx.beginPath();
    ctx.arc(rnd() * canvas.width, rnd() * canvas.height, S(0.04 + rnd() * 0.12), 0, Math.PI * 2);
    ctx.stroke();
  }

  // A carousel ring around the bumper wheel, with arrows going round.
  const [wx, wy, wr] = [14, 22, 3.55];
  ctx.strokeStyle = 'rgba(255, 210, 90, 0.55)';
  ctx.lineWidth = S(0.07);
  ctx.setLineDash([S(0.35), S(0.2)]);
  ctx.beginPath();
  ctx.arc(X(wx), Y(wy), S(wr), 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255, 210, 90, 0.8)';
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    ctx.save();
    ctx.translate(X(wx + wr * Math.cos(a)), Y(wy + wr * Math.sin(a)));
    ctx.rotate(-a); // counter-clockwise on the table
    ctx.beginPath();
    ctx.moveTo(0, -S(0.3));
    ctx.lineTo(S(0.26), S(0.18));
    ctx.lineTo(-S(0.26), S(0.18));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // The table's name, on two lines to fit between the slingshots.
  ctx.font = `900 ${S(0.9)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8fdff';
  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = S(0.35);
  ctx.fillText('ROUND AND', X(width / 2 - 0.5), Y(5.5));
  ctx.fillText('ROUND', X(width / 2 - 0.5), Y(4.4));
  ctx.shadowBlur = 0;
}
