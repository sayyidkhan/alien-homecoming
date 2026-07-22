import { useEffect } from "react";

export function Transition({
  label,
  crossed,
  destinationReady,
  onCross,
  onDone,
}: {
  label: string;
  crossed: boolean;
  destinationReady: boolean;
  onCross: () => void;
  onDone: () => void;
}) {
  useEffect(() => {
    if (crossed) return;
    const t = window.setTimeout(onCross, 900);
    return () => window.clearTimeout(t);
  }, [crossed, onCross]);

  useEffect(() => {
    if (!crossed || !destinationReady) return;
    const t = window.setTimeout(onDone, 520);
    return () => window.clearTimeout(t);
  }, [crossed, destinationReady, onDone]);

  const status = !crossed
    ? "crossing the threshold"
    : destinationReady
      ? "a new world comes into view"
      : "the next world is forming";

  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden bg-[#05030f]">
      <div className="transition-cutscene-stars absolute inset-0" />
      <div className="transition-cutscene-vignette absolute inset-0" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="transition-portal mx-auto">
            <div className="transition-portal-core" />
          </div>
          <div className="mt-7 text-[10px] uppercase tracking-[0.42em] text-white/60">{status}</div>
          <div className="mt-2 font-serif text-3xl text-white/95">{label}</div>
          <div className="mt-4 flex justify-center gap-2" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="transition-cutscene-dot h-1.5 w-1.5 rounded-full bg-white/80"
                style={{ animation: `pulseDot 1.2s ${i * 0.15}s infinite` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
