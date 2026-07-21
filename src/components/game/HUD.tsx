import { useEffect, useState } from "react";
import type { HomeEcho, RealmNode } from "@/game/types";
import { PrewarmStatus } from "@/components/game/PrewarmHUD";
import { APP_RELEASE } from "@/lib/release";

export function HUD({
  realm,
  echoes,
  onReset,
  ended,
  currentSeed,
}: {
  realm: RealmNode;
  echoes: HomeEcho[];
  onReset: () => void;
  ended: boolean;
  currentSeed: string;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <>
      <div className="hud-top pointer-events-none absolute inset-x-0 top-0 z-40 p-4">
        <div
          className={`hud-flip-card pointer-events-auto ${detailsOpen ? "hud-flip-card-open" : ""}`}
        >
          <div className="hud-flip-card-inner">
            <section className="hud-flip-card-face rounded-xl border border-white/10 bg-black/25 px-4 py-3 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full border border-white/10 text-sm text-white/55 transition hover:bg-white/10 hover:text-white"
                aria-label="Show journey details"
                title="Journey details"
              >
                ⋯
              </button>
              <div className="pr-9 text-[10px] uppercase tracking-[0.3em] text-white/60">
                {realm.special === "start"
                  ? "The Threshold"
                  : realm.special === "false_home"
                    ? "A place that isn't quite"
                    : realm.special === "real_home"
                      ? "Home"
                      : `Realm · depth ${realm.depth}`}
              </div>
              <h1 className="mt-0.5 font-serif text-xl text-white/95">{realm.title}</h1>
              <p className="mt-1 max-h-9 overflow-hidden text-xs leading-relaxed text-white/70">
                {realm.description}
              </p>
            </section>
            <section className="hud-flip-card-face hud-flip-card-back rounded-xl border border-white/10 bg-black/35 px-4 py-3 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full border border-white/10 text-sm text-white/55 transition hover:bg-white/10 hover:text-white"
                aria-label="Return to realm details"
                title="Back to realm"
              >
                ×
              </button>
              <JourneyDetails echoes={echoes} onReset={onReset} currentSeed={currentSeed} />
            </section>
          </div>
        </div>
      </div>
      {ended && <EndingBanner onReset={onReset} />}
    </>
  );
}

function JourneyDetails({
  echoes,
  onReset,
  currentSeed,
}: {
  echoes: HomeEcho[];
  onReset: () => void;
  currentSeed: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pr-8">
        <div className="text-[10px] uppercase tracking-[0.24em] text-white/60">journey home</div>
        <div
          className="text-xs tabular-nums text-[#ffd9a8]"
          aria-label={`${echoes.length} of 3 Home Echoes found`}
        >
          <span className="font-medium text-white">{echoes.length}</span>/3
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <div
          className="flex gap-1.5"
          role="progressbar"
          aria-label="Home Echoes found"
          aria-valuemin={0}
          aria-valuemax={3}
          aria-valuenow={echoes.length}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 w-8 rounded-full transition-colors ${
                echoes[i] ? "bg-[#ffd9a8] shadow-[0_0_8px_#ffd9a8]" : "bg-white/10"
              }`}
              title={echoes[i]?.title ?? "not yet found"}
            />
          ))}
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-white/[0.06] px-2.5 py-2">
        <PrewarmStatus currentSeed={currentSeed} compact />
      </div>
      <div className="mt-auto flex items-center justify-between pt-2">
        <span className="text-[9px] uppercase tracking-[0.18em] text-white/40">{APP_RELEASE}</span>
        <button
          type="button"
          onClick={() => {
            if (confirm("Start a new journey? Your current progress will be cleared.")) onReset();
          }}
          className="rounded-md px-1.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/60 transition hover:bg-white/10 hover:text-white"
          title="Clear progress and start again"
        >
          ↺ restart
        </button>
      </div>
    </div>
  );
}

export function DiscoveryToast({ message }: { message: string | null }) {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    setShown(message);
    const t = window.setTimeout(() => setShown(null), 4200);
    return () => window.clearTimeout(t);
  }, [message]);
  if (!shown) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 z-50 flex justify-center">
      <div className="toast-in rounded-xl border border-white/15 bg-black/60 px-5 py-3 text-center backdrop-blur-md">
        <div className="font-serif text-lg text-[#ffd9a8]">{shown}</div>
      </div>
    </div>
  );
}

function EndingBanner({ onReset }: { onReset: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-8 z-40 flex justify-center">
      <div className="rounded-2xl border border-white/15 bg-black/50 px-8 py-5 text-center backdrop-blur-lg">
        <div className="text-[11px] uppercase tracking-[0.3em] text-white/60">the way back</div>
        <div className="mt-2 font-serif text-2xl text-white">You drew your own map home.</div>
        <p className="mt-2 max-w-md text-sm text-white/70">
          Every doorway you crossed is still yours. Rest here, or wander again.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="mt-4 rounded-md border border-white/25 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.25em] text-white hover:bg-white/20"
        >
          begin another journey
        </button>
      </div>
    </div>
  );
}
