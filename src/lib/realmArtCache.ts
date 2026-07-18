import { streamRealmImage } from "./streamRealmImage";

const LS_PREFIX = "realm-art-v2:";
const MAX_CONCURRENT = 2;
const DB_NAME = "lost-between-worlds-art";
const STORE_NAME = "realm-art";

const artCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const frameListeners = new Map<string, Set<(dataUrl: string, isFinal: boolean) => void>>();
const queue: Array<{ seed: string; run: () => void }> = [];
let active = 0;

export type PrewarmJob = {
  seed: string;
  title: string;
  status: "queued" | "painting";
  progress: number; // 0..1 (partial frames count / expected)
  createdAt: number;
  startedAt?: number;
  lastFrameAt?: number;
};

const jobs = new Map<string, PrewarmJob>();
const listeners = new Set<() => void>();
const EMPTY_SNAPSHOT: PrewarmJob[] = [];
let snapshot: PrewarmJob[] = EMPTY_SNAPSHOT;

function emit() {
  snapshot = jobs.size === 0 ? EMPTY_SNAPSHOT : Array.from(jobs.values());
  listeners.forEach((l) => l());
}

export function subscribePrewarm(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getPrewarmSnapshot(): PrewarmJob[] {
  return snapshot;
}

export function getPrewarmServerSnapshot(): PrewarmJob[] {
  return EMPTY_SNAPSHOT;
}

export function getJobForSeed(seed: string): PrewarmJob | null {
  return jobs.get(seed) ?? null;
}

function addFrameListener(
  seed: string,
  listener: (dataUrl: string, isFinal: boolean) => void,
) {
  const listeners = frameListeners.get(seed) ?? new Set();
  listeners.add(listener);
  frameListeners.set(seed, listeners);
}

function notifyFrameListeners(seed: string, dataUrl: string, isFinal: boolean) {
  frameListeners.get(seed)?.forEach((listener) => listener(dataUrl, isFinal));
}

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
    /* localStorage is tiny; IndexedDB below is the durable image cache. */
  }
}

function openArtDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function readIDB(seed: string): Promise<string | null> {
  try {
    const db = await openArtDB();
    if (!db) return null;
    return await new Promise<string | null>((resolve) => {
      const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(seed);
      req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeIDB(seed: string, dataUrl: string): Promise<void> {
  try {
    const db = await openArtDB();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const req = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(dataUrl, seed);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    /* ignore cache failures */
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

export async function getCachedArtAsync(seed: string): Promise<string | null> {
  const sync = getCachedArt(seed);
  if (sync) return sync;
  const disk = await readIDB(seed);
  if (disk) {
    artCache.set(seed, disk);
    return disk;
  }
  return null;
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const next = queue.shift();
    if (next) next.run();
  }
}

export function ensureRealmArt(
  seed: string,
  prompt: string,
  onFrame?: (dataUrl: string, isFinal: boolean) => void,
  signal?: AbortSignal,
  priority: "foreground" | "background" = "foreground",
  title: string = "Unknown realm",
): Promise<string> {
  const cached = getCachedArt(seed);
  if (cached) {
    onFrame?.(cached, true);
    return Promise.resolve(cached);
  }

  const existing = inflight.get(seed);
  if (existing) {
    if (onFrame) addFrameListener(seed, onFrame);
    if (onFrame) existing.then((url) => onFrame(url, true)).catch(() => {});
    return existing;
  }

  if (onFrame) addFrameListener(seed, onFrame);

  const task = new Promise<string>((resolve, reject) => {
    const startNetworkJob = () => {
      // Register the job only after the persistent cache has been checked.
      jobs.set(seed, { seed, title, status: "queued", progress: 0, createdAt: Date.now() });
      emit();

      const run = () => {
      active++;
      const job = jobs.get(seed);
      if (job) {
        jobs.set(seed, { ...job, status: "painting", startedAt: Date.now() });
        emit();
      }
      let frames = 0;
      streamRealmImage(
        prompt,
        (dataUrl, final) => {
          if (final) {
            artCache.set(seed, dataUrl);
            writeLS(seed, dataUrl);
            void writeIDB(seed, dataUrl);
          } else {
            frames++;
            const j = jobs.get(seed);
            if (j) {
              // partial_images=3 → up to 3 partials before final; cap at 0.9.
              jobs.set(seed, {
                ...j,
                progress: Math.min(0.9, frames / 4),
                lastFrameAt: Date.now(),
              });
              emit();
            }
          }
          notifyFrameListeners(seed, dataUrl, final);
        },
        signal,
      )
        .then((finalUrl) => {
          artCache.set(seed, finalUrl);
          writeLS(seed, finalUrl);
          void writeIDB(seed, finalUrl);
          resolve(finalUrl);
        })
        .catch((err) => reject(err))
        .finally(() => {
          active--;
          inflight.delete(seed);
          frameListeners.delete(seed);
          jobs.delete(seed);
          emit();
          pump();
        });
      };
      const entry = { seed, run };
      if (priority === "foreground") queue.unshift(entry);
      else queue.push(entry);
      pump();
    };

    readIDB(seed)
      .then((disk) => {
        if (disk) {
          artCache.set(seed, disk);
          notifyFrameListeners(seed, disk, true);
          resolve(disk);
          inflight.delete(seed);
          frameListeners.delete(seed);
          return;
        }
        startNetworkJob();
      })
      .catch(startNetworkJob);
  });

  inflight.set(seed, task);
  return task;
}
