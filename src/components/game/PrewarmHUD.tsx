import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getPrewarmSnapshot,
  getPrewarmServerSnapshot,
  subscribePrewarm,
  type PrewarmJob,
} from "@/lib/realmArtCache";

function usePrewarmJobs(): PrewarmJob[] {
  return useSyncExternalStore(
    subscribePrewarm,
    getPrewarmSnapshot,
    getPrewarmServerSnapshot,
  );
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function PrewarmHUD({ currentSeed }: { currentSeed: string }) {
  const jobs = usePrewarmJobs();
  const now = useNow();
  // Hide the foreground realm's own job — that already has a full-screen loader.
  const bg = jobs.filter((j) => j.seed !== currentSeed);
  if (bg.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/55 px-4 py-3 text-white/85 backdrop-blur-md shadow-lg">
      <div className="mb-2 flex items-center gap-2 text-[9px] uppercase tracking-[0.3em] text-white/60">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-400/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-fuchsia-300" />
        </span>
        Painting ahead · {bg.length} {bg.length === 1 ? "world" : "worlds"}
      </div>
      <ul className="flex flex-col gap-1.5 min-w-[220px]">
        {bg.map((j) => (
          <li key={j.seed} className="flex items-center gap-3">
            <span
              className="truncate font-serif text-xs text-white/90"
              style={{ maxWidth: 180 }}
              title={j.title}
            >
              {j.title}
            </span>
            <div className="ml-auto h-1 w-16 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-amber-200 transition-[width] duration-500"
                style={{
                  width:
                    j.status === "queued"
                      ? "6%"
                      : j.status === "waiting"
                        ? "20%"
                        : j.status === "retrying"
                          ? "15%"
                      : `${Math.max(8, Math.round(j.progress * 100))}%`,
                }}
              />
            </div>
            <span className="w-20 text-right text-[9px] uppercase tracking-[0.2em] text-white/50">
              {j.status === "queued"
                ? `queued ${Math.max(0, Math.floor((now - j.createdAt) / 1000))}s`
                : j.status === "waiting"
                  ? "shared wait"
                  : j.status === "retrying"
                    ? "retrying"
                : `${Math.max(0, Math.floor((now - j.createdAt) / 1000))}s`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
