import type { AdventureState } from "./types";

const KEY = "lost_between_worlds:adventure:v1";

export function loadAdventure(): AdventureState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdventureState;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAdventure(state: AdventureState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore quota
  }
}

export function clearAdventure() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
