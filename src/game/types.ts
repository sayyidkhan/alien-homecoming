// Game data model. AI/image output NEVER controls this shape.

export type PortalState = "hidden" | "available" | "locked" | "used";

export type PortalShape = {
  // Normalized 0..1 coordinates relative to the realm scene.
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PortalKind =
  | "archway"
  | "telescope"
  | "mirror"
  | "cave"
  | "book"
  | "staircase"
  | "eye"
  | "train"
  | "door"
  | "planet"
  | "tree";

export type Portal = {
  id: string;
  title: string;
  kind: PortalKind;
  visualDescription: string;
  destinationRealmId?: string;
  shape: PortalShape;
  state: PortalState;
  requirement?: {
    type: "home_echo" | "story_flag";
    value: string | number;
  };
};

export type Discovery = {
  id: string;
  kind: "home_echo" | "clue";
  title: string;
  description: string;
  found: boolean;
  // Position in scene for the clickable clue sparkle.
  x: number;
  y: number;
};

export type RealmFamily =
  | "arch_gate"
  | "observatory"
  | "star_forest"
  | "flooded_library"
  | "clockwork_desert"
  | "mirror_kingdom"
  | "floating_garden"
  | "train_station"
  | "sleeping_creature"
  | "vertical_ocean";

export type RealmSpecial = "start" | "false_home" | "real_home" | null;

export type RealmNode = {
  id: string;
  seed: string;
  title: string;
  description: string;
  family: RealmFamily;
  palette: [string, string, string, string]; // bg-deep, bg-mid, accent, glow
  landmark: string;
  parentRealmId?: string;
  enteredThroughPortalId?: string;
  generationStatus: "unexplored" | "planning" | "ready" | "failed";
  portals: Portal[];
  discoveries: Discovery[];
  visitedAt?: number;
  depth: number;
  special: RealmSpecial;
  // Alien landing position (normalized).
  landingX: number;
  landingY: number;
};

export type RealmConnection = {
  fromRealmId: string;
  toRealmId: string;
  portalId: string;
};

export type HomeEcho = {
  id: string;
  title: string;
  description: string;
  foundInRealmId: string;
};

export type AdventureState = {
  adventureId: string;
  version: number;
  currentRealmId: string;
  homeRealmId: string;
  realmsHome: string; // planned final realm id
  realms: Record<string, RealmNode>;
  connections: RealmConnection[];
  homeEchoes: HomeEcho[];
  storyFlags: string[];
  visitedRealmIds: string[];
  alienX: number;
  alienY: number;
  createdAt: number;
  ended: boolean;
};
