import type { AdventureState } from "@/game/types";

export type SharedWorldSnapshot = {
  state: AdventureState;
  revision: number;
  updatedAt: number;
};

class WorldConflictError extends Error {
  snapshot: SharedWorldSnapshot;

  constructor(snapshot: SharedWorldSnapshot) {
    super("The shared world changed. Reloading the latest state.");
    this.snapshot = snapshot;
  }
}

const configuredApiUrl = import.meta.env.VITE_WORLD_API_URL?.replace(/\/$/, "");

export const worldApiUrl = configuredApiUrl ?? (import.meta.env.DEV ? "http://127.0.0.1:8787" : "");

function endpoint(path: string) {
  return `${worldApiUrl}${path}`;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function loadSharedWorld(): Promise<SharedWorldSnapshot | null> {
  if (!worldApiUrl) return null;
  const response = await fetch(endpoint("/v1/world"));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Unable to load the shared world (${response.status})`);
  return readJson<SharedWorldSnapshot>(response);
}

export async function initialiseSharedWorld(
  state: AdventureState,
): Promise<SharedWorldSnapshot | null> {
  if (!worldApiUrl) return null;

  const existing = await loadSharedWorld();
  if (existing) return existing;

  const response = await fetch(endpoint("/v1/world"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, expectedRevision: null }),
  });

  if (response.status === 409) return readJson<SharedWorldSnapshot>(response);
  if (!response.ok) throw new Error(`Unable to initialise the shared world (${response.status})`);
  return readJson<SharedWorldSnapshot>(response);
}

export async function saveSharedWorld(
  state: AdventureState,
  expectedRevision: number | null,
): Promise<SharedWorldSnapshot | null> {
  if (!worldApiUrl) return null;

  const response = await fetch(endpoint("/v1/world"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, expectedRevision }),
  });
  const snapshot = await readJson<SharedWorldSnapshot>(response);
  if (response.status === 409) throw new WorldConflictError(snapshot);
  if (!response.ok) throw new Error(`Unable to save the shared world (${response.status})`);
  return snapshot;
}

export function subscribeToSharedWorld(onSnapshot: (snapshot: SharedWorldSnapshot) => void) {
  if (!worldApiUrl || typeof window === "undefined") return () => {};
  const wsUrl = endpoint("/v1/world/live").replace(/^http/, "ws");
  const socket = new WebSocket(wsUrl);
  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data as string) as { type?: string } & SharedWorldSnapshot;
      if (message.type === "world.updated") onSnapshot(message);
    } catch {
      // Ignore malformed messages; the next committed state will replace it.
    }
  });
  return () => socket.close();
}

export function sharedArtUrl(seed: string) {
  return worldApiUrl ? endpoint(`/v1/art/${encodeURIComponent(seed)}`) : null;
}

export async function getSharedArtUrl(seed: string): Promise<string | null> {
  const url = sharedArtUrl(seed);
  if (!url) return null;
  const response = await fetch(url, { method: "HEAD" });
  return response.ok ? url : null;
}

export async function saveSharedArt(seed: string, dataUrl: string): Promise<string | null> {
  if (!worldApiUrl) return null;
  const response = await fetch(endpoint(`/v1/art/${encodeURIComponent(seed)}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
  if (!response.ok) return null;
  const result = await readJson<{ url?: string }>(response);
  return result.url ?? null;
}

export { WorldConflictError };
