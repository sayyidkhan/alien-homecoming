import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { RealmNode, Portal, Discovery } from "@/game/types";
import { Alien } from "./Alien";
import { buildRealmPrompt } from "@/lib/streamRealmImage";
import {
  ensureRealmArt,
  getCachedArt,
  subscribePrewarm,
  getJobForSeed,
} from "@/lib/realmArtCache";
import { planRealm } from "@/game/realmPlanner";

function useSeedProgress(seed: string): {
  status: "queued" | "waiting" | "painting" | "retrying" | "idle";
  progress: number;
  createdAt?: number;
  startedAt?: number;
  lastFrameAt?: number;
} {
  const job = useSyncExternalStore(
    subscribePrewarm,
    () => getJobForSeed(seed),
    () => null,
  );
  if (!job) return { status: "idle", progress: 0 };
  return {
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    lastFrameAt: job.lastFrameAt,
  };
}

function useElapsedSeconds(startedAt?: number) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function RealmView({
  realm,
  alienX,
  alienY,
  onMoveAlien,
  onPortalActivate,
  onDiscovery,
  disabled,
  adventureId,
  echoesCollected,
}: {
  realm: RealmNode;
  alienX: number;
  alienY: number;
  onMoveAlien: (x: number, y: number) => void;
  onPortalActivate: (portal: Portal) => void;
  onDiscovery: (d: Discovery) => void;
  disabled?: boolean;
  adventureId: string;
  echoesCollected: number;
}) {
  const cachedInit = getCachedArt(realm.seed);
  const [art, setArt] = useState<string | null>(cachedInit);
  const [isFinal, setIsFinal] = useState<boolean>(!!cachedInit);

  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverPortal, setHoverPortal] = useState<string | null>(null);
  const [justCelebrated, setJustCelebrated] = useState(false);

  // Foreground: paint the current realm.
  useEffect(() => {
    const cached = getCachedArt(realm.seed);
    if (cached) {
      setArt(cached);
      setIsFinal(true);
      return;
    }
    setArt(null);
    setIsFinal(false);

    let alive = true;
    ensureRealmArt(
      realm.seed,
      buildRealmPrompt(realm),
      (dataUrl, final) => {
        if (!alive) return;
        setArt(dataUrl);
        setIsFinal(final);
      },
      undefined,
      "foreground",
    ).catch(() => {});

    return () => {
      alive = false;
    };
  }, [realm.seed]);

  // Background prewarm: speculatively plan the destination realm for each
  // unexplored portal and start painting its art now, so it's ready (or
  // nearly so) when the player clicks through.
  useEffect(() => {
    for (const p of realm.portals) {
      if (p.state === "locked" || p.state === "hidden") continue;
      if (p.destinationRealmId) continue;
      if (p.id === "portal_way_home") continue;
      try {
        const dest = planRealm({
          adventureId,
          parentRealmId: realm.id,
          enteredThroughPortalId: p.id,
          depth: realm.depth + 1,
          echoesCollected,
        });
        if (getCachedArt(dest.seed)) continue;
        ensureRealmArt(
          dest.seed,
          buildRealmPrompt(dest),
          undefined,
          undefined,
          "background",
          dest.title,
        ).catch(() => {});

      } catch {
        /* ignore planning errors */
      }
    }
  }, [realm, adventureId, echoesCollected]);

  const facing = useMemo(() => {
    const hovered = realm.portals.find((p) => p.id === hoverPortal);
    if (!hovered) return 0;
    return hovered.shape.x + hovered.shape.w / 2 > alienX ? 1 : -1;
  }, [hoverPortal, realm.portals, alienX]);

  useEffect(() => {
    if (!justCelebrated) return;
    const t = window.setTimeout(() => setJustCelebrated(false), 1400);
    return () => window.clearTimeout(t);
  }, [justCelebrated]);

  function handleSceneClick(e: React.MouseEvent<HTMLDivElement>) {
    if (disabled) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onMoveAlien(Math.max(0.04, Math.min(0.96, x)), Math.max(0.08, Math.min(0.94, y)));
  }

  return (
    <div
      ref={containerRef}
      onClick={handleSceneClick}
      className="relative h-full w-full overflow-hidden cursor-crosshair select-none"
      style={{ backgroundColor: "#05030f" }}
    >
      {/* Generated painting */}
      {art && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("${art}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: isFinal ? "none" : "blur(24px)",
            transform: isFinal ? "scale(1)" : "scale(1.04)",
            transition: "filter 700ms ease, transform 700ms ease, opacity 700ms ease",
            opacity: 1,
          }}
        />
      )}

      {/* Ambient particles overlay */}
      <div className="pointer-events-none absolute inset-0 realm-particles" />

      {/* Loading screen — shown until first pixels arrive */}
      {!art && <RealmLoading title={realm.title} seed={realm.seed} />}

      {/* Painting-in indicator (after first partial pixels) */}
      {art && !isFinal && <PaintingProgress seed={realm.seed} />}

      {/* Discoveries */}
      {realm.discoveries.map((d) =>
        d.found ? null : (
          <button
            key={d.id}
            type="button"
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none"
            style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%` }}
            onClick={(e) => {
              e.stopPropagation();
              onDiscovery(d);
              onMoveAlien(d.x, Math.min(0.82, d.y + 0.08));
              setJustCelebrated(d.kind === "home_echo");
            }}
            aria-label={`Look closer: ${d.title}`}
          >
            <span className="clue-sparkle block h-8 w-8 rounded-full" />
          </button>
        ),
      )}

      {/* Portals */}
      {realm.portals.map((p) => {
        const style = {
          left: `${p.shape.x * 100}%`,
          top: `${p.shape.y * 100}%`,
          width: `${p.shape.w * 100}%`,
          height: `${p.shape.h * 100}%`,
        };
        const locked = p.state === "locked";
        const isBack = p.id.startsWith("portal_back_");
        return (
          <button
            key={p.id}
            type="button"
            className={`portal-hit group absolute z-20 rounded-2xl outline-none ${
              locked ? "portal-locked" : "portal-available"
            } ${isBack ? "portal-back" : ""}`}
            style={style}
            onMouseEnter={() => setHoverPortal(p.id)}
            onMouseLeave={() => setHoverPortal((h) => (h === p.id ? null : h))}
            onFocus={() => setHoverPortal(p.id)}
            onBlur={() => setHoverPortal((h) => (h === p.id ? null : h))}
            onClick={(e) => {
              e.stopPropagation();
              if (locked || disabled) return;
              onPortalActivate(p);
            }}
            aria-label={`${p.title}${locked ? " (locked)" : ""}`}
          >
            <span className="portal-glow" />
            {isBack && <span className="portal-back-arrow" aria-hidden>↩</span>}
            <span className="portal-label">
              {isBack ? "◂ " : ""}
              {p.title}
              {!isBack && p.destinationRealmId ? " · known" : ""}
              {locked ? " · sealed" : ""}
            </span>
          </button>
        );
      })}

      {/* Back-portal breadcrumb hint — pulses in from time to time */}
      {realm.portals.some((p) => p.id.startsWith("portal_back_")) && (
        <div className="back-guide-hint pointer-events-none absolute bottom-4 left-4 z-30 rounded-full border border-cyan-200/25 bg-black/50 px-3 py-1.5 text-[10px] uppercase tracking-[0.28em] text-cyan-100/90 backdrop-blur">
          ↩ Glowing blue portal returns you the way you came
        </div>
      )}

      <Alien x={alienX} y={alienY} facing={facing} celebrating={justCelebrated} />
    </div>
  );
}

function RealmLoading({ title, seed }: { title: string; seed: string }) {
  const { status, progress, createdAt, startedAt, lastFrameAt } = useSeedProgress(seed);
  const elapsed = useElapsedSeconds(createdAt);
  const paintingElapsed = useElapsedSeconds(startedAt);
  const frameElapsed = useElapsedSeconds(lastFrameAt);
  const pct = Math.round(progress * 100);
  const statusLine =
    status === "queued"
      ? `Queued for ${elapsed}s · waiting for an image slot`
      : status === "waiting"
        ? "Another traveller is painting this realm · reusing their finished art"
        : status === "retrying"
          ? "The painter stepped away · safely claiming the next attempt"
      : progress > 0
        ? `Painting for ${paintingElapsed}s · last pixels ${frameElapsed}s ago`
        : `Contacting painter · ${elapsed}s elapsed`;
  const label =
    status === "queued"
      ? "Queued · waiting for a painter"
      : status === "waiting"
        ? "Another traveller is painting this realm"
        : status === "retrying"
          ? "Retrying this realm safely"
      : progress > 0
        ? `Painting · ${pct}%`
        : "Painting a new universe";
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden bg-[#05030f]">
      <div className="loading-starfield absolute inset-0" />
      <div className="loading-nebula absolute inset-0" />
      <div className="relative flex flex-col items-center gap-6">
        <div className="loading-orb relative h-28 w-28">
          <div className="loading-orb-core absolute inset-0 rounded-full" />
          <div className="loading-orb-ring absolute inset-0 rounded-full" />
          <div className="loading-orb-ring-2 absolute inset-0 rounded-full" />
        </div>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-[0.4em] text-white/60">
            {label}
          </div>
          <div className="mt-2 font-serif text-2xl text-white/95">{title}</div>
          <div className="mt-3 flex items-center justify-center gap-3 text-[10px] uppercase tracking-[0.25em] text-white/60">
            <span>Elapsed {elapsed}s</span>
            <span className="h-1 w-1 rounded-full bg-white/35" />
            <span>{statusLine}</span>
          </div>
        </div>
        <div className="h-1.5 w-64 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-amber-200 transition-[width] duration-500"
            style={{
              width:
                status === "queued"
                  ? "6%"
                  : status === "waiting"
                    ? "20%"
                    : status === "retrying"
                      ? "15%"
                  : progress > 0
                    ? `${Math.max(8, pct)}%`
                    : "12%",
            }}
          />
        </div>
        <div className="text-[9px] uppercase tracking-[0.3em] text-white/45">
          {elapsed > 25
            ? "still working — this request can take longer when the image service is busy"
            : "first pixels usually arrive in ~5–10s"}
        </div>
      </div>
    </div>
  );
}

function PaintingProgress({ seed }: { seed: string }) {
  const { progress, createdAt } = useSeedProgress(seed);
  const elapsed = useElapsedSeconds(createdAt);
  const pct = Math.max(10, Math.round(progress * 100));
  return (
    <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-full bg-black/45 backdrop-blur px-4 py-1.5 text-[10px] tracking-[0.25em] uppercase text-white/85 toast-in">
      <span>Painting · {pct}%</span>
      <span>{elapsed}s</span>
      <span className="h-1 w-24 overflow-hidden rounded-full bg-white/10">
        <span
          className="block h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-amber-200 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
}
