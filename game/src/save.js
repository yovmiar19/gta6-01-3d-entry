// Save / load through localStorage: money, respect, finished missions and the
// best car. A missing or broken save just starts a fresh career.

const SAVE_KEY = 'solmar-heat-3d-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      money: typeof data.money === 'number' ? data.money : 400,
      respect: typeof data.respect === 'number' ? data.respect : 0,
      missionsDone: Array.isArray(data.missionsDone) ? data.missionsDone : [],
      bestCar: typeof data.bestCar === 'string' ? data.bestCar : 'RUKAN PELO GT',
      muted: data.muted === true,
    };
  } catch {
    return null;
  }
}

export function saveGame(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: data.money,
      respect: data.respect,
      missionsDone: data.missionsDone,
      bestCar: data.bestCar,
      muted: data.muted,
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}
