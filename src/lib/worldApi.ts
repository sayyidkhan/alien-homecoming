// This is a public Worker URL, not a credential. VITE_WORLD_API_URL remains an
// override for previews or a future custom domain.
const DEFAULT_WORLD_API_URL = "https://alien-homecoming-universe.sayyidkhan92.workers.dev";

const configuredApiUrl =
  import.meta.env.VITE_WORLD_API_URL?.replace(/\/$/, "") ?? DEFAULT_WORLD_API_URL;

// Local development uses Wrangler on this port. Production deliberately needs
// an explicit URL so a preview never accidentally sends work to the wrong world.
export const worldApiUrl = configuredApiUrl || (import.meta.env.DEV ? "http://127.0.0.1:8787" : "");

export type ArtClaim =
  | { status: "ready"; url: string }
  | { status: "owner"; leaseId: string; leaseExpiresAt: number }
  | { status: "waiting"; leaseExpiresAt: number }
  | { status: "failed"; retryAfterMs: number };

export type ArtUpdate =
  | { type: "art.updated"; status: "ready"; url: string }
  | { type: "art.updated"; status: "generating"; leaseExpiresAt: number }
  | { type: "art.updated"; status: "failed"; retryAfterMs: number };

export type ClaimArtInput = {
  seed: string;
  title: string;
  promptHash: string;
  parentSeed?: string;
  portalId?: string;
};

function endpoint(path: string) {
  return `${worldApiUrl}${path}`;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
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

export async function claimSharedArt(input: ClaimArtInput): Promise<ArtClaim | null> {
  if (!worldApiUrl) return null;
  const response = await fetch(endpoint(`/v1/art/${encodeURIComponent(input.seed)}/claim`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Unable to claim realm art (${response.status})`);
  return readJson<ArtClaim>(response);
}

export async function completeSharedArt(
  seed: string,
  leaseId: string,
  dataUrl: string,
): Promise<string> {
  const response = await fetch(endpoint(`/v1/art/${encodeURIComponent(seed)}/complete`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leaseId, dataUrl }),
  });
  if (!response.ok) throw new Error(`Unable to store realm art (${response.status})`);
  const result = await readJson<{ url: string }>(response);
  return result.url;
}

export async function failSharedArt(seed: string, leaseId: string): Promise<void> {
  if (!worldApiUrl) return;
  await fetch(endpoint(`/v1/art/${encodeURIComponent(seed)}/fail`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leaseId }),
  });
}

export function watchSharedArt(seed: string, onUpdate: (update: ArtUpdate) => void) {
  if (!worldApiUrl || typeof window === "undefined") return () => {};
  const socket = new WebSocket(endpoint(`/v1/art/${encodeURIComponent(seed)}/live`).replace(/^http/, "ws"));
  socket.addEventListener("message", (event) => {
    try {
      const update = JSON.parse(event.data as string) as ArtUpdate;
      if (update.type === "art.updated") onUpdate(update);
    } catch {
      // A later state event or retry will recover from malformed messages.
    }
  });
  return () => socket.close();
}
