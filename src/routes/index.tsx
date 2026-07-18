import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAdventure } from "@/game/useAdventure";
import { RealmView } from "@/components/game/RealmView";
import { Minimap } from "@/components/game/Minimap";
import { HUD, DiscoveryToast } from "@/components/game/HUD";
import { Transition } from "@/components/game/Transition";
import { WorldAtlas } from "@/components/game/WorldAtlas";

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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-white/60">
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-[0.5em] text-white/40">a wandering</div>
          <div className="mt-2 font-serif text-3xl text-white/85">Lost Between Worlds</div>
        </div>
      </div>
    );
  }
  return <GameInner />;
}

function GameInner() {
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
  const [atlasOpen, setAtlasOpen] = useState(false);

  useEffect(() => {
    if (!intro) return;
    const t = window.setTimeout(() => setIntro(false), 3800);
    return () => window.clearTimeout(t);
  }, [intro]);

  const handleDiscovery = useCallback(
    (d: { id: string; kind: "home_echo" | "clue"; title: string; description: string }) => {
      collectDiscovery(d.id);
      setToast(
        d.kind === "home_echo" ? `Home Echo · ${d.title}` : d.title,
      );
    },
    [collectDiscovery],
  );

  const handlePortalActivate = useCallback(
    (portal: { id: string; title: string; shape: { x: number; y: number; w: number; h: number } }) => {
      const targetX = Math.max(0.08, Math.min(0.92, portal.shape.x + portal.shape.w / 2));
      const targetY = Math.max(0.55, Math.min(0.84, portal.shape.y + portal.shape.h / 2 + 0.08));
      moveAlien(targetX, targetY);
      window.setTimeout(() => beginTransition(portal.id, portal.title), 550);
    },
    [beginTransition, moveAlien],
  );

  const handleJump = useCallback(
    (realmId: string) => {
      if (realmId === state.currentRealmId) return;
      if (!state.visitedRealmIds.includes(realmId)) return;
      const dest = state.realms[realmId];
      if (!dest) return;
      beginTransition(`__jump__${realmId}`, dest.title);
    },
    [state.currentRealmId, state.visitedRealmIds, state.realms, beginTransition],
  );

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
        adventureId={state.adventureId}
        echoesCollected={state.homeEchoes.length}
      />

      <HUD
        realm={currentRealm}
        echoes={state.homeEchoes}
        onReset={resetAdventure}
        ended={state.ended}
      />
      <DiscoveryToast message={toast} />
      <Minimap state={state} onJump={handleJump} />
      <button
        type="button"
        onClick={() => setAtlasOpen(true)}
        className="absolute bottom-4 right-4 z-40 rounded-full border border-white/15 bg-black/45 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-white/80 backdrop-blur-md hover:bg-black/70 hover:text-white"
      >
        atlas · {state.visitedRealmIds.length} worlds
      </button>
      {atlasOpen && (
        <WorldAtlas
          state={state}
          onClose={() => setAtlasOpen(false)}
          onJump={handleJump}
        />
      )}
      {transitioning && (
        <Transition
          label={transitioning.label}
          onDone={finishTransition}
        />
      )}
      {intro && <IntroOverlay />}
    </div>
  );
}

function IntroOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="max-w-xl px-8 text-center intro-fade">
        <div className="text-[10px] uppercase tracking-[0.5em] text-white/60">
          a wandering
        </div>
        <h2 className="mt-3 font-serif text-4xl leading-tight text-white">
          Lost Between Worlds
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-white/75">
          Click a place on the stone to walk. Click a doorway, telescope, tree of stars — anything that glows — to cross into another universe. Find three home echoes. Draw your own map back.
        </p>
      </div>
    </div>
  );
}
