# Alien Homecoming Cloudflare worker

This folder is deployed independently from the Lovable frontend but remains in the same repository.

It provides a D1-backed global realm registry and job audit trail, a Durable Object that serialises image-generation leases, and a Tigris S3 adapter for generated realm artwork. Player journeys stay in the frontend's local storage.

```bash
npx wrangler d1 execute alien-homecoming-universe --remote --config worker/wrangler.jsonc --file worker/migrations/0001_universe.sql
npx wrangler secret put TIGRIS_STORAGE_ACCESS_KEY_ID --config worker/wrangler.jsonc
npx wrangler secret put TIGRIS_STORAGE_SECRET_ACCESS_KEY --config worker/wrangler.jsonc
npx wrangler deploy --config worker/wrangler.jsonc
```

Create a private Tigris bucket called `alien-homecoming-art` before deploying, or update `TIGRIS_BUCKET` in `wrangler.jsonc`. Non-secret endpoint and bucket settings live in `wrangler.jsonc`; local credentials belong in `worker/.dev.vars` (copy `worker/.dev.vars.example`). The Worker proxies reads, so the bucket does not need to be public. `https://iam.storage.dev` is only for Tigris account/IAM management and is not used by this Worker.

For local development, run the worker and the Lovable frontend in separate terminals:

```bash
npx wrangler d1 execute alien-homecoming-universe --local --config worker/wrangler.jsonc --file worker/migrations/0001_universe.sql
npx wrangler dev --local --config worker/wrangler.jsonc
npm run dev
```

The frontend's normal default is the deployed Worker URL in `src/lib/worldConfig.ts`. To point a local frontend at this local Worker, create `.env.local` in the repository root with `VITE_WORLD_API_URL=http://127.0.0.1:8787`.
