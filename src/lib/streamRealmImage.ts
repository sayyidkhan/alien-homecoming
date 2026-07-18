import { createParser } from "eventsource-parser";
import { flushSync } from "react-dom";

type ImageEventPayload =
  | { type: "image_generation.partial_image"; b64_json: string; partial_image_index: number }
  | { type: "image_generation.completed"; b64_json: string }
  | { type: "error"; error: { message: string } };

export async function streamRealmImage(
  prompt: string,
  onFrame: (dataUrl: string, isFinal: boolean) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/generate-realm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Image generation failed: ${res.status}`);
  }

  let finalDataUrl = "";
  let streamError: string | undefined;
  const parser = createParser({
    onEvent(event) {
      let payload: ImageEventPayload | undefined;
      try {
        payload = JSON.parse(event.data) as ImageEventPayload;
      } catch {
        return;
      }
      if (event.event === "error" || payload?.type === "error") {
        streamError =
          (payload as { error?: { message?: string } })?.error?.message ?? "Image failed";
        return;
      }
      if (
        event.event !== "image_generation.partial_image" &&
        event.event !== "image_generation.completed"
      )
        return;
      const isFinal = event.event === "image_generation.completed";
      const dataUrl = `data:image/png;base64,${(payload as { b64_json: string }).b64_json}`;
      if (isFinal) finalDataUrl = dataUrl;
      flushSync(() => onFrame(dataUrl, isFinal));
    },
  });

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.feed(value);
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  if (streamError) throw new Error(streamError);
  if (!finalDataUrl) throw new Error("Stream ended without completion");
  return finalDataUrl;
}

// ---- Prompt builder ----
import type { RealmNode } from "@/game/types";

const FAMILY_PROMPTS: Record<RealmNode["family"], string> = {
  arch_gate:
    "a solitary luminous stone archway on a floating platform, warm golden light spilling through the arch",
  observatory:
    "an isometric floating platform holding an ornate brass telescope pointed at an impossible ringed planet",
  star_forest:
    "delicate slender trees whose crowns are living constellations glowing softly, on a floating island",
  flooded_library:
    "half-submerged marble columns of books rising from still mirror-like water on a floating platform",
  clockwork_desert:
    "pale dunes climbing over enormous stopped bronze gears on a floating island, warm pastel light",
  mirror_kingdom:
    "a shattered mirror lake reflecting a wrong sky on a floating pale marble platform",
  floating_garden:
    "terraced platform of pastel blossoms drifting between clouds, tiny doors hidden among flowers",
  train_station:
    "a lonely floating platform with a single lit vintage train waiting in soft fog",
  sleeping_creature:
    "a tiny cluster of pale houses built along the back of an enormous sleeping whale-like creature drifting through space",
  vertical_ocean:
    "an impossible wall of dark water hanging sideways in the sky beside a floating platform, fish drifting through it like stars",
};

export function buildRealmPrompt(realm: RealmNode): string {
  const base = FAMILY_PROMPTS[realm.family];
  const paletteHint = `overall palette washed in ${realm.palette[0]}, ${realm.palette[1]}, ${realm.palette[2]}, with delicate ${realm.palette[3]} light glinting on edges`;
  const specialLine =
    realm.special === "false_home"
      ? "The central archway glows a warm familiar gold — uncanny, almost like home, but the geometry is subtly wrong."
      : realm.special === "real_home"
        ? "One archway at the heart of the composition radiates a warm remembered light — the doorway of returning."
        : "";
  return [
    "A breathtaking Monument Valley style illustration: a labyrinth of pale pastel floating islands and impossible architecture drifting in a deep dreamy cosmic sky.",
    "Multiple small platforms are connected by delicate staircases, arched bridges, colonnades and thin luminous walkways that weave through the composition like a puzzle maze.",
    "Tiny robed traveller figures stand on stairs and terraces at storybook scale, giving the architecture an enormous sense of quiet wonder.",
    `Featured landmark on the central island: ${base}.`,
    `Realm title (do not render as text in the image): "${realm.title}". ${specialLine}`,
    "Background: a lavender-rose starry cosmos with soft spiral galaxies, drifting planets (a ringed Saturn-like world, a pale gas giant, small moons), scattered stardust and faint nebulae.",
    paletteHint,
    "Painterly, ultra-high detail, soft cinematic ambient light, gentle rim glow, delicate shadows, serene and magical.",
    "Wide 3:2 composition, centered maze of islands with generous negative space of cosmos around them. Absolutely no text, no letters, no UI, no watermark, no logo.",
  ]
    .filter(Boolean)
    .join(" ");
}

