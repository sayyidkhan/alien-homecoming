import { useEffect, useState } from "react";
import type { HomeEcho, RealmNode } from "@/game/types";

export function HUD({
  realm,
  echoes,
  onReset,
  ended,
}: {
  realm: RealmNode;
  echoes: HomeEcho[];
  onReset: () => void;
  ended: boolean;
}) {
  return (
    <>
      <div className="hud-top pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-between p-4">
        <div className="pointer-events-auto max-w-md rounded-xl border border-white/10 bg-black/25 px-4 py-3 backdrop-blur-md">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/60">
            {realm.special === "start"
              ? "The Threshold"
              : realm.special === "false_home"
                ? "A place that isn't quite"
                : realm.special === "real_home"
                  ? "Home"
                  : `Realm · depth ${realm.depth}`}
          </div>
          <h1 className="mt-1 font-serif text-2xl text-white/95">{realm.title}</h1>
          <p className="mt-1 text-sm leading-snug text-white/70">{realm.description}</p>
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <EchoTracker echoes={echoes} />
          <button
            type="button"
            onClick={() => {
              if (confirm("Abandon this journey and begin again?")) onReset();
            }}
            className="rounded-md border border-white/15 bg-black/25 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-white/70 backdrop-blur-md hover:text-white"
          >
            begin again
          </button>
        </div>
      </div>
      {ended && <EndingBanner onReset={onReset} />}
    </>
  );
}

function EchoTracker({ echoes }: { echoes: HomeEcho[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 backdrop-blur-md">
      <div className="text-[10px] uppercase tracking-[0.3em] text-white/60">
        home echoes · {echoes.length}/3
      </div>
      <div className="mt-1 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-2.5 w-8 rounded-full transition-colors ${
              echoes[i] ? "bg-[#ffd9a8] shadow-[0_0_8px_#ffd9a8]" : "bg-white/10"
            }`}
            title={echoes[i]?.title ?? "not yet found"}
          />
        ))}
      </div>
      {echoes.length >= 3 && (
        <div className="mt-1 text-[10px] italic text-[#ffd9a8]">
          A doorway waits. Look up.
        </div>
      )}
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
        <div className="text-[11px] uppercase tracking-[0.3em] text-white/60">
          the way back
        </div>
        <div className="mt-2 font-serif text-2xl text-white">
          You drew your own map home.
        </div>
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
