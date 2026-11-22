// Keyboard and mouse input. Held keys are read every frame; one-shot presses
// (enter car, pause, mute, weapon switch) are queued as flags and taken once, so a
// press between two frames is never lost and never counted twice.

export const ACT_ENTER = 1;
export const ACT_PAUSE = 2;
export const ACT_MUTE = 4;
export const ACT_SHOOT = 8;
export const ACT_PUNCH = 16;
export const ACT_CONFIRM = 32;

const DRIVE = new Set(['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const HANDBRAKE = new Set(['Space']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mouseDown = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'KeyE') actions |= ACT_ENTER;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACT_PAUSE;
    else if (event.code === 'KeyM') actions |= ACT_MUTE;
    else if (event.code === 'Enter' || event.code === 'Space') actions |= ACT_CONFIRM;
    if (DRIVE.has(event.code) || HANDBRAKE.has(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });
  target.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
      actions |= ACT_SHOOT;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouseDown = false;
  });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  function down(...codes) {
    return codes.some((c) => held.has(c));
  }

  return {
    // Steering: -1 left, 1 right.
    steer() {
      return (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0);
    },
    // Throttle: 1 forward, -1 reverse/brake, 0 coast.
    throttle() {
      return (down('KeyW', 'ArrowUp') ? 1 : 0) - (down('KeyS', 'ArrowDown') ? 1 : 0);
    },
    handbrake() {
      return down('Space');
    },
    run() {
      return down('ShiftLeft', 'ShiftRight');
    },
    // On foot: -1..1 on each axis (x right, z forward on screen).
    walkX() {
      return (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0);
    },
    walkZ() {
      return (down('KeyW', 'ArrowUp') ? 1 : 0) - (down('KeyS', 'ArrowDown') ? 1 : 0);
    },
    // Held mouse button (for automatic weapons).
    firing() {
      return mouseDown;
    },
    weaponKey() {
      for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) {
        if (held.has(code)) return code;
      }
      return null;
    },
    /** The one-shot presses since the last call, as ACT_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
