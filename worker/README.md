# Alien Homecoming Cloudflare worker

This folder is deployed independently from the Lovable frontend but remains in the same repository.

It provides one global Durable Object for the shared adventure, plus an R2 bucket for the generated realm artwork.

```bash
npx wrangler r2 bucket create alien-homecoming-art
npx wrangler deploy --config worker/wrangler.jsonc
```

For local development, run the worker and the Lovable frontend in separate terminals:

```bash
npx wrangler dev --config worker/wrangler.jsonc
npm run dev
```

The frontend uses `VITE_WORLD_API_URL` when set; otherwise development defaults to `http://127.0.0.1:8787`.
