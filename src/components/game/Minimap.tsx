import { useMemo, useState } from "react";
import type { AdventureState } from "@/game/types";

export function Minimap({
  state,
  onJump,
}: {
  state: AdventureState;
  onJump: (realmId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const layout = useMemo(() => positionNodes(state), [state]);
  const size = expanded ? 520 : 240;
  const svgSize = 400;

  // Build orbit ring radii from unique depths.
  const orbitRadii = useMemo(() => {
    const set = new Set<number>();
    for (const p of Object.values(layout)) {
      const r = Math.round(Math.hypot(p.x - 200, p.y - 200));
      if (r > 4) set.add(r);
    }
    return [...set].sort((a, b) => a - b);
  }, [layout]);

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
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] uppercase tracking-[0.2em] text-white/70 hover:text-white"
        >
          {expanded ? "shrink" : "expand"}
        </button>
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
        <circle cx={200} cy={200} r={90} fill="url(#mm-core)" />

        {/* orbital rings */}
        {orbitRadii.map((r) => (
          <circle
            key={r}
            cx={200}
            cy={200}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={0.6}
            strokeDasharray="1 3"
          />
        ))}

        {/* connections */}
        {state.connections.map((c, i) => {
          const a = layout[c.fromRealmId];
          const b = layout[c.toRealmId];
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

        {/* nodes */}
        {Object.values(state.realms).map((r, idx) => {
          const pos = layout[r.id];
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

          // Alternate label above/below to avoid overlap on linear chains.
          const labelBelow = idx % 2 === 0;
          const labelY = labelBelow ? 20 : -14;
          const title = truncate(r.title, expanded ? 22 : 14);
          const labelW = Math.max(38, title.length * 5.2);

          return (
            <g
              key={r.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              className="cursor-pointer minimap-node"
              onClick={() => onJump(r.id)}
            >
              {/* soft halo */}
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
              {/* label with pill background so overlaps are readable */}
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

  // Golden-angle jitter so single-child chains fan into a spiral instead
  // of collapsing to a straight line where labels overlap.
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
