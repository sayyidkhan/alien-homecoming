import { streamRealmImage } from "./streamRealmImage";

const LS_PREFIX = "realm-art-v2:";
const MAX_CONCURRENT = 2;

const artCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const queue: Array<() => void> = [];
let active = 0;

function readLS(seed: string): string | null {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(LS_PREFIX + seed) : null;
  } catch {
    return null;
  }
}
function writeLS(seed: string, dataUrl: string) {
  try {
    localStorage.setItem(LS_PREFIX + seed, dataUrl);
  } catch {
    /* quota */
  }
}

export function getCachedArt(seed: string): string | null {
  const mem = artCache.get(seed);
  if (mem) return mem;
  const disk = readLS(seed);
  if (disk) {
    artCache.set(seed, disk);
    return disk;
  }
  return null;
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const next = queue.shift();
    if (next) next();
  }
}

/**
 * Ensure art exists for a seed. Returns the in-flight promise so callers can
 * subscribe to partial frames via `onFrame`. Concurrency is limited so we
 * don't fire N image jobs at once when prewarming.
 */
export function ensureRealmArt(
  seed: string,
  prompt: string,
  onFrame?: (dataUrl: string, isFinal: boolean) => void,
  signal?: AbortSignal,
  priority: "foreground" | "background" = "foreground",
): Promise<string> {
  const cached = getCachedArt(seed);
  if (cached) {
    onFrame?.(cached, true);
    return Promise.resolve(cached);
  }

  const existing = inflight.get(seed);
  if (existing) {
    // Subscribe latecomer if we have a way to (we don't replay frames — but
    // they'll get the final url when it resolves).
    if (onFrame) {
      existing.then((url) => onFrame(url, true)).catch(() => {});
    }
    return existing;
  }

  const task = new Promise<string>((resolve, reject) => {
    const run = () => {
      active++;
      streamRealmImage(
        prompt,
        (dataUrl, final) => {
          if (final) {
            artCache.set(seed, dataUrl);
            writeLS(seed, dataUrl);
          }
          onFrame?.(dataUrl, final);
        },
        signal,
      )
        .then((finalUrl) => {
          artCache.set(seed, finalUrl);
          writeLS(seed, finalUrl);
          resolve(finalUrl);
        })
        .catch((err) => reject(err))
        .finally(() => {
          active--;
          inflight.delete(seed);
          pump();
        });
    };
    if (priority === "foreground") {
      // Foreground jumps the queue.
      queue.unshift(run);
    } else {
      queue.push(run);
    }
    pump();
  });

  inflight.set(seed, task);
  return task;
}
