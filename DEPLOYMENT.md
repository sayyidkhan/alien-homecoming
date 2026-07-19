# Deployment guide

This repository has two independently deployed pieces:

1. The **frontend**, built and hosted by Lovable.
2. The **shared-world Worker**, hosted by Cloudflare and backed by D1, Durable Objects, and Tigris.

The frontend makes public requests to the Worker. Tigris credentials never leave the Worker.

## Prerequisites

- Node.js 22+ and npm
- A Cloudflare account with Workers, Durable Objects, and D1 enabled
- A Tigris account, bucket, and S3 access key pair
- Access to the connected GitHub repository and Lovable project

## One-time infrastructure setup

### 1. Create the Tigris bucket

Create a private bucket named `alien-homecoming-art`. The bucket name, endpoint, and region are non-secret configuration in `worker/wrangler.jsonc`:

```jsonc
"TIGRIS_STORAGE_ENDPOINT": "https://t3.storage.dev",
"TIGRIS_BUCKET": "alien-homecoming-art",
"TIGRIS_REGION": "auto"
```

### 2. Create and initialise Cloudflare D1

Create a D1 database and put its ID in `worker/wrangler.jsonc`. Then apply the schema once:

```bash
npx wrangler d1 execute alien-homecoming-universe --remote \
  --config worker/wrangler.jsonc \
  --file worker/migrations/0001_universe.sql
```

### 3. Add Worker secrets

Run these commands from the repository root. Enter each value only when Wrangler prompts; never commit the values.

```bash
npx wrangler secret put TIGRIS_STORAGE_ACCESS_KEY_ID --config worker/wrangler.jsonc
npx wrangler secret put TIGRIS_STORAGE_SECRET_ACCESS_KEY --config worker/wrangler.jsonc
```

For local Worker development, copy `worker/.dev.vars.example` to `worker/.dev.vars` and add the same two values there. The file is ignored by Git.

## Deploy the Cloudflare Worker

```bash
npm run worker:deploy
```

Check the returned Worker URL:

```bash
curl https://alien-homecoming-universe.sayyidkhan92.workers.dev/health
```

Expected response:

```json
{ "ok": true }
```

The standard production URL is defined in `src/lib/worldConfig.ts`. `VITE_WORLD_API_URL` remains a public override for a preview environment or future custom Worker domain.

## Deploy the Lovable frontend

1. Commit and push to the connected repository's `main` branch.
2. Wait for the commit to appear in Lovable's version history and preview that version.
3. Verify the bottom-left release marker in the game.
4. Click **Publish → Update** in Lovable to deploy that snapshot to `alien-homecoming.lovable.app`.

Git sync updates the Lovable editor/preview; it does not publish the live site by itself.

## Verify a release

| Check                            | Expected result                |
| -------------------------------- | ------------------------------ |
| `npm run build`                  | exits successfully             |
| `npx tsc --noEmit`               | exits successfully             |
| Worker `/health`                 | `{"ok":true}`                  |
| Lovable preview                  | current release marker visible |
| Published site in private window | same release marker visible    |

## Migrate static image assets to Tigris

First run a dry run; it reads no credentials and uploads nothing:

```bash
npm run tigris:migrate -- path/to/assets
```

To perform the upload, export the Tigris values in the current shell and add `--apply`:

```bash
TIGRIS_STORAGE_ENDPOINT=https://t3.storage.dev \
TIGRIS_BUCKET=alien-homecoming-art \
TIGRIS_REGION=auto \
TIGRIS_STORAGE_ACCESS_KEY_ID=... \
TIGRIS_STORAGE_SECRET_ACCESS_KEY=... \
npm run tigris:migrate -- path/to/assets --apply
```

The script only uploads local image files (`png`, `jpg`, `jpeg`, `webp`, `avif`, `gif`, `svg`) and places them under the `static/` object prefix. It does not delete any source files or existing Tigris objects.

## Operational rules

- Do not place secrets in frontend variables, Git, or Lovable prompts.
- Do not force-push, rebase, or rewrite the connected `main` branch.
- Keep the Tigris bucket private. The Worker proxies image reads.
- Treat a missing Worker health check, failed D1 migration, or missing Tigris secret as a failed deployment.
