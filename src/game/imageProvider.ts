// Image provider interface. Placeholder implementation renders procedural SVG scenes.
// Swap this with an AI adapter later; the game logic doesn't care.

import type { RealmNode, PortalKind } from "./types";
import { makeRng, type Rng } from "./seed";

export interface RealmImageProvider {
  render(realm: RealmNode): string; // returns an SVG string (data-URI safe)
}

function star(rng: Rng, w: number, h: number) {
  const x = rng() * w;
  const y = rng() * h * 0.65;
  const r = 0.4 + rng() * 1.4;
  const o = 0.4 + rng() * 0.6;
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" opacity="${o.toFixed(2)}"/>`;
}

function galaxy(rng: Rng, w: number, h: number, color: string) {
  const cx = rng() * w;
  const cy = rng() * h * 0.5;
  const rx = 60 + rng() * 120;
  const ry = 8 + rng() * 22;
  const rot = rng() * 180;
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#gal)" opacity="0.35" transform="rotate(${rot} ${cx} ${cy})"/>`;
}

// Isometric-ish floating platform.
function platform(
  cx: number,
  cy: number,
  size: number,
  fill: string,
  edge: string,
  glow: string,
) {
  const s = size;
  const top = `${cx},${cy - s * 0.5} ${cx + s},${cy} ${cx},${cy + s * 0.5} ${cx - s},${cy}`;
  const rightFace = `${cx + s},${cy} ${cx + s},${cy + s * 0.5} ${cx},${cy + s * 0.9} ${cx},${cy + s * 0.5}`;
  const leftFace = `${cx - s},${cy} ${cx - s},${cy + s * 0.5} ${cx},${cy + s * 0.9} ${cx},${cy + s * 0.5}`;
  return `
    <g>
      <ellipse cx="${cx}" cy="${cy + s * 1.2}" rx="${s * 0.9}" ry="${s * 0.18}" fill="${glow}" opacity="0.15"/>
      <polygon points="${leftFace}" fill="${edge}" opacity="0.85"/>
      <polygon points="${rightFace}" fill="${edge}" opacity="0.7"/>
      <polygon points="${top}" fill="${fill}"/>
    </g>`;
}

