import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getPrewarmSnapshot,
  getPrewarmServerSnapshot,
  subscribePrewarm,
  type PrewarmJob,
} from "@/lib/realmArtCache";

function usePrewarmJobs(): PrewarmJob[] {
  return useSyncExternalStore(subscribePrewarm, getPrewarmSnapshot, getPrewarmServerSnapshot);
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
  return (
    <div className="absolute bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/55 px-4 py-3 text-white/85 backdrop-blur-md shadow-lg">
      <PrewarmStatus currentSeed={currentSeed} />
    </div>
  );
}

export function PrewarmStatus({
  currentSeed,
  compact = false,
}: {
  currentSeed: string;
  compact?: boolean;
}) {
  const jobs = usePrewarmJobs();
  const now = useNow();
  // Hide the foreground realm's own job — that already has a full-screen loader.
  const bg = jobs.filter((j) => j.seed !== currentSeed);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.25em] text-white/60">
        <span className="flex items-center gap-2">
          {bg.length > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-400/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-fuchsia-300" />
            </span>
          )}
          Loading ahead
        </span>
        <span className={bg.length > 0 ? "text-fuchsia-200" : "text-white/45"}>
          {bg.length > 0 ? `${bg.length} active` : "ready"}
        </span>
      </div>
      {!compact && bg.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {bg.slice(0, 2).map((j) => (
            <li key={j.seed} className="flex items-center gap-2">
              <span className="truncate font-serif text-xs text-white/85" title={j.title}>
                {j.title}
              </span>
              <div className="ml-auto h-1 w-14 overflow-hidden rounded-full bg-white/10">
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
              <span className="text-[9px] tabular-nums text-white/45">
                {j.status === "queued"
                  ? `${Math.max(0, Math.floor((now - j.createdAt) / 1000))}s`
                  : j.status === "waiting"
                    ? "wait"
                    : j.status === "retrying"
                      ? "retry"
                      : `${Math.max(0, Math.floor((now - j.createdAt) / 1000))}s`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
