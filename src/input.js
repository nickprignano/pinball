// Keyboard and touch controls. Like upstream, a flipper press or tap also launches a ball when
// none is in play.
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

const LEFT_KEYS = new Set(['KeyZ', 'ShiftLeft', 'ArrowLeft']);
const RIGHT_KEYS = new Set(['Slash', 'ShiftRight', 'ArrowRight']);

// actions: { field(), launch(), nudge(), togglePause(), toggleMute(), isPlaying() }
export function attachInput(target, actions) {
  const onKey = (down) => (event) => {
    if (event.target.closest?.('input, button, a, dialog')) return;
    const field = actions.field();
    const playing = actions.isPlaying();
    if (LEFT_KEYS.has(event.code)) {
      if (playing) field.setLeftFlippersEngaged(down);
    } else if (RIGHT_KEYS.has(event.code)) {
      if (playing) field.setRightFlippersEngaged(down);
    } else if (!down || event.repeat) {
      return;
    } else if (event.code === 'Enter') {
      actions.launch();
    } else if (event.code === 'Space') {
      actions.nudge();
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      actions.togglePause();
    } else if (event.code === 'KeyM') {
      actions.toggleMute();
    } else {
      return;
    }
    event.preventDefault();
    if (down && !event.repeat && (LEFT_KEYS.has(event.code) || RIGHT_KEYS.has(event.code))) actions.launch();
  };
  addEventListener('keydown', onKey(true));
  addEventListener('keyup', onKey(false));

  // Each finger on the left or right half of the table works that side's flippers.
  const touches = new Map();
  const updateFlippers = () => {
    const field = actions.field();
    const sides = actions.isPlaying() ? [...touches.values()] : [];
    field.setLeftFlippersEngaged(sides.includes('left'));
    field.setRightFlippersEngaged(sides.includes('right'));
  };
  target.addEventListener('pointerdown', (event) => {
    if (event.target.closest?.('button')) return;
    event.preventDefault();
    target.setPointerCapture?.(event.pointerId);
    const rect = target.getBoundingClientRect();
    touches.set(event.pointerId, event.clientX - rect.left < rect.width / 2 ? 'left' : 'right');
    updateFlippers();
    actions.launch();
  });
  for (const type of ['pointerup', 'pointercancel']) {
    target.addEventListener(type, (event) => {
      touches.delete(event.pointerId);
      updateFlippers();
    });
  }
  // Long presses shouldn't open the browser's menu.
  target.addEventListener('contextmenu', (event) => event.preventDefault());
}
