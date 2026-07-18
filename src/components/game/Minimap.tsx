import { useEffect, useMemo, useRef, useState } from "react";
import type { AdventureState } from "@/game/types";

type ViewMode = "2d" | "3d";

export function Minimap({
  state,
  onJump,
}: {
  state: AdventureState;
  onJump: (realmId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<ViewMode>("2d");
  const [yaw, setYaw] = useState(0);
  const rafRef = useRef<number | null>(null);

  const layout = useMemo(() => positionNodes(state), [state]);
  const size = expanded ? 520 : 240;
  const svgSize = 400;

  // Auto-rotate in 3D
  useEffect(() => {
    if (mode !== "3d") return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setYaw((y) => (y + dt * 0.25) % (Math.PI * 2));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [mode]);

  // Depth (BFS) for vertical lift in 3D
  const depthMap = useMemo(() => computeDepths(state), [state]);

  // Project each node to screen coords
  const projected = useMemo(() => {
    const out: Record<
      string,
      { x: number; y: number; scale: number; z: number }
    > = {};
    const tilt = mode === "3d" ? 0.95 : 0; // radians, ~55°
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cx = 200;
    const cy = 200;
    for (const [id, p] of Object.entries(layout)) {
      // world coords centered
      const wx = p.x - cx;
      const wz = p.y - cy;
      const depth = depthMap[id] ?? 0;
      const wy = mode === "3d" ? -depth * 22 : 0; // lift outer nodes up
      // yaw around Y
      const rx = wx * cosY + wz * sinY;
      const rz = -wx * sinY + wz * cosY;
      // tilt around X
      const ry = wy * cosT - rz * sinT;
      const rzz = wy * sinT + rz * cosT;
      // simple perspective
      const persp = 460 / (460 + rzz);
      out[id] = {
        x: cx + rx * persp,
        y: cy + ry * persp,
        scale: persp,
        z: rzz,
      };
    }
    return out;
  }, [layout, mode, yaw, depthMap]);

  // Orbit rings — flat circle in 2D, tilted ellipses in 3D
  const orbitRadii = useMemo(() => {
    const set = new Set<number>();
    for (const p of Object.values(layout)) {
      const r = Math.round(Math.hypot(p.x - 200, p.y - 200));
      if (r > 4) set.add(r);
    }
    return [...set].sort((a, b) => a - b);
  }, [layout]);

  const ringTiltY = mode === "3d" ? Math.cos(0.95) : 1; // squash factor

  // Sort nodes back-to-front for painter's algorithm
  const drawOrder = useMemo(() => {
    return Object.values(state.realms).slice().sort((a, b) => {
      const za = projected[a.id]?.z ?? 0;
      const zb = projected[b.id]?.z ?? 0;
      return zb - za;
    });
  }, [state.realms, projected]);

  return (
    <div
      className={`minimap ${expanded ? "minimap-expanded" : ""}`}
      style={{ width: size, height: size }}
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
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] uppercase tracking-[0.2em] text-white/70 hover:text-white"
          >
            {expanded ? "shrink" : "expand"}
          </button>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        className="relative z-10 w-full flex-1"
      >
        <defs>
          <radialGradient id="mm-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,240,210,0.55)" />
            <stop offset="60%" stopColor="rgba(180,140,255,0.10)" />
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

        {/* galactic core glow */}
        <ellipse
          cx={200}
          cy={200}
          rx={90}
          ry={90 * ringTiltY}
          fill="url(#mm-core)"
        />

        {/* orbital rings — tilted ellipses in 3D */}
        {orbitRadii.map((r) => (
          <ellipse
            key={r}
            cx={200}
            cy={200}
            rx={r}
            ry={r * ringTiltY}
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
              stroke="rgba(200,180,255,0.35)"
              strokeWidth={0.9}
              strokeDasharray="2 4"
            />
          );
        })}

        {/* 3D drop-lines from node down to base plane */}
        {mode === "3d" &&
          drawOrder.map((r) => {
            const p = projected[r.id];
            if (!p) return null;
            // ground = same node without vertical lift
            const cx = 200;
            const wx = layout[r.id].x - cx;
            const wz = layout[r.id].y - cx;
            const cosY = Math.cos(yaw);
            const sinY = Math.sin(yaw);
            const rx = wx * cosY + wz * sinY;
            const rz = -wx * sinY + wz * cosY;
            const sinT = Math.sin(0.95);
            const cosT = Math.cos(0.95);
            const ry = -rz * sinT;
            const rzz = rz * cosT;
            const persp = 460 / (460 + rzz);
            return (
              <line
                key={`drop-${r.id}`}
                x1={p.x}
                y1={p.y}
                x2={cx + rx * persp}
                y2={cx + ry * persp}
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={0.5}
                strokeDasharray="1 2"
              />
            );
          })}

        {/* nodes — painter's order */}
        {drawOrder.map((r, idx) => {
          const pos = projected[r.id];
          if (!pos) return null;
          const isCurrent = r.id === state.currentRealmId;
          const hasEcho = r.discoveries.some(
            (d) => d.kind === "home_echo" && d.found,
          );
          const hasUnfound = r.discoveries.some((d) => !d.found);
          const isFalseHome = r.special === "false_home";
          const isRealHome = r.special === "real_home";
          const isStart = r.special === "start";
          const fill = isRealHome
            ? "#fff2c8"
            : isFalseHome
              ? "#c894ff"
              : isStart
                ? "#a8c5ff"
                : hasEcho
                  ? "#ffd9a8"
                  : "#e7a8c9";

          const labelBelow = idx % 2 === 0;
          const labelY = labelBelow ? 20 : -14;
          const title = truncate(r.title, expanded ? 22 : 14);
          const labelW = Math.max(38, title.length * 5.2);
          const s = pos.scale;

          return (
            <g
              key={r.id}
              transform={`translate(${pos.x}, ${pos.y}) scale(${s})`}
              className="cursor-pointer minimap-node"
              onClick={() => onJump(r.id)}
              opacity={0.4 + 0.6 * s}
            >
              <circle r={11} fill={fill} opacity={0.18} filter="url(#mm-glow)" />
              {isCurrent && (
                <circle
                  r={13}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={1.2}
                  className="minimap-current"
                />
              )}
              <circle
                r={5.5}
                fill={fill}
                stroke="rgba(10,6,24,0.9)"
                strokeWidth={0.8}
              />
              {hasUnfound && (
                <circle r={2} cx={5} cy={-5} fill="#fff" opacity={0.95} />
              )}
              <g transform={`translate(0, ${labelY})`}>
                <rect
                  x={-labelW / 2}
                  y={-6}
                  width={labelW}
                  height={12}
                  rx={6}
                  fill="rgba(10,6,24,0.72)"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={0.5}
                />
                <text
                  textAnchor="middle"
                  y={2.5}
                  fontSize={7}
                  fill="rgba(255,255,255,0.9)"
                  fontFamily="system-ui, sans-serif"
                  letterSpacing="0.03em"
                >
                  {title}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
      <div className="relative z-10 flex flex-wrap gap-x-3 gap-y-1 px-3 pb-2 text-[9px] uppercase tracking-widest text-white/60">
        <span><Dot color="#a8c5ff" /> start</span>
        <span><Dot color="#e7a8c9" /> realm</span>
        <span><Dot color="#ffd9a8" /> echo</span>
        <span><Dot color="#c894ff" /> false</span>
        <span><Dot color="#fff2c8" /> home</span>
      </div>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full align-middle"
      style={{ background: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
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
