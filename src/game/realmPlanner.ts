import type {
  Discovery,
  Portal,
  PortalKind,
  RealmFamily,
  RealmNode,
  RealmSpecial,
} from "./types";
import { hashString, makeRng, makeSeed, pick, pickN, range, type Rng } from "./seed";

const FAMILIES: RealmFamily[] = [
  "arch_gate",
  "observatory",
  "star_forest",
  "flooded_library",
  "clockwork_desert",
  "mirror_kingdom",
  "floating_garden",
  "train_station",
  "sleeping_creature",
  "vertical_ocean",
];

const FAMILY_LORE: Record<
  RealmFamily,
  {
    titles: string[];
    landmark: string;
    description: string;
    portalKinds: PortalKind[];
  }
> = {
  arch_gate: {
    titles: ["The Lantern Gate", "Hall of Passing Suns", "The Waiting Arch"],
    landmark: "a luminous archway humming with quiet light",
    description:
      "Pale stone bridges hover above a violet void. An archway breathes light like a slow tide.",
    portalKinds: ["archway", "door", "staircase"],
  },
  observatory: {
    titles: ["Observatory Between Galaxies", "The Silent Lens", "Long-Look Terrace"],
    landmark: "an ancient telescope trained on an impossible planet",
    description:
      "A forgotten platform drifts between spiral arms. A brass telescope stares at something that shouldn't be there.",
    portalKinds: ["telescope", "planet", "staircase"],
  },
  star_forest: {
    titles: ["The Grove Where Stars Grow", "Constellation Orchard", "Wick Forest"],
    landmark: "trees whose crowns are living constellations",
    description:
      "Slender trees rise from a floating meadow. Each crown is a small constellation, drifting on its branches.",
    portalKinds: ["tree", "cave", "door"],
  },
  flooded_library: {
    titles: ["Library of Kept Memories", "The Reading Tide", "Sunk Archive"],
    landmark: "columns of books half-submerged in still water",
    description:
      "A knee-deep sea of quiet water covers the library floor. The books remember instead of tell.",
    portalKinds: ["book", "mirror", "archway"],
  },
  clockwork_desert: {
    titles: ["Clockwork Dunes", "The Backwards Noon", "Gearfall Waste"],
    landmark: "half-buried gears the size of moons",
    description:
      "Pale sand climbs the ribs of enormous stopped machines. Every shadow moves the wrong way.",
    portalKinds: ["cave", "eye", "staircase"],
  },
  mirror_kingdom: {
    titles: ["The Cracked Reflection", "Kingdom in the Glass", "Silvered Court"],
    landmark: "a vast broken mirror holding a wrong sky",
    description:
      "A shattered mirror lies flat as a lake. The kingdom inside it doesn't quite match the one above.",
    portalKinds: ["mirror", "door", "eye"],
  },
  floating_garden: {
    titles: ["The Door Garden", "Bloomkeep", "Where Handles Bud"],
    landmark: "flowers that open into small doors",
    description:
      "Terraces of soft blossoms drift between clouds. Some of the flowers, when opened, are doors.",
    portalKinds: ["door", "tree", "archway"],
  },
  train_station: {
    titles: ["Timeline Terminus", "The Slow Platform", "Station of Forgotten Hours"],
    landmark: "an empty train that seems to remember every route",
    description:
      "A platform floats in fog. A single train waits with lit windows for passengers who never came.",
    portalKinds: ["train", "door", "staircase"],
  },
  sleeping_creature: {
    titles: ["City on the Sleeping Whale", "Breathing Districts", "The Slow Beast"],
    landmark: "a city grown across the back of a vast dreaming creature",
    description:
      "Small houses cluster along the ridges of something enormous and asleep. Its breathing shakes the lanterns.",
    portalKinds: ["eye", "cave", "archway"],
  },
  vertical_ocean: {
    titles: ["The Standing Sea", "Vertical Tide", "Wall of Quiet Water"],
    landmark: "a silent ocean hanging sideways in the sky",
    description:
      "An impossible wall of dark water rises beside the platform. Fish drift through it like slow stars.",
    portalKinds: ["cave", "mirror", "planet"],
  },
};

const PORTAL_LABELS: Record<PortalKind, string[]> = {
  archway: ["A humming archway", "An open gate", "A quiet arch"],
  telescope: ["A brass telescope", "An old long-look lens", "A pointed telescope"],
  mirror: ["A tall mirror", "A wrong reflection", "A silvered pane"],
  cave: ["A cave mouth", "A dark opening", "A soft hollow"],
  book: ["An unshelved book", "A humming volume", "A drifting book"],
  staircase: ["A staircase into sky", "Stairs going up", "Steps that lift away"],
  eye: ["A slowly opening eye", "A watching gaze", "A creature's open eye"],
  train: ["A waiting train", "A lit carriage", "A silent locomotive"],
  door: ["A small door", "A painted door", "A door in the air"],
  planet: ["An impossible planet", "A near, wrong moon", "A hanging world"],
  tree: ["A star-topped tree", "A luminous grove", "A tree of constellations"],
};

const PALETTES: Array<[string, string, string, string]> = [
  ["#1a1533", "#3b2c62", "#e7a8c9", "#ffd9a8"],
  ["#141b3a", "#2f3f75", "#a8c5ff", "#fff2c8"],
  ["#2b1a3d", "#5b3572", "#f4b8e4", "#ffd39a"],
  ["#0f1a2e", "#274060", "#9ad6e0", "#ffe1a8"],
  ["#241638", "#4c3078", "#c8a8ff", "#ffc9a8"],
  ["#0e1230", "#312a63", "#a8e0ff", "#f5c78a"],
];

