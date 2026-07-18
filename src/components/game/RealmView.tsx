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

function useSeedProgress(seed: string): { status: "queued" | "painting" | "idle"; progress: number } {
  const job = useSyncExternalStore(
    subscribePrewarm,
    () => getJobForSeed(seed),
    () => null,
  );
  if (!job) return { status: "idle", progress: 0 };
  return { status: job.status, progress: job.progress };
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

    const controller = new AbortController();
    let alive = true;
    ensureRealmArt(
      realm.seed,
      buildRealmPrompt(realm),
      (dataUrl, final) => {
        if (!alive) return;
        setArt(dataUrl);
        setIsFinal(final);
      },
      controller.signal,
      "foreground",
    ).catch(() => {});

    return () => {
      alive = false;
      controller.abort();
    };
  }, [realm]);

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
    onMoveAlien(Math.max(0.06, Math.min(0.94, x)), Math.max(0.55, Math.min(0.86, y)));
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
        return (
          <button
            key={p.id}
            type="button"
            className={`portal-hit group absolute z-20 rounded-2xl outline-none ${
              locked ? "portal-locked" : "portal-available"
            }`}
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
            <span className="portal-label">
              {p.title}
              {p.destinationRealmId ? " · known" : ""}
              {locked ? " · sealed" : ""}
            </span>
          </button>
        );
      })}

      <Alien x={alienX} y={alienY} facing={facing} celebrating={justCelebrated} />
    </div>
  );
}

function RealmLoading({ title }: { title: string }) {
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
            Painting a new universe
          </div>
          <div className="mt-2 font-serif text-2xl text-white/95">{title}</div>
        </div>
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-white/80"
              style={{ animation: `pulseDot 1.2s ${i * 0.15}s infinite` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