function landmarkFor(family: RealmNode["family"], cx: number, cy: number, glow: string, edge: string) {
  switch (family) {
    case "arch_gate":
      return `
        <g>
          <path d="M ${cx - 40} ${cy + 20} L ${cx - 40} ${cy - 50} Q ${cx} ${cy - 110} ${cx + 40} ${cy - 50} L ${cx + 40} ${cy + 20} Z"
            fill="${edge}" stroke="${glow}" stroke-width="1.5"/>
          <path d="M ${cx - 30} ${cy + 20} L ${cx - 30} ${cy - 45} Q ${cx} ${cy - 95} ${cx + 30} ${cy - 45} L ${cx + 30} ${cy + 20} Z"
            fill="url(#portalGlow)" opacity="0.9"/>
        </g>`;
    case "observatory":
      return `
        <g>
          <rect x="${cx - 6}" y="${cy - 60}" width="12" height="70" fill="${edge}"/>
          <polygon points="${cx - 30},${cy - 70} ${cx + 30},${cy - 90} ${cx + 40},${cy - 60} ${cx - 20},${cy - 40}" fill="${edge}" stroke="${glow}" stroke-width="1"/>
          <circle cx="${cx + 40}" cy="${cy - 60}" r="6" fill="${glow}"/>
        </g>`;
    case "star_forest":
      return `
        <g>
          <rect x="${cx - 3}" y="${cy - 30}" width="6" height="50" fill="${edge}"/>
          <circle cx="${cx - 15}" cy="${cy - 45}" r="3" fill="${glow}"/>
          <circle cx="${cx + 12}" cy="${cy - 55}" r="4" fill="${glow}"/>
          <circle cx="${cx + 4}" cy="${cy - 70}" r="3" fill="${glow}"/>
          <circle cx="${cx - 8}" cy="${cy - 62}" r="2.5" fill="${glow}"/>
        </g>`;
    case "flooded_library":
      return `
        <g>
          <rect x="${cx - 40}" y="${cy - 60}" width="14" height="70" fill="${edge}"/>
          <rect x="${cx - 10}" y="${cy - 75}" width="14" height="85" fill="${edge}"/>
          <rect x="${cx + 20}" y="${cy - 50}" width="14" height="60" fill="${edge}"/>
        </g>`;
    case "clockwork_desert":
      return `
        <g>
          <circle cx="${cx}" cy="${cy - 30}" r="45" fill="none" stroke="${edge}" stroke-width="6" stroke-dasharray="6 10"/>
          <circle cx="${cx}" cy="${cy - 30}" r="20" fill="${edge}" opacity="0.6"/>
        </g>`;
    case "mirror_kingdom":
      return `
        <g>
          <ellipse cx="${cx}" cy="${cy + 10}" rx="60" ry="14" fill="${glow}" opacity="0.5"/>
          <ellipse cx="${cx}" cy="${cy + 10}" rx="60" ry="14" fill="none" stroke="${edge}" stroke-width="1.5"/>
        </g>`;
    case "floating_garden":
      return `
        <g>
          <circle cx="${cx - 15}" cy="${cy - 30}" r="10" fill="${glow}"/>
          <circle cx="${cx + 18}" cy="${cy - 45}" r="12" fill="${glow}" opacity="0.85"/>
          <circle cx="${cx + 2}" cy="${cy - 65}" r="9" fill="${glow}" opacity="0.9"/>
        </g>`;
    case "train_station":
      return `
        <g>
          <rect x="${cx - 60}" y="${cy - 40}" width="120" height="30" rx="4" fill="${edge}"/>
          <rect x="${cx - 50}" y="${cy - 32}" width="14" height="14" fill="${glow}"/>
          <rect x="${cx - 30}" y="${cy - 32}" width="14" height="14" fill="${glow}"/>
          <rect x="${cx - 10}" y="${cy - 32}" width="14" height="14" fill="${glow}"/>
          <rect x="${cx + 10}" y="${cy - 32}" width="14" height="14" fill="${glow}"/>
          <rect x="${cx + 30}" y="${cy - 32}" width="14" height="14" fill="${glow}"/>
        </g>`;
    case "sleeping_creature":
      return `
        <g>
          <path d="M ${cx - 80} ${cy + 10} Q ${cx} ${cy - 80} ${cx + 80} ${cy + 10}" fill="${edge}" opacity="0.9"/>
          <circle cx="${cx + 30}" cy="${cy - 25}" r="4" fill="${glow}"/>
        </g>`;
    case "vertical_ocean":
      return `
        <g>
          <rect x="${cx - 70}" y="${cy - 90}" width="140" height="110" fill="url(#oceanWall)" opacity="0.85"/>
          <circle cx="${cx - 20}" cy="${cy - 40}" r="2" fill="${glow}"/>
          <circle cx="${cx + 30}" cy="${cy - 60}" r="2" fill="${glow}"/>
        </g>`;
  }
}

function portalShape(kind: PortalKind, cx: number, cy: number, glow: string, edge: string) {
  switch (kind) {
    case "archway":
    case "door":
      return `<path d="M ${cx - 10} ${cy + 15} L ${cx - 10} ${cy - 15} Q ${cx} ${cy - 30} ${cx + 10} ${cy - 15} L ${cx + 10} ${cy + 15} Z" fill="${glow}" opacity="0.85" stroke="${edge}" stroke-width="1"/>`;
    case "telescope":
      return `<g><rect x="${cx - 2}" y="${cy - 20}" width="4" height="30" fill="${edge}"/><polygon points="${cx - 8},${cy - 22} ${cx + 10},${cy - 30} ${cx + 14},${cy - 20} ${cx - 4},${cy - 12}" fill="${edge}"/></g>`;
    case "mirror":
      return `<ellipse cx="${cx}" cy="${cy - 5}" rx="12" ry="18" fill="${glow}" stroke="${edge}" stroke-width="1"/>`;
    case "cave":
      return `<path d="M ${cx - 14} ${cy + 15} Q ${cx - 14} ${cy - 18} ${cx} ${cy - 20} Q ${cx + 14} ${cy - 18} ${cx + 14} ${cy + 15} Z" fill="#0a0618" opacity="0.9"/>`;
    case "book":
      return `<g><rect x="${cx - 10}" y="${cy - 8}" width="20" height="14" fill="${edge}"/><rect x="${cx - 10}" y="${cy - 8}" width="2" height="14" fill="${glow}"/></g>`;
    case "staircase":
      return `<g><rect x="${cx - 14}" y="${cy + 8}" width="10" height="6" fill="${edge}"/><rect x="${cx - 6}" y="${cy}" width="10" height="6" fill="${edge}"/><rect x="${cx + 2}" y="${cy - 8}" width="10" height="6" fill="${edge}"/></g>`;
    case "eye":
      return `<g><ellipse cx="${cx}" cy="${cy}" rx="14" ry="6" fill="${glow}"/><circle cx="${cx}" cy="${cy}" r="3" fill="#0a0618"/></g>`;
    case "train":
      return `<rect x="${cx - 18}" y="${cy - 10}" width="36" height="18" rx="3" fill="${edge}"/>`;
    case "planet":
      return `<g><circle cx="${cx}" cy="${cy - 4}" r="12" fill="${glow}"/><ellipse cx="${cx}" cy="${cy - 4}" rx="18" ry="4" fill="none" stroke="${edge}" stroke-width="1"/></g>`;
    case "tree":
      return `<g><rect x="${cx - 2}" y="${cy - 4}" width="4" height="18" fill="${edge}"/><circle cx="${cx}" cy="${cy - 12}" r="10" fill="${glow}"/></g>`;
  }
}