const ECHO_LIBRARY = [
  {
    id: "echo_constellation",
    title: "A familiar constellation",
    description: "Seven pale stars in a curve — you drew this on a wall, once, at home.",
  },
  {
    id: "echo_voice",
    title: "A recorded voice",
    description:
      "A soft syllable, half-remembered. It was the way your name used to be spoken.",
  },
  {
    id: "echo_object",
    title: "A childhood object",
    description:
      "A small carved token, warm to the touch. You had one like it when the sky was familiar.",
  },
];

function pickTitle(rng: Rng, family: RealmFamily): string {
  return pick(rng, FAMILY_LORE[family].titles);
}

function makePortal(
  rng: Rng,
  parentSeed: string,
  slot: number,
  family: RealmFamily,
): Portal {
  const kind = pick(rng, FAMILY_LORE[family].portalKinds);
  const label = pick(rng, PORTAL_LABELS[kind]);
  // Three portal slots: left, right, back-center.
  const slotPos: Array<{ x: number; y: number; w: number; h: number }> = [
    { x: 0.13, y: 0.58, w: 0.16, h: 0.22 },
    { x: 0.72, y: 0.6, w: 0.16, h: 0.22 },
    { x: 0.44, y: 0.28, w: 0.14, h: 0.22 },
  ];
  const pos = slotPos[slot];
  return {
    id: `portal_${hashString(parentSeed + "::" + slot).toString(36)}`,
    title: label,
    kind,
    visualDescription: label + " that could be a way through.",
    shape: pos,
    state: "available",
  };
}

export type PlanContext = {
  adventureId: string;
  parentRealmId?: string;
  enteredThroughPortalId?: string;
  depth: number;
  echoesCollected: number;
  // Force this realm to carry a specific echo if provided.
  forcedEchoIndex?: number;
  // Force a family (used for special realms).
  forcedFamily?: RealmFamily;
  // Overrides for special realms.
  special?: RealmSpecial;
  forcedTitle?: string;
};

export function planRealm(ctx: PlanContext): RealmNode {
  const seed = makeSeed([
    ctx.adventureId,
    ctx.parentRealmId ?? "root",
    ctx.enteredThroughPortalId ?? "root",
    ctx.depth,
  ]);
  const rng = makeRng(seed);
  const family = ctx.forcedFamily ?? pick(rng, FAMILIES);
  const palette = pick(rng, PALETTES);
  const lore = FAMILY_LORE[family];
  const title = ctx.forcedTitle ?? pickTitle(rng, family);

  const numPortals = ctx.special === "real_home" ? 1 : rng() < 0.4 ? 3 : 2;
  const slots = pickN(rng, [0, 1, 2], numPortals);
  const portals: Portal[] = slots.map((s) => makePortal(rng, seed, s, family));

  const discoveries: Discovery[] = [];
  if (ctx.forcedEchoIndex !== undefined) {
    const echo = ECHO_LIBRARY[ctx.forcedEchoIndex];
    discoveries.push({
      id: echo.id,
      kind: "home_echo",
      title: echo.title,
      description: echo.description,
      found: false,
      x: 0.5 + (rng() - 0.5) * 0.3,
      y: 0.55 + (rng() - 0.5) * 0.15,
    });
  } else if (rng() < 0.6 && ctx.special !== "real_home") {
    discoveries.push({
      id: `clue_${hashString(seed + "clue").toString(36)}`,
      kind: "clue",
      title: "A quiet detail",
      description: pick(rng, [
        "A drawing scratched into stone: seven stars in a curve.",
        "A footprint that matches yours, older than it should be.",
        "A soft tone in the air — someone hummed this to you once.",
        "A door-handle shaped like something from your home.",
      ]),
      found: false,
      x: 0.3 + rng() * 0.4,
      y: 0.62 + rng() * 0.12,
    });
  }

  let description = lore.description;
  if (ctx.special === "false_home") {
    description =
      "Something here feels like home. Almost. The light is right. The shapes are right. Look again.";
  } else if (ctx.special === "real_home") {
    description =
      "You know this place. Not from memory — from below memory. The doorway is finally open.";
  }

  return {
    id: `realm_${hashString(seed).toString(36)}`,
    seed,
    title,
    description,
    family,
    palette,
    landmark: lore.landmark,
    parentRealmId: ctx.parentRealmId,
    enteredThroughPortalId: ctx.enteredThroughPortalId,
    generationStatus: "ready",
    portals,
    discoveries,
    depth: ctx.depth,
    special: ctx.special ?? null,
    landingX: 0.5,
    landingY: 0.72,
  };
}

export const STARTING_REALM_ID = "realm_start";

export function planStartingRealm(adventureId: string): RealmNode {
  const rng = makeRng(adventureId + "::start");
  const palette = pick(rng, PALETTES);
  return {
    id: STARTING_REALM_ID,
    seed: adventureId + "::start",
    title: "The Threshold",
    description:
      "You wake on a pale bridge between stars. You don't remember arriving. Somewhere behind the sky is home.",
    family: "arch_gate",
    palette,
    landmark: "an unlit archway waiting for someone to step through",
    generationStatus: "ready",
    depth: 0,
    special: "start",
    landingX: 0.5,
    landingY: 0.72,
    portals: [
      makePortal(rng, adventureId + "::start", 0, "arch_gate"),
      makePortal(rng, adventureId + "::start", 1, "arch_gate"),
    ],
    discoveries: [
      {
        id: "clue_start",
        kind: "clue",
        title: "A whisper in the stone",
        description:
          "Three echoes of home are scattered across the drifting worlds. Find them, and a doorway will remember you.",
        found: false,
        x: 0.5,
        y: 0.55,
      },
    ],
  };
}

export { ECHO_LIBRARY };
