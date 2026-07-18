## 1. What each realm image actually costs

From this project's AI Gateway logs (last ~30 min, `openai/gpt-image-2`, `quality: "low"`, 1024×1024, `partial_images: 3`, streaming):

- Typical cost per successful generation: **~0.038–0.057 credits** (roughly 4–6 hundredths of a credit).
- Fallback `google/gemini-3.1-flash-lite-image`: **~0 credits** in the logs.
- Cancelled streams (e.g. user navigates away mid-paint) still burn upstream time but log as `unknown` cost.

So the "expensive" part isn't one image — it's that today **every device regenerates every realm from scratch**, because the cache lives only in that browser's IndexedDB/localStorage. 10 players exploring 8 realms each = ~80 generations instead of ~8.

## 2. Goal

Paint each realm's seed **once, globally**, store the PNG in Lovable Cloud, and let every device fetch it by seed. Keep the device-side IndexedDB cache as a fast local layer on top.

## 3. Proposed architecture

```text
Browser ──► /api/realm-art/:seed (GET)
             │
             ├─ hit  → 302 redirect to Storage public URL   (fast, no credits)
             └─ miss → stream from gpt-image-2, upload PNG to Storage,
                       insert row in realm_art, then redirect

Browser ──► IndexedDB (unchanged, per-device warm cache)
```

Flow on the client:
1. `ensureRealmArt(seed)` first checks in-memory + IndexedDB (as today).
2. On miss, instead of hitting `/api/generate-realm` directly, it hits `/api/realm-art/:seed`.
3. That endpoint returns either the cached PNG URL or streams a fresh one, then caches it server-side.
4. For the streaming "painting-in" UX we keep `/api/generate-realm` but only call it when the server tells us there is no shared cache yet (so the first visitor of a seed still sees the live paint; everyone after gets an instant URL).

## 4. Concrete changes

### Backend (Lovable Cloud)
- Enable Lovable Cloud.
- Create a public Storage bucket `realm-art` (PNG, immutable, long cache headers).
- Create table `public.realm_art`:
  - `seed text primary key`
  - `title text`
  - `family text`
  - `storage_path text not null`
  - `public_url text not null`
  - `prompt_hash text` (so we can invalidate if the prompt builder changes)
  - `created_at timestamptz default now()`
  - Grants: `SELECT` to `anon` + `authenticated`; writes only via service role.
  - RLS enabled, `SELECT` policy `using (true)`.

### Server routes (TanStack, under `src/routes/api/`)
- `GET /api/realm-art/:seed` — look up row; if present, `302` to `public_url`. If absent, return `404` with a small JSON `{ needsPaint: true }`.
- `POST /api/realm-art/:seed` — body `{ prompt, title, family, promptHash }`. Uses `supabaseAdmin` to:
  1. Re-check row (avoid double work if two clients race).
  2. Call the gateway non-streaming (or buffer the existing stream server-side) to get the final PNG bytes.
  3. Upload to `realm-art/{seed}.png`.
  4. Insert the row.
  5. Return `{ public_url }`.
- Keep `/api/generate-realm` **only** for the first-visit streaming preview; after `image_generation.completed` fires, the client posts the final image to `POST /api/realm-art/:seed` (or the server writes it itself while streaming — simpler if we buffer server-side).

Decision to confirm with you: do we still want the "painting-in" partial-frame animation for the first visitor of a seed? If yes we keep the SSE path + a post-write. If not, we simplify to a single non-streaming server route that returns `public_url` and drops all the SSE code.

### Client
- `src/lib/realmArtCache.ts`: add a `fetchSharedArt(seed)` step between IndexedDB miss and the network paint job. On hit, write the bytes into IndexedDB and resolve.
- On paint completion, POST the final data URL to `/api/realm-art/:seed` so the next visitor of that seed anywhere in the world gets the cached copy.
- No change to the game loop, HUD, PrewarmHUD, Atlas, or Minimap.

## 5. Cost impact (rough)
- First discovery of a seed anywhere: ~0.04 credits (one gpt-image-2 call).
- Every subsequent visit on any device: **0 credits**, just a Storage GET.
- Prewarming neighbors also becomes shared, so speculative paints stop multiplying per user.

## 6. Open questions for you
1. Public bucket OK? (Faster + no auth headers; seeds are non-secret.) If your workspace blocks public buckets I'll fall back to signed URLs.
2. Keep the live "painting-in" streaming animation for the first visitor of a seed, or is an instant final image fine for everyone?
3. Should we backfill the seeds you've already generated (I can add a small admin endpoint), or start caching fresh from now on?
