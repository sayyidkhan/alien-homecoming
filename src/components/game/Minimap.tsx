import { useEffect, useMemo, useRef, useState } from "react";
import type { AdventureState, RealmNode } from "@/game/types";

type ViewMode = "2d" | "3d";

// Deterministic pseudo-random from string (for star field & node jitter)
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

type Body = "sun-home" | "sun-start" | "star-echo" | "star" | "blackhole";

function classifyBody(r: RealmNode): Body {
  if (r.special === "real_home") return "sun-home";
  if (r.special === "false_home") return "blackhole";
  if (r.special === "start") return "sun-start";
  if (r.discoveries.some((d) => d.kind === "home_echo" && d.found))
    return "star-echo";
  return "star";
}

export function Minimap({
  state,
  onJump,
}: {
  state: AdventureState;
  onJump: (realmId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [mode, setMode] = useState<ViewMode>("2d");
  // Static tilt angle for 3D; user can drag to rotate.
  const [yaw, setYaw] = useState(-0.4);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; startYaw: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);


  const layout = useMemo(() => positionNodes(state), [state]);
  const size = fullscreen ? undefined : expanded ? 520 : 240;
  const svgSize = 400;

  const depthMap = useMemo(() => computeDepths(state), [state]);

  // Backdrop starfield — deterministic per session id
  const starField = useMemo(() => {
    const seed = state.homeRealmId || "sky";
    const stars: Array<{ x: number; y: number; r: number; o: number }> = [];
    for (let i = 0; i < 120; i++) {
      const a = hash(seed + "sx" + i);
      const b = hash(seed + "sy" + i);
      const c = hash(seed + "sr" + i);
      const d = hash(seed + "so" + i);
      stars.push({
        x: a * svgSize,
        y: b * svgSize,
        r: 0.2 + c * 0.9,
        o: 0.15 + d * 0.55,
      });
    }
    return stars;
  }, [state.homeRealmId]);

  // Project a world point through yaw + tilt + perspective
  const project = useMemo(() => {
    const tilt = mode === "3d" ? 0.95 : 0;
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cx = 200;
    const cy = 200;
    return (wx0: number, wy0: number, wz0: number) => {
      const wx = wx0 - cx;
      const wz = wy0 - cy; // input y is z in world
      const wy = wz0;
      const rx = wx * cosY + wz * sinY;
      const rz = -wx * sinY + wz * cosY;
      const ry = wy * cosT - rz * sinT;
      const rzz = wy * sinT + rz * cosT;
      const persp = 460 / (460 + rzz);
      return { x: cx + rx * persp, y: cy + ry * persp, scale: persp, z: rzz };
    };
  }, [mode, yaw]);

  const projected = useMemo(() => {
    const out: Record<
      string,
      { x: number; y: number; scale: number; z: number }
    > = {};
    for (const [id, p] of Object.entries(layout)) {
      const depth = depthMap[id] ?? 0;
      const lift = mode === "3d" ? -depth * 22 : 0;
      out[id] = project(p.x, p.y, lift);
    }
    return out;
  }, [layout, depthMap, mode, project]);

  const orbitRadii = useMemo(() => {
    const set = new Set<number>();
    for (const p of Object.values(layout)) {
      const r = Math.round(Math.hypot(p.x - 200, p.y - 200));
      if (r > 4) set.add(r);
    }
    return [...set].sort((a, b) => a - b);
  }, [layout]);

  const ringSquash = mode === "3d" ? Math.cos(0.95) : 1;

  const drawOrder = useMemo(() => {
    return Object.values(state.realms).slice().sort((a, b) => {
      const za = projected[a.id]?.z ?? 0;
      const zb = projected[b.id]?.z ?? 0;
      return zb - za;
    });
  }, [state.realms, projected]);

  // Drag to rotate (3D) or pan (both modes with shift/middle, or when zoomed)
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.shiftKey || e.button === 1 || (mode === "2d" && zoom > 1.01)) {
      panRef.current = { x: e.clientX, y: e.clientY, startX: pan.x, startY: pan.y };
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (mode !== "3d") return;
    dragRef.current = { x: e.clientX, startYaw: yaw };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (panRef.current) {
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const scale = svgSize / zoom / rect.width;
      setPan({
        x: panRef.current.startX - (e.clientX - panRef.current.x) * scale,
        y: panRef.current.startY - (e.clientY - panRef.current.y) * scale,
      });
      return;
    }
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    setYaw(dragRef.current.startYaw + dx * 0.01);
  };
  const onPointerUp = () => {
    dragRef.current = null;
    panRef.current = null;
  };
  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    setZoom((z) => Math.min(6, Math.max(0.5, z * factor)));
  };
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setYaw(-0.4);
  };

  const viewSize = svgSize / zoom;
  const viewX = (svgSize - viewSize) / 2 + pan.x;
  const viewY = (svgSize - viewSize) / 2 + pan.y;


  return (
    <div
      className={`minimap ${expanded ? "minimap-expanded" : ""} ${fullscreen ? "minimap-fullscreen" : ""}`}
      style={fullscreen ? undefined : { width: size, height: size }}
    >
      <div className="minimap-cosmos" aria-hidden />
      <div className="relative z-10 flex items-center justify-between px-3 pt-2">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/70">
          star chart
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-full border border-white/15 text-[9px] uppercase tracking-[0.2em]">
            <button
              type="button"
              onClick={() => setMode("2d")}
              className={`px-2 py-0.5 transition-colors ${
                mode === "2d"
                  ? "bg-white/90 text-black"
                  : "text-white/70 hover:text-white"
              }`}
            >
              2d
            </button>
            <button
              type="button"
              onClick={() => setMode("3d")}
              className={`px-2 py-0.5 transition-colors ${
                mode === "3d"
                  ? "bg-white/90 text-black"
                  : "text-white/70 hover:text-white"
              }`}
            >
              3d
            </button>
          </div>
          <div className="flex overflow-hidden rounded-full border border-white/15 text-[10px] tracking-[0.1em] text-white/70">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}
              aria-label="zoom out"
              className="px-2 py-0.5 hover:bg-white/10 hover:text-white"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(6, z * 1.25))}
              aria-label="zoom in"
              className="px-2 py-0.5 border-l border-white/15 hover:bg-white/10 hover:text-white"
            >
              +
            </button>
            <button
              type="button"
              onClick={resetView}
              aria-label="recenter on start"
              className="px-2 py-0.5 border-l border-white/15 text-[9px] uppercase tracking-[0.2em] hover:bg-white/10 hover:text-white"
            >
              home
            </button>
          </div>
          {!fullscreen && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-[10px] uppercase tracking-[0.2em] text-white/70 hover:text-white"
            >
              {expanded ? "shrink" : "expand"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            aria-label={fullscreen ? "exit fullscreen" : "fullscreen"}
            className="text-[10px] uppercase tracking-[0.2em] text-white/70 hover:text-white"
          >
            {fullscreen ? "close" : "full"}
          </button>
        </div>
      </div>

      <svg
        viewBox={`${viewX} ${viewY} ${viewSize} ${viewSize}`}
        className="relative z-10 w-full flex-1 touch-none"
        style={{ cursor: panRef.current ? "grabbing" : mode === "3d" || zoom > 1.01 ? "grab" : "default" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}

        onPointerLeave={onPointerUp}
        onWheel={onWheel}

      >
        <defs>
          {/* Sun (yellow-white) */}
          <radialGradient id="mm-sun-home" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fffbe6" />
            <stop offset="40%" stopColor="#ffd76a" />
            <stop offset="100%" stopColor="rgba(255,180,60,0)" />
          </radialGradient>
          {/* Blue sun (start) */}
          <radialGradient id="mm-sun-start" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ecf5ff" />
            <stop offset="40%" stopColor="#8ab7ff" />
            <stop offset="100%" stopColor="rgba(80,120,255,0)" />
          </radialGradient>
          {/* Echo star (warm) */}
          <radialGradient id="mm-star-echo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff2d6" />
            <stop offset="45%" stopColor="#ffbf7a" />
            <stop offset="100%" stopColor="rgba(255,150,80,0)" />
          </radialGradient>
          {/* Ordinary star (pink-violet) */}
          <radialGradient id="mm-star" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffe4f0" />
            <stop offset="45%" stopColor="#e7a8c9" />
            <stop offset="100%" stopColor="rgba(200,120,180,0)" />
          </radialGradient>
          {/* Black hole accretion ring */}
          <radialGradient id="mm-blackhole" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000000" />
            <stop offset="55%" stopColor="#000000" />
            <stop offset="70%" stopColor="#c894ff" />
            <stop offset="85%" stopColor="rgba(200,148,255,0.3)" />
            <stop offset="100%" stopColor="rgba(200,148,255,0)" />
          </radialGradient>
          <radialGradient id="mm-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,240,210,0.4)" />
            <stop offset="60%" stopColor="rgba(180,140,255,0.08)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <filter id="mm-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* backdrop stars */}
        {starField.map((s, i) => (
          <circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill="#ffffff"
            opacity={s.o}
          />
        ))}

        {/* galactic core */}
        <ellipse
          cx={200}
          cy={200}
          rx={90}
          ry={90 * ringSquash}
          fill="url(#mm-core)"
        />

        {/* orbital rings */}
        {orbitRadii.map((r) => (
          <ellipse
            key={r}
            cx={200}
            cy={200}
            rx={r}
            ry={r * ringSquash}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={0.6}
            strokeDasharray="1 3"
          />
        ))}

        {/* connections */}
        {state.connections.map((c, i) => {
          const a = projected[c.fromRealmId];
          const b = projected[c.toRealmId];
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="rgba(200,180,255,0.28)"
              strokeWidth={0.8}
              strokeDasharray="2 4"
            />
          );
        })}

        {/* 3D drop-lines */}
        {mode === "3d" &&
          drawOrder.map((r) => {
            const p = projected[r.id];
            if (!p) return null;
            const g = project(layout[r.id].x, layout[r.id].y, 0);
            return (
              <line
                key={`drop-${r.id}`}
                x1={p.x}
                y1={p.y}
                x2={g.x}
                y2={g.y}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={0.5}
                strokeDasharray="1 2"
              />
            );
          })}

        {/* nodes */}
        {drawOrder.map((r, idx) => {
          const pos = projected[r.id];
          if (!pos) return null;
          const body = classifyBody(r);
          const isCurrent = r.id === state.currentRealmId;
          const hasUnfound = r.discoveries.some((d) => !d.found);
          const labelBelow = idx % 2 === 0;
          const labelY = labelBelow ? 22 : -16;
          const title = truncate(r.title, fullscreen ? 26 : expanded ? 20 : 14);
          const fontSize = (fullscreen ? 7 : 6) / Math.max(0.75, Math.min(zoom, 1.6));

          const labelW = Math.max(44, title.length * (fontSize * 0.72));
          const s = pos.scale;

          return (
            <g
              key={r.id}
              transform={`translate(${pos.x}, ${pos.y}) scale(${s})`}
              className="cursor-pointer minimap-node"
              onClick={() => onJump(r.id)}
              opacity={0.45 + 0.55 * s}
            >
              <CelestialBody body={body} seed={r.id} />
              {isCurrent && (
                <circle
                  r={13}
                  fill="none"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  className="minimap-current"
                />
              )}
              {hasUnfound && (
                <circle r={1.5} cx={7} cy={-7} fill="#fff" opacity={0.95} />
              )}
              <g transform={`translate(0, ${labelY})`}>
                <rect
                  x={-labelW / 2}
                  y={-fontSize + 1}
                  width={labelW}
                  height={fontSize + 4}
                  rx={(fontSize + 4) / 2}
                  fill="rgba(8,4,20,0.88)"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth={0.5}
                />
                <text
                  textAnchor="middle"
                  y={2.8}
                  fontSize={fontSize}
                  fill="rgba(255,255,255,0.95)"
                  fontFamily="system-ui, sans-serif"
                  letterSpacing="0.02em"
                >
                  {title}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
      <div className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-3 pt-1 text-[11px] uppercase tracking-[0.18em] text-white/75">
        <span className="flex items-center gap-1.5"><Dot color="#8ab7ff" size={10} /> start</span>
        <span className="flex items-center gap-1.5"><Dot color="#e7a8c9" size={10} /> star</span>
        <span className="flex items-center gap-1.5"><Dot color="#ffbf7a" size={10} /> echo</span>
        <span className="flex items-center gap-1.5"><Dot color="#c894ff" ring size={10} /> hole</span>
        <span className="flex items-center gap-1.5"><Dot color="#ffd76a" size={10} /> home</span>
        {mode === "3d" && (
          <span className="opacity-60 normal-case tracking-normal">· drag to rotate</span>
        )}
      </div>
    </div>
  );
}

function CelestialBody({ body, seed }: { body: Body; seed: string }) {
  const jitter = hash(seed);
  switch (body) {
    case "sun-home":
      return (
        <>
          <circle
            r={14}
            fill="url(#mm-sun-home)"
            filter="url(#mm-glow)"
            className="sun-halo"
          />
          <circle r={6} fill="#fffbe6" />
          {/* corona rays — slowly drift */}
          <g className="sun-rays">
            {Array.from({ length: 8 }).map((_, i) => {
              const a = (i / 8) * Math.PI * 2 + jitter;
              return (
                <line
                  key={i}
                  x1={Math.cos(a) * 7}
                  y1={Math.sin(a) * 7}
                  x2={Math.cos(a) * 12}
                  y2={Math.sin(a) * 12}
                  stroke="#ffe08a"
                  strokeWidth={0.7}
                  opacity={0.75}
                />
              );
            })}
          </g>
        </>
      );
    case "sun-start":
      return (
        <>
          <circle
            r={12}
            fill="url(#mm-sun-start)"
            filter="url(#mm-glow)"
            className="sun-halo-soft"
          />
          <circle r={5.5} fill="#ecf5ff" />
          <circle
            r={5.5}
            fill="none"
            stroke="#a8c5ff"
            strokeWidth={0.8}
            opacity={0.9}
          />
          {/* faint rays drifting opposite direction */}
          <g className="sun-rays-reverse">
            {Array.from({ length: 6 }).map((_, i) => {
              const a = (i / 6) * Math.PI * 2 + jitter;
              return (
                <line
                  key={i}
                  x1={Math.cos(a) * 6.5}
                  y1={Math.sin(a) * 6.5}
                  x2={Math.cos(a) * 10.5}
                  y2={Math.sin(a) * 10.5}
                  stroke="#bcd4ff"
                  strokeWidth={0.5}
                  opacity={0.55}
                />
              );
            })}
          </g>
        </>
      );
    case "star-echo":
      return (
        <>
          <circle
            r={11}
            fill="url(#mm-star-echo)"
            filter="url(#mm-glow)"
            className="sun-halo-soft"
          />
          <circle r={4.5} fill="#fff2d6" />
          <path
            d="M0,-9 L1,-1 L9,0 L1,1 L0,9 L-1,1 L-9,0 L-1,-1 Z"
            fill="#ffdfa8"
            className="star-twinkle"
          />
        </>
      );
    case "star":
      return (
        <>
          <circle
            r={10}
            fill="url(#mm-star)"
            filter="url(#mm-glow)"
            className="sun-halo-soft"
          />
          <circle r={4} fill="#ffe4f0" />
          <path
            d="M0,-6 L0.7,-0.7 L6,0 L0.7,0.7 L0,6 L-0.7,0.7 L-6,0 L-0.7,-0.7 Z"
            fill="#f4c9de"
            className="star-twinkle"
          />
        </>
      );
    case "blackhole":
      return (
        <>
          {/* accretion disk spins slowly */}
          <g className="blackhole-disk">
            <ellipse rx={13} ry={4.5} fill="none" stroke="#c894ff" strokeWidth={1.2} opacity={0.85} />
            <ellipse rx={13} ry={4.5} fill="none" stroke="#f5d6ff" strokeWidth={0.4} opacity={0.9} />
          </g>
          <circle r={11} fill="url(#mm-blackhole)" opacity={0.9} />
          <circle r={4.5} fill="#000" />
          <circle r={4.5} fill="none" stroke="#c894ff" strokeWidth={0.5} opacity={0.9} />
        </>
      );
  }
}


function Dot({
  color,
  ring,
  size = 8,
}: {
  color: string;
  ring?: boolean;
  size?: number;
}) {
  const style = ring
    ? { background: "#000", boxShadow: `0 0 0 1.5px ${color}, 0 0 8px ${color}`, width: size, height: size }
    : { background: color, boxShadow: `0 0 8px ${color}`, width: size, height: size };
  return <span className="inline-block rounded-full align-middle" style={style} />;
}


function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function computeDepths(state: AdventureState): Record<string, number> {
  const depths: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};
  for (const c of state.connections) {
    (adjacency[c.fromRealmId] ??= []).push(c.toRealmId);
    (adjacency[c.toRealmId] ??= []).push(c.fromRealmId);
  }
  const start = state.homeRealmId;
  depths[start] = 0;
  const queue: string[] = [start];
  while (queue.length) {
    const id = queue.shift()!;
    for (const n of adjacency[id] ?? []) {
      if (depths[n] == null) {
        depths[n] = depths[id] + 1;
        queue.push(n);
      }
    }
  }
  for (const id of Object.keys(state.realms)) {
    if (depths[id] == null) depths[id] = 0;
  }
  return depths;
}

function positionNodes(
  state: AdventureState,
): Record<string, { x: number; y: number }> {
  const center = { x: 200, y: 200 };
  const positions: Record<string, { x: number; y: number }> = {};
  const startId = state.homeRealmId;
  positions[startId] = center;

  const adjacency: Record<string, string[]> = {};
  for (const c of state.connections) {
    (adjacency[c.fromRealmId] ??= []).push(c.toRealmId);
    (adjacency[c.toRealmId] ??= []).push(c.fromRealmId);
  }
  const visited = new Set<string>([startId]);
  const queue: Array<{
    id: string;
    depth: number;
    angleStart: number;
    angleEnd: number;
  }> = [{ id: startId, depth: 0, angleStart: 0, angleEnd: Math.PI * 2 }];

  const GOLDEN = 2.399963;

  while (queue.length) {
    const { id, depth, angleStart, angleEnd } = queue.shift()!;
    const children = (adjacency[id] ?? []).filter((c) => !visited.has(c));
    const angleSpan = angleEnd - angleStart;
    children.forEach((child, idx) => {
      visited.add(child);
      const t =
        children.length === 1 ? 0.5 : idx / (children.length - 1 || 1);
      const jitter =
        children.length === 1 ? GOLDEN * (depth + 1) * 0.5 : 0;
      const angle = angleStart + t * angleSpan + jitter;
      const r = 55 + depth * 42;
      positions[child] = {
        x: center.x + Math.cos(angle) * r,
        y: center.y + Math.sin(angle) * r,
      };
      const sub = Math.max(angleSpan / Math.max(children.length, 1), 0.8);
      queue.push({
        id: child,
        depth: depth + 1,
        angleStart: angle - sub / 2,
        angleEnd: angle + sub / 2,
      });
    });
  }
  Object.values(state.realms).forEach((r, i) => {
    if (!positions[r.id]) {
      const a = (i * GOLDEN) % (Math.PI * 2);
      positions[r.id] = {
        x: center.x + Math.cos(a) * 30,
        y: center.y + Math.sin(a) * 30,
      };
    }
  });
  return positions;
}
