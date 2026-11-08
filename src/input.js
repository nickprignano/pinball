// Keyboard and touch controls. Like upstream, any input starts a game or launches a ball when
// none is in play. Nudging and the full control set come in a later change.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

const LEFT_KEYS = new Set(['KeyZ', 'ShiftLeft', 'ArrowLeft']);
const RIGHT_KEYS = new Set(['Slash', 'ShiftRight', 'ArrowRight']);

export function attachInput(target, getField, onStart) {
  const anyInput = () => {
    const field = getField();
    if (!field.state.inProgress) onStart();
    else field.launchBallIfNeeded();
  };

  const onKey = (down) => (event) => {
    if (event.repeat) return;
    const field = getField();
    if (LEFT_KEYS.has(event.code)) field.setLeftFlippersEngaged(down);
    else if (RIGHT_KEYS.has(event.code)) field.setRightFlippersEngaged(down);
    else if (!(down && (event.code === 'Enter' || event.code === 'Space'))) return;
    event.preventDefault();
    if (down) anyInput();
  };
  addEventListener('keydown', onKey(true));
  addEventListener('keyup', onKey(false));

  // Each finger on the left or right half of the table works that side's flippers.
  const touches = new Map();
  const updateFlippers = () => {
    const field = getField();
    const sides = [...touches.values()];
    field.setLeftFlippersEngaged(sides.includes('left'));
    field.setRightFlippersEngaged(sides.includes('right'));
  };
  target.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const rect = target.getBoundingClientRect();
    touches.set(event.pointerId, event.clientX - rect.left < rect.width / 2 ? 'left' : 'right');
    updateFlippers();
    anyInput();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    target.addEventListener(type, (event) => {
      touches.delete(event.pointerId);
      updateFlippers();
    });
  }
}
