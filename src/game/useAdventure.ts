import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AdventureState,
  HomeEcho,
  Portal,
  RealmConnection,
  RealmNode,
} from "./types";
import { loadAdventure, saveAdventure, clearAdventure } from "./storage";
import {
  ECHO_LIBRARY,
  planRealm,
  planStartingRealm,
  STARTING_REALM_ID,
} from "./realmPlanner";
import { hashString } from "./seed";

const WAY_HOME_PORTAL_ID = "portal_way_home";
const REAL_HOME_REALM_ID = "realm_home";

function makeInitialAdventure(): AdventureState {
  const adventureId = `adv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const start = planStartingRealm(adventureId);
  return {
    adventureId,
    version: 1,
    currentRealmId: start.id,
    homeRealmId: start.id,
    realmsHome: REAL_HOME_REALM_ID,
    realms: { [start.id]: { ...start, visitedAt: Date.now() } },
    connections: [],
    homeEchoes: [],
    storyFlags: [],
    visitedRealmIds: [start.id],
    alienX: start.landingX,
    alienY: start.landingY,
    createdAt: Date.now(),
    ended: false,
  };
}

function countGeneratedRealms(state: AdventureState): number {
  return Object.values(state.realms).filter(
    (r) => r.special !== "start" && r.special !== "real_home",
  ).length;
}

function hasFalseHome(state: AdventureState): boolean {
  return Object.values(state.realms).some((r) => r.special === "false_home");
}

function ensureWayHomePortal(state: AdventureState): AdventureState {
  if (state.homeEchoes.length < 3) return state;
  const current = state.realms[state.currentRealmId];
  if (!current) return state;
  if (current.portals.some((p) => p.id === WAY_HOME_PORTAL_ID)) return state;
  const wayHome: Portal = {
    id: WAY_HOME_PORTAL_ID,
    title: "A doorway that remembers you",
    kind: "archway",
    visualDescription: "A humming archway made of every colour you've ever seen at home.",
    shape: { x: 0.42, y: 0.14, w: 0.16, h: 0.22 },
    state: "available",
  };
  const realms = {
    ...state.realms,
    [current.id]: { ...current, portals: [...current.portals, wayHome] },
  };
  return { ...state, realms };
}

export function useAdventure() {
  const [state, setState] = useState<AdventureState>(() => {
    if (typeof window === "undefined") return makeInitialAdventure();
    return loadAdventure() ?? makeInitialAdventure();
  });
  const [transitioning, setTransitioning] = useState<null | {
    portalId: string;
    fromRealmId: string;
    label: string;
  }>(null);
  const lastSaved = useRef(0);

  // Persist.
  useEffect(() => {
    const now = Date.now();
    if (now - lastSaved.current > 150) {
      lastSaved.current = now;
      saveAdventure(state);
    } else {
      const t = window.setTimeout(() => saveAdventure(state), 200);
      return () => window.clearTimeout(t);
    }
  }, [state]);

  // Reveal way-home portal when echoes reach 3.
  useEffect(() => {
    setState((s) => ensureWayHomePortal(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.homeEchoes.length, state.currentRealmId]);

  const currentRealm = state.realms[state.currentRealmId];

  const moveAlien = useCallback((x: number, y: number) => {
    setState((s) => ({ ...s, alienX: x, alienY: y }));
  }, []);

  const collectDiscovery = useCallback((discoveryId: string) => {
    setState((s) => {
      const realm = s.realms[s.currentRealmId];
      if (!realm) return s;
      const d = realm.discoveries.find((x) => x.id === discoveryId);
      if (!d || d.found) return s;
      const updatedDiscoveries = realm.discoveries.map((x) =>
        x.id === discoveryId ? { ...x, found: true } : x,
      );
      const newRealms = {
        ...s.realms,
        [realm.id]: { ...realm, discoveries: updatedDiscoveries },
      };
      let echoes = s.homeEchoes;
      if (d.kind === "home_echo") {
        echoes = [
          ...s.homeEchoes,
          {
            id: d.id,
            title: d.title,
            description: d.description,
            foundInRealmId: realm.id,
          } satisfies HomeEcho,
        ];
      }
      return { ...s, realms: newRealms, homeEchoes: echoes };
    });
  }, []);

  const enterPortal = useCallback(
    (portalId: string) => {
      setState((prev) => {
        const from = prev.realms[prev.currentRealmId];
        if (!from) return prev;
        const portal = from.portals.find((p) => p.id === portalId);
        if (!portal || portal.state === "locked" || portal.state === "hidden") return prev;

        // Way-home portal: create the real home realm and end game.
        if (portal.id === WAY_HOME_PORTAL_ID) {
          const home =
            prev.realms[REAL_HOME_REALM_ID] ??
            planRealm({
              adventureId: prev.adventureId,
              parentRealmId: from.id,
              enteredThroughPortalId: portal.id,
              depth: from.depth + 1,
              echoesCollected: prev.homeEchoes.length,
              forcedFamily: "star_forest",
              special: "real_home",
              forcedTitle: "Home",
            });
          const homeRealm: RealmNode = { ...home, id: REAL_HOME_REALM_ID, visitedAt: Date.now() };
          const conn: RealmConnection = {
            fromRealmId: from.id,
            toRealmId: REAL_HOME_REALM_ID,
            portalId: portal.id,
          };
          const updatedFrom: RealmNode = {
            ...from,
            portals: from.portals.map((p) =>
              p.id === portalId ? { ...p, state: "used", destinationRealmId: REAL_HOME_REALM_ID } : p,
            ),
          };
          return {
            ...prev,
            realms: { ...prev.realms, [from.id]: updatedFrom, [REAL_HOME_REALM_ID]: homeRealm },
            connections: [...prev.connections, conn],
            currentRealmId: REAL_HOME_REALM_ID,
            visitedRealmIds: prev.visitedRealmIds.includes(REAL_HOME_REALM_ID)
              ? prev.visitedRealmIds
              : [...prev.visitedRealmIds, REAL_HOME_REALM_ID],
            alienX: homeRealm.landingX,
            alienY: homeRealm.landingY,
            ended: true,
          };
        }

        // If portal already leads somewhere, just travel.
        if (portal.destinationRealmId && prev.realms[portal.destinationRealmId]) {
          const dest = prev.realms[portal.destinationRealmId];
          return {
            ...prev,
            currentRealmId: dest.id,
            visitedRealmIds: prev.visitedRealmIds.includes(dest.id)
              ? prev.visitedRealmIds
              : [...prev.visitedRealmIds, dest.id],
            alienX: dest.landingX,
            alienY: dest.landingY,
            realms: {
              ...prev.realms,
              [from.id]: {
                ...from,
                portals: from.portals.map((p) =>
                  p.id === portalId ? { ...p, state: "used" } : p,
                ),
              },
              [dest.id]: { ...dest, visitedAt: dest.visitedAt ?? Date.now() },
            },
          };
        }

        // Generate a new realm.
        const generatedCount = countGeneratedRealms(prev);
        const nextIndex = generatedCount + 1; // 1-based for this new realm
        // Echo schedule at 1st, 3rd, 5th new realm.
        let forcedEchoIndex: number | undefined;
        const echoesGiven = prev.realms
          ? Object.values(prev.realms).flatMap((r) => r.discoveries.filter((d) => d.kind === "home_echo").map((d) => d.id))
          : [];
        const nextEchoSlot = prev.homeEchoes.length + echoesGiven.length; // hack for uniqueness
        // Deterministic mapping: use nextIndex.
        const echoMap: Record<number, number> = { 1: 0, 3: 1, 5: 2 };
        if (echoMap[nextIndex] !== undefined && !hasEchoInWorld(prev, echoMap[nextIndex])) {
          forcedEchoIndex = echoMap[nextIndex];
        }
        // False home at 4th new realm, once.
        let special: RealmNode["special"] = null;
        if (nextIndex === 4 && !hasFalseHome(prev)) special = "false_home";

        const newRealm = planRealm({
          adventureId: prev.adventureId,
          parentRealmId: from.id,
          enteredThroughPortalId: portal.id,
          depth: from.depth + 1,
          echoesCollected: prev.homeEchoes.length,
          forcedEchoIndex,
          special: special ?? undefined,
        });
        const stamped: RealmNode = { ...newRealm, visitedAt: Date.now() };
        // Ensure the portal we came through in the new realm can go back.
        const backPortal: Portal = {
          id: `portal_back_${hashString(from.id + newRealm.id).toString(36)}`,
          title: "The way you came",
          kind: "archway",
          visualDescription: "A quiet arch that remembers where you were.",
          shape: { x: 0.02, y: 0.78, w: 0.12, h: 0.18 },
          state: "used",
          destinationRealmId: from.id,
        };
        stamped.portals = [backPortal, ...stamped.portals];

        const updatedFrom: RealmNode = {
          ...from,
          portals: from.portals.map((p) =>
            p.id === portalId ? { ...p, state: "used", destinationRealmId: stamped.id } : p,
          ),
        };
        const conn: RealmConnection = {
          fromRealmId: from.id,
          toRealmId: stamped.id,
          portalId: portal.id,
        };

        void ECHO_LIBRARY; // keep import if unused elsewhere
        void nextEchoSlot;

        return {
          ...prev,
          realms: {
            ...prev.realms,
            [from.id]: updatedFrom,
            [stamped.id]: stamped,
          },
          connections: [...prev.connections, conn],
          currentRealmId: stamped.id,
          visitedRealmIds: prev.visitedRealmIds.includes(stamped.id)
            ? prev.visitedRealmIds
            : [...prev.visitedRealmIds, stamped.id],
          alienX: stamped.landingX,
          alienY: stamped.landingY,
        };
      });
    },
    [],
  );

  const beginTransition = useCallback(
    (portalId: string, label: string) => {
      setTransitioning({ portalId, fromRealmId: state.currentRealmId, label });
    },
    [state.currentRealmId],
  );

  const jumpToRealm = useCallback((realmId: string) => {
    setState((s) => {
      const dest = s.realms[realmId];
      if (!dest) return s;
      return {
        ...s,
        currentRealmId: dest.id,
        alienX: dest.landingX,
        alienY: dest.landingY,
        visitedRealmIds: s.visitedRealmIds.includes(dest.id)
          ? s.visitedRealmIds
          : [...s.visitedRealmIds, dest.id],
      };
    });
  }, []);

  const finishTransition = useCallback(() => {
    if (!transitioning) return;
    const pid = transitioning.portalId;
    if (pid.startsWith("__jump__")) {
      jumpToRealm(pid.replace("__jump__", ""));
    } else {
      enterPortal(pid);
    }
    setTransitioning(null);
  }, [transitioning, enterPortal, jumpToRealm]);

  const resetAdventure = useCallback(() => {
    clearAdventure();
    setState(makeInitialAdventure());
    setTransitioning(null);
  }, []);

  const value = useMemo(
    () => ({
      state,
      currentRealm,
      transitioning,
      moveAlien,
      collectDiscovery,
      beginTransition,
      finishTransition,
      resetAdventure,
      jumpToRealm,
      wayHomePortalId: WAY_HOME_PORTAL_ID,
    }),
    [
      state,
      currentRealm,
      transitioning,
      moveAlien,
      collectDiscovery,
      beginTransition,
      finishTransition,
      resetAdventure,
      jumpToRealm,
    ],
  );

  return value;
}

function hasEchoInWorld(state: AdventureState, echoIndex: number): boolean {
  const echoId = ECHO_LIBRARY[echoIndex]?.id;
  if (!echoId) return true;
  return Object.values(state.realms).some((r) =>
    r.discoveries.some((d) => d.id === echoId),
  );
}
