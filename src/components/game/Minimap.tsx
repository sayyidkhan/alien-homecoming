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

  // Simple radial layout by BFS from start.
  const layout = useMemo(() => positionNodes(state), [state]);

  const size = expanded ? 520 : 220;
  const svgSize = 400;

  return (
    <div
      className={`minimap ${expanded ? "minimap-expanded" : ""}`}
      style={{ width: size, height: size }}
    >
      <div className="flex items-center justify-between px-3 pt-2">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/60">
          your map home
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] uppercase tracking-[0.2em] text-white/70 hover:text-white"
        >
          {expanded ? "shrink" : "expand"}
        </button>
      </div>
      <svg viewBox={`0 0 ${svgSize} ${svgSize}`} className="w-full flex-1">
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
              stroke="rgba(255,220,180,0.35)"
              strokeWidth={1.2}
              strokeDasharray="3 4"
            />
          );
        })}
        {Object.values(state.realms).map((r) => {
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
          return (
            <g
              key={r.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              className="cursor-pointer"
              onClick={() => onJump(r.id)}
            >
              {isCurrent && (
                <circle r={14} fill="none" stroke="#fff" strokeWidth={1.5} className="minimap-current" />
              )}
              <circle r={7} fill={fill} stroke="#0a0618" strokeWidth={1} />
              {hasUnfound && (
                <circle r={3} cx={7} cy={-7} fill="#fff" opacity={0.9} />
              )}
              {expanded && (
                <text
                  x={0}
                  y={22}
                  textAnchor="middle"
                  fontSize={9}
                  fill="rgba(255,255,255,0.85)"
                  fontFamily="system-ui"
                >
                  {r.title}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-2 px-3 pb-2 text-[9px] uppercase tracking-widest text-white/50">
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
      style={{ background: color }}
    />
  );
}

function positionNodes(state: AdventureState): Record<string, { x: number; y: number }> {
  const center = { x: 200, y: 200 };
  const positions: Record<string, { x: number; y: number }> = {};
  const startId = state.homeRealmId;
  positions[startId] = center;

  // BFS
  const adjacency: Record<string, string[]> = {};
  for (const c of state.connections) {
    (adjacency[c.fromRealmId] ??= []).push(c.toRealmId);
    (adjacency[c.toRealmId] ??= []).push(c.fromRealmId);
  }
  const visited = new Set<string>([startId]);
  const queue: Array<{ id: string; depth: number; angleStart: number; angleEnd: number }> = [
    { id: startId, depth: 0, angleStart: 0, angleEnd: Math.PI * 2 },
  ];
  while (queue.length) {
    const { id, depth, angleStart, angleEnd } = queue.shift()!;
    const children = (adjacency[id] ?? []).filter((c) => !visited.has(c));
    const angleSpan = angleEnd - angleStart;
    children.forEach((child, idx) => {
      visited.add(child);
      const t = children.length === 1 ? 0.5 : idx / (children.length - 1 || 1);
      const angle = angleStart + t * angleSpan;
      const r = 45 + depth * 55;
      positions[child] = {
        x: center.x + Math.cos(angle) * r,
        y: center.y + Math.sin(angle) * r,
      };
      const sub = angleSpan / Math.max(children.length, 1);
      queue.push({
        id: child,
        depth: depth + 1,
        angleStart: angle - sub / 2,
        angleEnd: angle + sub / 2,
      });
    });
  }
  // Any orphaned realms — place near center.
  Object.values(state.realms).forEach((r, i) => {
    if (!positions[r.id]) {
      const a = (i * 2.4) % (Math.PI * 2);
      positions[r.id] = { x: center.x + Math.cos(a) * 30, y: center.y + Math.sin(a) * 30 };
    }
  });
  return positions;
}
