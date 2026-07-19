# Deployment guide

This repository has two independently deployed pieces:

1. The **Lovable frontend**, which starts image generation and displays shared art.
2. The **Cloudflare shared-world Worker**, backed by D1, Durable Objects, and a private Tigris bucket.

The Worker owns the shared job state and is the only component that has Tigris credentials. The browser only calls the Worker at `/v1/art/*`.

## Architecture

- **Cloudflare Worker + D1** (`worker/`) — owns leases, job state, and race-condition control. It serves `/v1/art/:seed` image bytes and the `/v1/art/:seed/{claim,complete,fail,live}` coordination endpoints.
- **Private Tigris bucket `alien-homecoming-art`** — canonical store for finished realm art under `realm-art/v1/<seed>.png`.
- **Frontend** — may use localStorage and IndexedDB for speed only. These use the v3 namespace and are never the shared source of truth.

Legacy Lovable/Supabase realm-art storage is not part of the shared-art flow.

## Prerequisites

- Node.js 22+ with npm and Bun available
- Cloudflare Workers, Durable Objects, and D1 enabled
- A private Tigris bucket and S3-compatible access-key pair
- Access to the connected GitHub repository and Lovable project

## One-time setup

The non-secret Tigris configuration belongs in `worker/wrangler.jsonc`:

```jsonc
"TIGRIS_STORAGE_ENDPOINT": "https://t3.storage.dev",
"TIGRIS_BUCKET": "alien-homecoming-art",
"TIGRIS_REGION": "auto"
```

Add the two secret values to Cloudflare. Enter them only when Wrangler prompts; never commit them:

```bash
npx wrangler secret put TIGRIS_STORAGE_ACCESS_KEY_ID --config worker/wrangler.jsonc
npx wrangler secret put TIGRIS_STORAGE_SECRET_ACCESS_KEY --config worker/wrangler.jsonc
```

For local Worker development, copy `worker/.dev.vars.example` to `worker/.dev.vars` and add the same secret values. This file is ignored by Git.

## Deploy the shared-world Worker

Run these commands from the repository root:

```bash
npx wrangler d1 migrations apply alien-homecoming-universe --remote \
  --config worker/wrangler.jsonc

npm run worker:deploy
```

Check the deployed service:

```bash
curl https://alien-homecoming-universe.shab-hacks.workers.dev/health
```

Expected response:

```json
{ "ok": true }
```

The default frontend Worker URL lives in `src/lib/worldConfig.ts`. `VITE_WORLD_API_URL` is a public override for previews or a future custom domain.

## Tigris realm-art reset

`worker/scripts/tigris-cleanup.ts` is a server-side operator tool. It can only list or delete the generated realm-art prefixes `realm-art/` and `realms/`; there is no frontend or public HTTP delete endpoint.

The script needs the same Tigris values as the Worker in its shell environment:

```bash
export TIGRIS_STORAGE_ENDPOINT=https://t3.storage.dev
export TIGRIS_BUCKET=alien-homecoming-art
export TIGRIS_REGION=auto
export TIGRIS_STORAGE_ACCESS_KEY_ID=...
export TIGRIS_STORAGE_SECRET_ACCESS_KEY=...
```

Run a dry run first. It makes no changes:

```bash
bun run worker/scripts/tigris-cleanup.ts
```

Only after reviewing the output, delete the listed generated objects:

```bash
bun run worker/scripts/tigris-cleanup.ts --apply
```

`worker/migrations/0002_reset_realm_art.sql` deletes the old D1 realm-art job, event, and realm rows. Apply it **once**, after the Tigris cleanup. Wrangler records applied migrations, so applying the same migration again will not repeat its SQL.

```bash
npx wrangler d1 migrations apply alien-homecoming-universe --remote \
  --config worker/wrangler.jsonc
```

Then redeploy the Worker:

```bash
npm run worker:deploy
```

## Deploy the Lovable frontend

1. Commit and push the connected repository's `main` branch.
2. Wait for the commit to appear in Lovable's version history and preview it.
3. Verify the shared-world release marker in the game.
4. Use **Publish → Update** in Lovable to deploy the snapshot to the live Lovable site.

Git sync updates the Lovable editor and preview; it does not publish the live site by itself.

## Verify a release

| Check              | Expected result                                              |
| ------------------ | ------------------------------------------------------------ |
| `npm run build`    | exits successfully                                           |
| `npx tsc --noEmit` | exits successfully                                           |
| Worker `/health`   | `{"ok":true}`                                                |
| Lovable preview    | current release marker visible                               |
| New realm          | one claimant generates; other clients wait and reuse its art |

## Operational rules

- Never put secrets in frontend variables, Git, or Lovable prompts.
- Do not force-push, rebase, amend, or rewrite history on the connected `main` branch.
- Keep the Tigris bucket private; the Worker proxies image reads.
- Treat a failed Worker health check, failed D1 migration, or missing Worker secret as a failed deployment.
