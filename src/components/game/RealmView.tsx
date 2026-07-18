import { useEffect, useMemo, useRef, useState } from "react";
import type { RealmNode, Portal, Discovery } from "@/game/types";
import { PlaceholderImageProvider, svgToDataUri } from "@/game/imageProvider";
import { Alien } from "./Alien";
import { streamRealmImage, buildRealmPrompt } from "@/lib/streamRealmImage";

const provider = new PlaceholderImageProvider();

// In-memory cache of generated realm art (keyed by realm.seed).
const artCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

const LS_PREFIX = "realm-art:";
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
    /* quota — skip */
  }
}

export function RealmView({
  realm,
  alienX,
  alienY,
  onMoveAlien,
  onPortalActivate,
  onDiscovery,
  disabled,
}: {
  realm: RealmNode;
  alienX: number;
  alienY: number;
  onMoveAlien: (x: number, y: number) => void;
  onPortalActivate: (portal: Portal) => void;
  onDiscovery: (d: Discovery) => void;
  disabled?: boolean;
}) {
  const fallback = useMemo(() => svgToDataUri(provider.render(realm)), [realm]);
  const cachedInit = artCache.get(realm.seed) ?? readLS(realm.seed) ?? null;
  const [art, setArt] = useState<string | null>(cachedInit);
  const [isFinal, setIsFinal] = useState<boolean>(!!cachedInit);

  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverPortal, setHoverPortal] = useState<string | null>(null);
  const [justCelebrated, setJustCelebrated] = useState(false);

  // Kick off generation for this realm if not cached.
  useEffect(() => {
    const cached = artCache.get(realm.seed) ?? readLS(realm.seed);
    if (cached) {
      artCache.set(realm.seed, cached);
      setArt(cached);
      setIsFinal(true);
      return;
    }
    setArt(null);
    setIsFinal(false);

    const controller = new AbortController();
    let alive = true;

    const existing = inflight.get(realm.seed);
    const task =
      existing ??
      streamRealmImage(
        buildRealmPrompt(realm),
        (dataUrl, final) => {
          if (!alive) return;
          setArt(dataUrl);
          setIsFinal(final);
          if (final) {
            artCache.set(realm.seed, dataUrl);
            writeLS(realm.seed, dataUrl);
          }
        },
        controller.signal,
      );
    if (!existing) inflight.set(realm.seed, task);
    task
      .then((finalUrl) => {
        artCache.set(realm.seed, finalUrl);
        writeLS(realm.seed, finalUrl);
      })
      .catch(() => {
        /* stay on fallback */
      })
      .finally(() => {
        inflight.delete(realm.seed);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [realm]);

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
      {/* Fallback SVG scene, always present underneath */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url("${fallback}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: isFinal ? 0 : 0.6,
          transition: "opacity 800ms ease",
        }}
      />
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

      {/* Painting-in indicator */}
      {!isFinal && (
        <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-30 rounded-full bg-black/40 backdrop-blur px-3 py-1 text-[10px] tracking-[0.25em] uppercase text-white/80 toast-in">
          Realm painting…
        </div>
      )}

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
