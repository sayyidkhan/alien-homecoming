import type { CSSProperties } from "react";

export function Alien({
  x,
  y,
  facing = 0,
  size = 42,
  celebrating = false,
}: {
  x: number; // 0..1 normalized
  y: number;
  facing?: number; // -1 left, 1 right, 0 forward
  size?: number;
  celebrating?: boolean;
}) {
  const style: CSSProperties = {
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    width: size,
    height: size,
    transform: `translate(-50%, -85%) scaleX(${facing < 0 ? -1 : 1})`,
  };
  return (
    <div
      className="pointer-events-none absolute z-30 transition-[left,top] duration-[900ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]"
      style={style}
      aria-hidden
    >
      <div className={celebrating ? "alien-celebrate" : "alien-bob"}>
        <svg viewBox="0 0 48 48" width={size} height={size}>
          <defs>
            <radialGradient id="alienGlow" cx="50%" cy="60%" r="60%">
              <stop offset="0%" stopColor="#fff2c8" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#fff2c8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="24" cy="42" rx="10" ry="2.5" fill="#000" opacity="0.35" />
          <ellipse cx="24" cy="36" rx="14" ry="6" fill="url(#alienGlow)" opacity="0.55" />
          {/* body */}
          <path
            d="M24 12 C 32 12 34 24 30 32 C 28 36 20 36 18 32 C 14 24 16 12 24 12 Z"
            fill="#e7c8ff"
            stroke="#2a1a4a"
            strokeWidth="1"
          />
          {/* head lights */}
          <circle cx="20" cy="20" r="2" fill="#2a1a4a" />
          <circle cx="28" cy="20" r="2" fill="#2a1a4a" />
          <circle cx="19.5" cy="19.5" r="0.6" fill="#fff" />
          <circle cx="27.5" cy="19.5" r="0.6" fill="#fff" />
          {/* antenna */}
          <path d="M24 12 L 24 6" stroke="#2a1a4a" strokeWidth="1" />
          <circle cx="24" cy="5" r="1.6" fill="#ffd9a8" />
        </svg>
      </div>
    </div>
  );
}
