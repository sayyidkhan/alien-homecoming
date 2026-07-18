import { useEffect, useMemo, useState } from "react";
import type { AdventureState, RealmNode } from "@/game/types";
import { getCachedArtAsync } from "@/lib/realmArtCache";

export function WorldAtlas({
  state,
  onClose,
  onJump,
}: {
  state: AdventureState;
  onClose: () => void;
  onJump: (realmId: string) => void;
}) {
  const realms = useMemo(
    () =>
      Object.values(state.realms).sort(
        (a, b) => (a.visitedAt ?? 0) - (b.visitedAt ?? 0),
      ),
    [state.realms],
  );
  const [artBySeed, setArtBySeed] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    void Promise.all(
      realms.map(async (r) => [r.seed, await getCachedArtAsync(r.seed)] as const),
    ).then((entries) => {
      if (!alive) return;
      setArtBySeed(
        Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => !!entry[1])),
      );
    });
    return () => {
      alive = false;
    };
  }, [realms]);

  const cachedCount = Object.keys(artBySeed).length;

  return (
    <div
      className="absolute inset-0 z-[60] flex flex-col bg-black/85 backdrop-blur-xl"
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full w-full max-w-6xl flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-white/50">
              your journey so far
            </div>
            <h2 className="mt-1 font-serif text-3xl text-white">
              The Atlas of Worlds
            </h2>
            <p className="mt-1 text-sm text-white/60">
              {realms.length} universe{realms.length === 1 ? "" : "s"} discovered ·{" "}
              {cachedCount} painted &amp; saved on this device · {state.homeEchoes.length}/3 home echoes
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.25em] text-white/80 hover:bg-white/15"
          >
            close
          </button>
        </div>

        <div className="mt-6 grid flex-1 gap-4 overflow-y-auto pr-2 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {realms.map((r) => (
            <AtlasCard
              key={r.id}
              realm={r}
              art={artBySeed[r.seed] ?? null}
              current={r.id === state.currentRealmId}
              onJump={() => {
                onJump(r.id);
                onClose();
              }}
            />
          ))}
        </div>

        <div className="mt-4 text-center text-[10px] uppercase tracking-[0.3em] text-white/40">
          painted universes stay saved in this browser — revisits are instant
        </div>
      </div>
    </div>
  );
}

function AtlasCard({
  realm,
  art,
  current,
  onJump,
}: {
  realm: RealmNode;
  art: string | null;
  current: boolean;
  onJump: () => void;
}) {
  const foundEchoes = realm.discoveries.filter(
    (d) => d.kind === "home_echo" && d.found,
  ).length;
  const badge =
    realm.special === "start"
      ? "start"
      : realm.special === "false_home"
        ? "a place that isn't quite"
        : realm.special === "real_home"
          ? "home"
          : `depth ${realm.depth}`;

  return (
    <button
      type="button"
      onClick={onJump}
      className={`group relative overflow-hidden rounded-xl border text-left transition-transform hover:-translate-y-0.5 ${
        current
          ? "border-white/70 shadow-[0_0_24px_rgba(255,217,168,0.35)]"
          : "border-white/10 hover:border-white/30"
      }`}
      style={{
        background: art
          ? `linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.75) 100%), url("${art}") center/cover`
          : `linear-gradient(140deg, ${realm.palette[0]}, ${realm.palette[1]})`,
      }}
    >
      <div className="flex h-44 flex-col justify-between p-3">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-[9px] uppercase tracking-[0.25em] text-white/80 backdrop-blur">
            {badge}
          </span>
          {art ? (
            <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-emerald-200">
              saved
            </span>
          ) : (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-white/60">
              unpainted
            </span>
          )}
        </div>
        <div>
          <div className="font-serif text-lg leading-tight text-white drop-shadow">
            {realm.title}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/70">
            <span>{realm.portals.length} portals</span>
            {foundEchoes > 0 && (
              <span className="text-[#ffd9a8]">· echo found</span>
            )}
            {current && <span className="text-white">· you are here</span>}
          </div>
        </div>
      </div>
    </button>
  );
}
