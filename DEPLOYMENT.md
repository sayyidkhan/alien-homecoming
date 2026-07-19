# Deployment

The shared realm-art library lives entirely on Cloudflare + Tigris. The
frontend never receives Tigris credentials; it only ever talks to the
Cloudflare Worker at `/v1/art/*`.

## Architecture

- **Cloudflare Worker + D1** (`worker/`) — owns job state, leases, and
  race-condition control. Serves `/v1/art/:seed` (image bytes) and the
  `/v1/art/:seed/{claim,complete,fail,live}` coordination endpoints.
- **Private Tigris bucket `alien-homecoming-art`** — canonical store for
  final PNGs, keyed under the versioned prefix `realm-art/v1/<seed>.png`.
- **Frontend** — reads via the Worker, caches locally (localStorage +
  IndexedDB, keyed with the `v3` cache namespace) purely for speed.

Legacy Lovable/Supabase storage buckets and the old `public.realm_art`
table have been removed. Old client caches are automatically invalidated
by the `v3` namespace bump.

## Worker

```bash
cd worker
bunx wrangler d1 migrations apply alien-homecoming-universe --remote
bunx wrangler deploy
```

The D1 migration `0002_reset_realm_art.sql` clears any pre-existing job
state so no lease points at the legacy `realms/<seed>.png` prefix.

Required Worker secrets (set via `wrangler secret put`):

- `TIGRIS_STORAGE_ACCESS_KEY_ID`
- `TIGRIS_STORAGE_SECRET_ACCESS_KEY`

Public vars are already declared in `wrangler.jsonc`
(`TIGRIS_STORAGE_ENDPOINT`, `TIGRIS_BUCKET`, `TIGRIS_REGION`).

## Tigris cleanup script

`worker/scripts/tigris-cleanup.ts` deletes every object under the
`realm-art/` and legacy `realms/` prefixes in the bucket. It is a
server-side operator tool — there is no matching HTTP endpoint on the
Worker or the app, and the frontend has no way to trigger it.

Environment (same values as the Worker):

```bash
export TIGRIS_STORAGE_ENDPOINT=https://t3.storage.dev
export TIGRIS_BUCKET=alien-homecoming-art
export TIGRIS_REGION=auto
export TIGRIS_STORAGE_ACCESS_KEY_ID=...
export TIGRIS_STORAGE_SECRET_ACCESS_KEY=...
```

**Dry run (default, no changes):**

```bash
bun run worker/scripts/tigris-cleanup.ts
```

**Actually delete (irreversible):**

```bash
bun run worker/scripts/tigris-cleanup.ts --apply
```

After running with `--apply`, also re-apply the D1 migration above so the
job table matches the now-empty bucket.
