import { hashString } from "@/game/seed";
import type { RealmNode } from "@/game/types";
import { buildRealmPrompt, streamRealmImage } from "./streamRealmImage";
import {
  claimSharedArt,
  completeSharedArt,
  failSharedArt,
  getSharedArtUrl,
  watchSharedArt,
} from "./worldApi";

const LS_PREFIX = "realm-art-v2:";
const MAX_CONCURRENT = 2;
const DB_NAME = "lost-between-worlds-art";
const STORE_NAME = "realm-art";

const artCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const backfills = new Map<string, Promise<void>>();
const backfillScanned = new Set<string>();
const frameListeners = new Map<string, Set<(dataUrl: string, isFinal: boolean) => void>>();
const queue: Array<{ seed: string; run: () => void }> = [];
let active = 0;

export type PrewarmJob = {
  seed: string;
  title: string;
  status: "queued" | "waiting" | "painting" | "retrying" | "failed";
  progress: number;
  createdAt: number;
  startedAt?: number;
  lastFrameAt?: number;
  leaseExpiresAt?: number;
  error?: "local-image-service" | "image-service";
};

const jobs = new Map<string, PrewarmJob>();
const listeners = new Set<() => void>();
const EMPTY_SNAPSHOT: PrewarmJob[] = [];
let snapshot: PrewarmJob[] = EMPTY_SNAPSHOT;

function emit() {
  snapshot = jobs.size === 0 ? EMPTY_SNAPSHOT : Array.from(jobs.values());
  listeners.forEach((listener) => listener());
}

function updateJob(seed: string, changes: Partial<PrewarmJob>) {
  const job = jobs.get(seed);
  if (!job) return;
  jobs.set(seed, { ...job, ...changes });
  emit();
}

function classifyGenerationError(error: unknown): PrewarmJob["error"] {
  const message = error instanceof Error ? error.message : String(error);
  return /LOVABLE_API_KEY|Image generation failed: 500/.test(message)
    ? "local-image-service"
    : "image-service";
}

export function subscribePrewarm(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
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

function addFrameListener(seed: string, listener: (dataUrl: string, isFinal: boolean) => void) {
  const seedListeners = frameListeners.get(seed) ?? new Set();
  seedListeners.add(listener);
  frameListeners.set(seed, seedListeners);
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
    // IndexedDB below is the durable browser cache.
  }
}

function openArtDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => resolve(null);
  });
}

async function readIDB(seed: string): Promise<string | null> {
  try {
    const db = await openArtDB();
    if (!db) return null;
    return await new Promise((resolve) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(seed);
      request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function getLocalCachedArtAsync(seed: string): Promise<string | null> {
  const cached = getCachedArt(seed);
  if (cached) return cached;
  const disk = await readIDB(seed);
  if (disk) artCache.set(seed, disk);
  return disk;
}

async function writeIDB(seed: string, dataUrl: string): Promise<void> {
  try {
    const db = await openArtDB();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const request = db
        .transaction(STORE_NAME, "readwrite")
        .objectStore(STORE_NAME)
        .put(dataUrl, seed);
      request.onsuccess = request.onerror = () => resolve();
    });
  } catch {
    // Caching may fail in private browsing without affecting the realm.
  }
}

function saveLocalArt(seed: string, url: string) {
  artCache.set(seed, url);
  writeLS(seed, url);
  void writeIDB(seed, url);
}

/**
 * Art created before the shared library existed is held as a data URL in a
 * browser cache. When that realm is next opened, make it canonical without
 * spending another image-generation request. Only the lease owner uploads;
 * another browser may already have supplied the canonical copy.
 */
function backfillCachedArt(seed: string, prompt: string, title: string, cached: string) {
  if (!cached.startsWith("data:image/") || backfills.has(seed)) return;

  const task = (async () => {
    const claim = await claimSharedArt({
      seed,
      title,
      promptHash: hashString(prompt).toString(36),
    });
    if (!claim || claim.status !== "owner") return;

    try {
      const sharedUrl = await completeSharedArt(seed, claim.leaseId, cached);
      saveLocalArt(seed, sharedUrl);
    } catch {
      await failSharedArt(seed, claim.leaseId).catch(() => {});
    }
  })().finally(() => backfills.delete(seed));

  backfills.set(seed, task);
}

export function getCachedArt(seed: string): string | null {
  const mem = artCache.get(seed);
  if (mem) return mem;
  const disk = readLS(seed);
  if (disk) artCache.set(seed, disk);
  return disk;
}

export async function getCachedArtAsync(seed: string): Promise<string | null> {
  const local = await getLocalCachedArtAsync(seed);
  if (local) return local;
  const shared = await getSharedArtUrl(seed).catch(() => null);
  if (shared) saveLocalArt(seed, shared);
  return shared;
}

/**
 * On startup, inspect every realm already known to this browser. This migrates
 * legacy IndexedDB/localStorage artwork gradually, with no re-generation and
 * without fetching missing artwork just to check for a migration.
 */
export function backfillKnownRealmArt(realms: RealmNode[]) {
  for (const realm of realms) {
    if (backfillScanned.has(realm.seed)) continue;
    backfillScanned.add(realm.seed);
    void getLocalCachedArtAsync(realm.seed).then((cached) => {
      if (cached) backfillCachedArt(realm.seed, buildRealmPrompt(realm), realm.title, cached);
    });
  }
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) queue.shift()?.run();
}

