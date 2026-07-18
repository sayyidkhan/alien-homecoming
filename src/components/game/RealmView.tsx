import { useEffect, useMemo, useRef, useState } from "react";
import type { RealmNode, Portal, Discovery } from "@/game/types";
import { PlaceholderImageProvider, svgToDataUri } from "@/game/imageProvider";
import { Alien } from "./Alien";

const provider = new PlaceholderImageProvider();

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
  const bg = useMemo(() => svgToDataUri(provider.render(realm)), [realm]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverPortal, setHoverPortal] = useState<string | null>(null);
  const [justCelebrated, setJustCelebrated] = useState(false);

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
    // clamp to walkable band
    onMoveAlien(Math.max(0.06, Math.min(0.94, x)), Math.max(0.55, Math.min(0.86, y)));
  }

  return (
    <div
      ref={containerRef}
      onClick={handleSceneClick}
      className="relative h-full w-full overflow-hidden cursor-crosshair select-none"
      style={{
        backgroundImage: `url("${bg}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Ambient particles */}
      <div className="pointer-events-none absolute inset-0 realm-particles" />

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
