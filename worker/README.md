# Alien Homecoming Cloudflare worker

This folder is deployed independently from the Lovable frontend but remains in the same repository.

It provides a D1-backed global realm registry and job audit trail, a Durable Object that serialises image-generation leases, and a Tigris S3 adapter for generated realm artwork. Player journeys stay in the frontend's local storage.

```bash
npx wrangler d1 execute alien-homecoming-universe --remote --config worker/wrangler.jsonc --file worker/migrations/0001_universe.sql
npx wrangler secret put TIGRIS_ACCESS_KEY_ID --config worker/wrangler.jsonc
npx wrangler secret put TIGRIS_SECRET_ACCESS_KEY --config worker/wrangler.jsonc
npx wrangler deploy --config worker/wrangler.jsonc
```

Create a private Tigris bucket called `alien-homecoming-art` before deploying, or update `TIGRIS_BUCKET` in `wrangler.jsonc`. The Worker proxies reads, so the bucket does not need to be public.

For local development, run the worker and the Lovable frontend in separate terminals:

```bash
npx wrangler d1 execute alien-homecoming-universe --local --config worker/wrangler.jsonc --file worker/migrations/0001_universe.sql
npx wrangler dev --local --config worker/wrangler.jsonc
npm run dev
```

The frontend uses `VITE_WORLD_API_URL` when set; otherwise development defaults to `http://127.0.0.1:8787`.
