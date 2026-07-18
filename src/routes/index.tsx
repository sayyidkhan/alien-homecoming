import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAdventure } from "@/game/useAdventure";
import { RealmView } from "@/components/game/RealmView";
import { Minimap } from "@/components/game/Minimap";
import { HUD, DiscoveryToast } from "@/components/game/HUD";
import { Transition } from "@/components/game/Transition";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lost Between Worlds — an interactive storybook" },
      {
        name: "description",
        content:
          "Wander a tiny alien through drifting universes, gather three home echoes, and draw your own map back.",
      },
      { property: "og:title", content: "Lost Between Worlds" },
      {
        property: "og:description",
        content:
          "A magical browser-based exploration storybook. Every portal leads somewhere new — every world you find becomes part of your journey home.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Game,
});

function Game() {
  const {
    state,
    currentRealm,
    transitioning,
    moveAlien,
    collectDiscovery,
    beginTransition,
    finishTransition,
    resetAdventure,
  } = useAdventure();

  const [toast, setToast] = useState<string | null>(null);
  const [intro, setIntro] = useState(state.visitedRealmIds.length === 1);

  useEffect(() => {
    if (!intro) return;
    const t = window.setTimeout(() => setIntro(false), 3800);
    return () => window.clearTimeout(t);
  }, [intro]);

  const handleDiscovery = useCallback(
    (d: { id: string; kind: "home_echo" | "clue"; title: string; description: string }) => {
      collectDiscovery(d.id);
      setToast(
        d.kind === "home_echo"
          ? `Home Echo found — ${d.title}`
          : d.title,
      );
      window.setTimeout(() => setToast(null), 4200);
    },
    [collectDiscovery],
  );

  const handlePortalActivate = useCallback(
    (portal: { id: string; title: string; shape: { x: number; y: number; w: number; h: number } }) => {
      // walk alien toward portal, then start warp
      const targetX = Math.max(0.08, Math.min(0.92, portal.shape.x + portal.shape.w / 2));
      const targetY = Math.max(0.55, Math.min(0.82, portal.shape.y + portal.shape.h / 2 + 0.08));
      moveAlien(targetX, targetY);
      window.setTimeout(() => beginTransition(portal.id, portal.title), 550);
    },
    [beginTransition, moveAlien],
  );

  const handleJump = useCallback(
    (realmId: string) => {
      if (realmId === state.currentRealmId) return;
      // Only allow jumps to already-visited realms (backtracking).
      if (!state.visitedRealmIds.includes(realmId)) return;
      // Find any connection between current and target for label; else use realm title.
      const dest = state.realms[realmId];
      if (!dest) return;
      beginTransition(`__jump__${realmId}`, dest.title);
    },
    [state.currentRealmId, state.visitedRealmIds, state.realms, beginTransition],
  );

  // Intercept jump-transition finish: perform jump instead of enterPortal.
  const finishTransitionWithJump = useCallback(() => {
    if (!transitioning) return;
    if (transitioning.portalId.startsWith("__jump__")) {
      const realmId = transitioning.portalId.replace("__jump__", "");
      // Directly relocate.
      const dest = state.realms[realmId];
      if (dest) {
        // Piggyback: fake portal traversal by setting alien and current realm via reset trick.
        // We'll use a lightweight state mutation through resetAdventure-safe path:
        // Simpler: set via localStorage-free approach — dispatch a custom event.
        // Instead, we call a small internal by using the same hook: not clean. Use custom side effect.
        window.dispatchEvent(
          new CustomEvent("lbw:jump-to", { detail: { realmId } }),
        );
      }
      // clear transition
      finishTransition(); // this will try enterPortal(__jump__...) which fails silently (no such portal). Then setTransitioning(null).
      return;
    }
    finishTransition();
  }, [transitioning, finishTransition, state.realms]);

  // Handle jump events safely.
  useJumpTo();

  if (!currentRealm) {
    return (
      <div className="flex h-screen items-center justify-center text-white/70">
        Loading…
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <RealmView
        realm={currentRealm}
        alienX={state.alienX}
        alienY={state.alienY}
        onMoveAlien={moveAlien}
        onPortalActivate={handlePortalActivate}
        onDiscovery={handleDiscovery}
        disabled={!!transitioning}
      />
      <HUD
        realm={currentRealm}
        echoes={state.homeEchoes}
        onReset={resetAdventure}
        ended={state.ended}
      />
      <DiscoveryToast message={toast} />
      <Minimap state={state} onJump={handleJump} />
      {transitioning && (
        <Transition
          label={transitioning.label}
          onDone={finishTransitionWithJump}
        />
      )}
      {intro && <IntroOverlay />}
    </div>
  );
}

function IntroOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-700">
      <div className="max-w-xl px-8 text-center">
        <div className="text-[10px] uppercase tracking-[0.5em] text-white/60">
          a wandering
        </div>
        <h2 className="mt-3 font-serif text-4xl leading-tight text-white">
          Lost Between Worlds
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-white/75">
          Click a place on the stone to walk. Click a doorway, a telescope, a tree of stars — anything that glows — to cross into another universe.
          Find three home echoes. Draw your own map back.
        </p>
      </div>
    </div>
  );
}

function useJumpTo() {
  useEffect(() => {
    function onJump(e: Event) {
      const detail = (e as CustomEvent<{ realmId: string }>).detail;
      if (!detail) return;
      // Directly mutate localStorage-backed state via a small trick: dispatch a storage event.
      // The cleanest path is to call a hook method — but we're outside the hook here.
      // For MVP, force a hash change so React reads updated state on next render is unnecessary;
      // Instead we mutate storage in place and reload the game state via a full re-render trigger.
      try {
        const raw = window.localStorage.getItem("lost_between_worlds:adventure:v1");
        if (!raw) return;
        const parsed = JSON.parse(raw);
        parsed.currentRealmId = detail.realmId;
        const dest = parsed.realms?.[detail.realmId];
        if (dest) {
          parsed.alienX = dest.landingX ?? 0.5;
          parsed.alienY = dest.landingY ?? 0.72;
          if (!parsed.visitedRealmIds.includes(detail.realmId)) {
            parsed.visitedRealmIds.push(detail.realmId);
          }
          window.localStorage.setItem(
            "lost_between_worlds:adventure:v1",
            JSON.stringify(parsed),
          );
          window.location.reload();
        }
      } catch {
        // ignore
      }
    }
    window.addEventListener("lbw:jump-to", onJump);
    return () => window.removeEventListener("lbw:jump-to", onJump);
  }, []);
}