export class PlaceholderImageProvider implements RealmImageProvider {
  render(realm: RealmNode): string {
    const w = 1600;
    const h = 900;
    const [bgDeep, bgMid, edge, glow] = realm.palette;
    const rng = makeRng(realm.seed + "::art");

    const stars: string[] = [];
    for (let i = 0; i < 220; i++) stars.push(star(rng, w, h));
    const galaxies: string[] = [];
    for (let i = 0; i < 3; i++) galaxies.push(galaxy(rng, w, h, edge));

    // Central platform (large) + portal-side platforms
    const centralX = w * 0.5;
    const centralY = h * 0.62;
    const platforms: string[] = [];
    platforms.push(platform(centralX, centralY, 210, bgMid, edge, glow));

    const portalMarks: string[] = [];
    for (const p of realm.portals) {
      const px = p.shape.x * w + (p.shape.w * w) / 2;
      const py = p.shape.y * h + (p.shape.h * h) / 2;
      // Side platform for portal
      platforms.push(platform(px, py + 30, 90, bgMid, edge, glow));
      portalMarks.push(portalShape(p.kind, px, py, glow, edge));
      // Bridge line
      portalMarks.push(
        `<line x1="${centralX}" y1="${centralY}" x2="${px}" y2="${py + 30}" stroke="${glow}" stroke-width="1" opacity="0.35" stroke-dasharray="3 5"/>`,
      );
    }

    const land = landmarkFor(realm.family, centralX, centralY - 20, glow, edge);

    // Discovery sparkles
    const sparkles = realm.discoveries
      .filter((d) => !d.found)
      .map((d) => {
        const x = d.x * w;
        const y = d.y * h;
        return `<g><circle cx="${x}" cy="${y}" r="6" fill="${glow}" opacity="0.7"/><circle cx="${x}" cy="${y}" r="14" fill="none" stroke="${glow}" stroke-width="1" opacity="0.4"/></g>`;
      })
      .join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="bg" cx="50%" cy="35%" r="80%">
          <stop offset="0%" stop-color="${bgMid}"/>
          <stop offset="70%" stop-color="${bgDeep}"/>
          <stop offset="100%" stop-color="#05030f"/>
        </radialGradient>
        <radialGradient id="gal" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${edge}" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="${edge}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="portalGlow" cx="50%" cy="60%" r="60%">
          <stop offset="0%" stop-color="#fff8e0" stop-opacity="1"/>
          <stop offset="60%" stop-color="${glow}" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="${glow}" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="oceanWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0a1030"/>
          <stop offset="100%" stop-color="${edge}"/>
        </linearGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#bg)"/>
      ${galaxies.join("")}
      ${stars.join("")}
      ${platforms.join("")}
      ${land}
      ${portalMarks.join("")}
      ${sparkles}
    </svg>`;
  }
}

export function svgToDataUri(svg: string): string {
  // encodeURIComponent is safe for SVG data URIs.
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