function waitForSharedResult(seed: string, leaseExpiresAt: number): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(
      () => settle(null),
      Math.max(1_000, leaseExpiresAt - Date.now() + 750),
    );
    const settle = (url: string | null) => {
      if (settled) return;
      settled = true;
      if (timer) window.clearTimeout(timer);
      stop();
      resolve(url);
    };
    const stop = watchSharedArt(seed, (update) => {
      if (update.status === "ready") settle(update.url);
      if (update.status === "failed") settle(null);
    });
  });
}

async function generateLocally(
  seed: string,
  prompt: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  let frames = 0;
  const final = await streamRealmImage(
    prompt,
    (dataUrl, isFinal) => {
      if (isFinal) saveLocalArt(seed, dataUrl);
      else {
        frames++;
        updateJob(seed, {
          status: "painting",
          progress: Math.min(0.9, frames / 4),
          lastFrameAt: Date.now(),
        });
      }
      notifyFrameListeners(seed, dataUrl, isFinal);
    },
    signal,
  );
  saveLocalArt(seed, final);
  return final;
}

async function claimAndGenerate(
  seed: string,
  prompt: string,
  signal: AbortSignal | undefined,
  title: string,
): Promise<string> {
  // A browser extension, local network, or an in-progress Worker deploy can
  // temporarily make the shared service unavailable. The game must still be
  // playable: create and retain local art, then backfill on a later visit.
  const claim = await claimSharedArt({
    seed,
    title,
    promptHash: hashString(prompt).toString(36),
  }).catch(() => null);
  if (!claim) {
    updateJob(seed, { status: "painting", startedAt: Date.now() });
    return generateLocally(seed, prompt, signal);
  }
  if (claim.status === "ready") {
    saveLocalArt(seed, claim.url);
    notifyFrameListeners(seed, claim.url, true);
    return claim.url;
  }
  if (claim.status === "waiting") {
    updateJob(seed, { status: "waiting", leaseExpiresAt: claim.leaseExpiresAt });
    const sharedUrl = await waitForSharedResult(seed, claim.leaseExpiresAt);
    if (sharedUrl) {
      saveLocalArt(seed, sharedUrl);
      notifyFrameListeners(seed, sharedUrl, true);
      return sharedUrl;
    }
    updateJob(seed, { status: "retrying", progress: 0 });
    return claimAndGenerate(seed, prompt, signal, title);
  }
  if (claim.status === "failed") {
    updateJob(seed, { status: "retrying", progress: 0 });
    await new Promise((resolve) => window.setTimeout(resolve, claim.retryAfterMs));
    return claimAndGenerate(seed, prompt, signal, title);
  }

  updateJob(seed, {
    status: "painting",
    progress: 0,
    startedAt: Date.now(),
    leaseExpiresAt: claim.leaseExpiresAt,
  });
  try {
    const final = await generateLocally(seed, prompt, signal);
    try {
      const sharedUrl = await completeSharedArt(seed, claim.leaseId, final);
      saveLocalArt(seed, sharedUrl);
      notifyFrameListeners(seed, sharedUrl, true);
      return sharedUrl;
    } catch {
      // `generateLocally` already saved the final data URL. Do not hide a
      // finished painting merely because its shared upload failed.
      return final;
    }
  } catch (error) {
    await failSharedArt(seed, claim.leaseId).catch(() => {});
    throw error;
  }
}

export function ensureRealmArt(
  seed: string,
  prompt: string,
  onFrame?: (dataUrl: string, isFinal: boolean) => void,
  signal?: AbortSignal,
  priority: "foreground" | "background" = "foreground",
  title = "Unknown realm",
): Promise<string> {
  const cached = getCachedArt(seed);
  if (cached) {
    backfillCachedArt(seed, prompt, title, cached);
    onFrame?.(cached, true);
    return Promise.resolve(cached);
  }

  const existing = inflight.get(seed);
  if (existing) {
    if (onFrame) addFrameListener(seed, onFrame);
    return existing;
  }
  if (onFrame) addFrameListener(seed, onFrame);

  const task = new Promise<string>((resolve, reject) => {
    const run = () => {
      active++;
      // Do not start a foreground request with a network availability probe.
      // A blocked Worker used to leave this promise pending forever, so the
      // loading screen never progressed. Check this browser's cache first;
      // `claimAndGenerate` then makes the single bounded shared-world request.
      void getLocalCachedArtAsync(seed)
        .then((localArt) => {
          if (localArt) {
            backfillCachedArt(seed, prompt, title, localArt);
            notifyFrameListeners(seed, localArt, true);
            return localArt;
          }
          return claimAndGenerate(seed, prompt, signal, title);
        })
        .then(resolve, (error) => {
          // Keep the job long enough for the screen to explain what happened
          // and let the traveller retry; the old flow removed it immediately,
          // leaving a permanent-looking "Contacting painter" screen.
          updateJob(seed, {
            status: "failed",
            error: classifyGenerationError(error),
          });
          reject(error);
        })
        .finally(() => {
          active--;
          inflight.delete(seed);
          frameListeners.delete(seed);
          if (jobs.get(seed)?.status !== "failed") {
            jobs.delete(seed);
            emit();
          }
          pump();
        });
    };

    jobs.set(seed, { seed, title, status: "queued", progress: 0, createdAt: Date.now() });
    emit();
    const entry = { seed, run };
    if (priority === "foreground") queue.unshift(entry);
    else queue.push(entry);
    pump();
  });

  inflight.set(seed, task);
  return task;
}
