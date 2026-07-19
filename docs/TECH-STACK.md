# Tech stack

## Architecture

```text
                     ┌──────────────────────────┐
                     │        Lovable app        │
                     │ TanStack Start + React UI │
                     └────────────┬─────────────┘
                                  │ public HTTPS / WebSocket
                     ┌────────────▼─────────────┐
                     │    Cloudflare Worker     │
                     │ art API + Tigris proxy   │
                     └───────┬─────────┬────────┘
                             │         │
                 ┌───────────▼───┐ ┌───▼──────────────┐
                 │ D1 (metadata)│ │ Durable Object   │
                 │ art jobs     │ │ one active lease │
                 └──────────────┘ └──────────────────┘
                             │
                     ┌───────▼────────┐
                     │ Tigris (images)│
                     └────────────────┘
```

## Components

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Frontend | TanStack Start, React 19, TypeScript, Vite, Tailwind CSS | Game UI, local progression, browser image cache, calls shared-world API. |
| Image generation | Lovable AI Gateway | Creates an image only when the lease-owning browser finds no finished art. |
| Edge API | Cloudflare Worker | Claims jobs, proxies image reads, stores completed output, applies CORS. |
| Coordination | Cloudflare Durable Object | Serialises each realm's generation lease and notifies waiting browsers by WebSocket. |
| Metadata | Cloudflare D1 | Canonical realm records and `art_jobs` state/audit trail. |
| Object storage | Tigris | Private S3-compatible object storage for canonical finished images. |
| Device state | `localStorage`, IndexedDB | Player journey and a fast per-device art cache. |
| Source/deploy workflow | GitHub + Lovable + Cloudflare | GitHub is source control; Lovable builds the frontend; Cloudflare deploys the Worker. |

## Shared-art lifecycle

1. The game looks for an image in memory, `localStorage`, IndexedDB, then the shared Worker.
2. At startup, the game scans the player's known local realms. If an old local data-URL image is found, it quietly backfills it to Tigris when it can acquire the lease.
3. If art is absent globally, a browser calls `POST /v1/art/:seed/claim`.
4. The Durable Object gives one browser an owner lease. Other browsers receive `waiting` and open a WebSocket.
5. The owner generates the image through the frontend's image-generation route, then calls `complete`.
6. The Worker verifies the lease, writes the image to Tigris, updates D1, and broadcasts `ready`.
7. All browsers receive the Worker URL and retain their own local cache.

## Data boundaries

- **Shared globally:** realm seed, prompt hash, job status, canonical image object, finished image URL.
- **Local to a player:** travelled route, discoveries, Home Echoes, position, browser cache.
- **Secrets:** Tigris access key and secret key exist only as Cloudflare Worker secrets or local `worker/.dev.vars`.
- **Public configuration:** Worker URL, Tigris endpoint, bucket name, and region.

## MVP constraints

- No login means the Worker cannot identify a player. It coordinates normal clients but cannot prevent a malicious client from calling the public art endpoints directly.
- The Worker limits image payloads to 8 MB and leases expire after 150 seconds.
- Tigris is private; the Worker reads and serves art instead of exposing bucket credentials.
- A later hardening pass should move image generation behind a server-side authenticated job runner and add abuse controls/rate limits.

## Versioning and deployment signals

`src/lib/release.ts` contains the visible frontend release marker. Bump it for every deployable user-facing change.

The evidence chain is:

```text
GitHub commit on main → Lovable version history → Lovable Preview marker
→ Publish → Update → marker on public lovable.app URL
```
