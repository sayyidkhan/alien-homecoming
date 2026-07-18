import { useEffect } from "react";

export function Transition({
  label,
  onDone,
}: {
  label: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 1400);
    return () => window.clearTimeout(t);
  }, [onDone]);
  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      <div className="absolute inset-0 transition-warp bg-gradient-radial" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center transition-text">
          <div className="text-[10px] uppercase tracking-[0.4em] text-white/60">
            crossing
          </div>
          <div className="mt-2 font-serif text-3xl text-white/95">{label}</div>
          <div className="mt-4 flex justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-white/80"
                style={{ animation: `pulseDot 1.2s ${i * 0.15}s infinite` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
