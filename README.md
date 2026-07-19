# Lost Between Worlds

**Team name:** alien-homecoming
**One-sentence pitch:** A tiny alien wanders an AI-painted multiverse, hopping between hand-crafted realms and chasing three Home Echoes to find the doorway back.
**Project link:** https://alien-homecoming.lovable.app

**Domain name suggestions:**

- magicalwayback.com
- thewayback.dev
- thewaybackgame.com
- waybackexplore.com

---

## About

*Lost Between Worlds* is a browser-based generative exploration game. You control a tiny traveller adrift in a persistent multiverse of dreamlike realms. Every world is illustrated on demand by an image model, but the multiverse itself is a deterministic graph — the same seed always weaves the same constellation of places, so your journey is yours to keep.

Wander far enough and you may find one of three **Home Echoes** — resonant fragments of the place you came from. Collect all three and the final doorway home opens.

## Core Features

- **Generative realms** — Full-bleed illustrated scenes generated via the Lovable AI Gateway (`openai/gpt-image-2`, with a Gemini flash fallback for speed), streamed in with a cosmic loading state.
- **Shared universe art** — Every player keeps their own route, discoveries and Home Echoes locally. The canonical realm-art library is global, so a finished realm is reused on every device.
- **Walkable scenes** — The alien is a DOM sprite you can steer across each painted realm; clickable portals warp you between worlds with a "the way you came" portal that gently pulses into view.
- **Star Chart minimap** — A cosmos-styled map of every realm you have visited, with 2D / 3D projection, drag-to-rotate, wheel zoom, pan, home recenter, expand and fullscreen — collapsed behind a `⋯` dropdown on small screens.
- **Atlas of Worlds** — A grid of every discovered realm with its AI thumbnail; click any card to jump straight there.
- **Prewarming** — Neighbouring realms paint speculatively in the background while you explore, with a live "painting ahead" HUD.
- **Home Echoes** — Three collectible resonances gate the final doorway; discoveries and inventory persist across sessions.

## Tech Stack

- **TanStack Start v1** on Vite 7 (React 19, SSR-safe client-only game shell)
- **TypeScript** (strict) + Tailwind CSS v4
- **Lovable AI Gateway** for streamed image generation (`openai/gpt-image-2`, `google/gemini-3.1-flash-lite-image`)
- **Cloudflare D1 + Durable Objects** for the global realm registry and single-flight art leases; **Tigris** for image bytes; IndexedDB/localStorage for device caches
- Deterministic seeded generation (`mulberry32`) for the realm graph
- Hand-rolled isometric SVG projection for the Star Chart

## How to Play

1. Open the project link.
2. Walk your alien around the realm; click any portal to travel.
3. Use the **↩ blue portal** to return the way you came.
4. Open the **Star Chart** (bottom-right) to see the cosmos you have mapped, or the **Atlas** to jump to any discovered world.
5. Find the three Home Echoes. Step through the final doorway. Go home.

## Local Development

```bash
bun install
bun run dev
```

Enable the Lovable AI Gateway in the project so the `/api/generate-realm` server route can stream images. Without it, realms will stay in the loading state.

## Shared universe service

The Lovable app and the Cloudflare backend share this repository. The frontend stays deployed by Lovable; `worker/` is a thin Cloudflare Worker with:

- **D1** — canonical realm records and the `art_jobs` audit trail.
- **Durable Object** — one global lease coordinator. One browser paints a missing realm; other browsers wait for its final image.
- **Tigris** — private S3-compatible image storage, proxied by the Worker.

Player progression never goes through this service; it remains in the browser.

The D1 database is configured in `worker/wrangler.jsonc`. Before the first Worker deploy, create a Tigris bucket named `alien-homecoming-art`, then add its S3 credentials as Worker secrets:

```bash
npx wrangler secret put TIGRIS_STORAGE_ACCESS_KEY_ID --config worker/wrangler.jsonc
npx wrangler secret put TIGRIS_STORAGE_SECRET_ACCESS_KEY --config worker/wrangler.jsonc
npx wrangler deploy --config worker/wrangler.jsonc
```

After deployment, set `VITE_WORLD_API_URL` in Lovable to the Worker URL printed by Wrangler (for example, `https://alien-homecoming-universe.<account>.workers.dev`). This is a public endpoint URL, not a secret. Realm art is fetched from the Worker before a device invokes image generation, while IndexedDB remains a local speed cache.

Use `.env.example` for the public Lovable/Vite value. Tigris credential names and a local Worker template are in `worker/.dev.vars.example`; do not put those credentials in a `VITE_*` variable, because Vite exposes those to browsers.

For a future production hardening pass, validate the image-generation lease in `/api/generate-realm` server-side. The current client-side lease flow prevents normal-player races, but a public no-login MVP can still be bypassed by a malicious direct API caller.
