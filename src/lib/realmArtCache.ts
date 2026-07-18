import { streamRealmImage } from "./streamRealmImage";

const LS_PREFIX = "realm-art-v2:";
const MAX_CONCURRENT = 2;

const artCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const queue: Array<{ seed: string; run: () => void }> = [];
let active = 0;

export type PrewarmJob = {
  seed: string;
  title: string;
  status: "queued" | "painting";
  progress: number; // 0..1 (partial frames count / expected)
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
    if (onFrame) existing.then((url) => onFrame(url, true)).catch(() => {});
    return existing;
  }

  // Register the job so the HUD can show it.
  jobs.set(seed, { seed, title, status: "queued", progress: 0 });
  emit();

  const task = new Promise<string>((resolve, reject) => {
    const run = () => {
      active++;
      const job = jobs.get(seed);
      if (job) {
        job.status = "painting";
        emit();
      }
      let frames = 0;
      streamRealmImage(
        prompt,
        (dataUrl, final) => {
          if (final) {
            artCache.set(seed, dataUrl);
            writeLS(seed, dataUrl);
          } else {
            frames++;
            const j = jobs.get(seed);
            if (j) {
              // Assume ~3 partial frames before final; cap at 0.9.
              j.progress = Math.min(0.9, frames / 3);
              emit();
            }
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
          jobs.delete(seed);
          emit();
          pump();
        });
    };
    const entry = { seed, run };
    if (priority === "foreground") queue.unshift(entry);
    else queue.push(entry);
    pump();
  });

  inflight.set(seed, task);
  return task;
}
