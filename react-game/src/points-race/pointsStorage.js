/**
 * pointsStorage.js — State Persistence & Server Synchronization.
 * 
 * Manages Round Number, Past Champions Strip, All-Time Hall of Fame,
 * and Top Fan Contributors across stream restarts.
 */

const STORAGE_KEY = 'fb_points_race_state_v1';

const DEFAULT_STATE = {
  round: 1,
  targetPoints: 50,
  champions: [
    { code: 'ID', winCount: 8 },
    { code: 'BR', winCount: 7 },
    { code: 'IN', winCount: 6 },
    { code: 'MX', winCount: 4 },
    { code: 'US', winCount: 3 }
  ],
  allTimeScores: {
    ID: 24580,
    BR: 21940,
    PE: 14220,
    IN: 12850,
    MX: 11400,
    US: 10850,
    NG: 9420,
    CA: 8750
  },
  topFans: []
};

export function loadPointsRaceState() {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const target = (parsed.targetPoints && parsed.targetPoints <= 100) ? parsed.targetPoints : 50;
        return {
          ...DEFAULT_STATE,
          ...parsed,
          targetPoints: target,
          champions: parsed.champions || DEFAULT_STATE.champions,
          allTimeScores: parsed.allTimeScores || DEFAULT_STATE.allTimeScores
        };
      }
    }
  } catch (e) {
    console.warn('Failed to load local points race state:', e);
  }
  return DEFAULT_STATE;
}

export function savePointsRaceState(state) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    // Asynchronously notify backend server
    if (typeof fetch !== 'undefined') {
      fetch('/api/points-race/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('Failed to save points race state:', e);
  }
}
