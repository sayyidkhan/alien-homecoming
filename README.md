# Lost Between Worlds

A browser-based, AI-painted exploration game. Players keep their own journey locally, while the universe's finished realm artwork is shared globally so the same realm is never generated twice under normal use.

- **Live app:** https://alien-homecoming.lovable.app
- **Release marker:** the bottom-left stamp in the game identifies the deployed frontend revision.

## What is shared vs local

| Scope                                            | Location                                | Why                                       |
| ------------------------------------------------ | --------------------------------------- | ----------------------------------------- |
| Player route, discoveries, Home Echoes, position | Browser `localStorage`                  | Personal progression; no account needed.  |
| Fast image cache                                 | Browser memory + IndexedDB              | Instant reloads on the same device.       |
| Canonical realm-art library and jobs             | Cloudflare D1 + Durable Object + Tigris | One image per realm seed for all players. |

When a realm is missing, the first browser gets a short generation lease. Other browsers wait over WebSocket. Once the owner finishes generating the image, the Worker stores it in Tigris and announces the final shared URL.

At startup, the app scans every realm known to that browser and backfills any legacy browser-cached image to Tigris—no extra image generation is required.

## Local development

```bash
npm install
npm run dev
```

The frontend is available at `http://127.0.0.1:8080/`.

To use a local Worker instead of the deployed shared-world service, run in a second terminal:

```bash
cp worker/.dev.vars.example worker/.dev.vars
npx wrangler d1 execute alien-homecoming-universe --local --config worker/wrangler.jsonc --file worker/migrations/0001_universe.sql
npm run worker:dev
```

Then create `.env.local` with:

```bash
VITE_WORLD_API_URL=http://127.0.0.1:8787
```

Never put Tigris access keys in a `VITE_*` variable. Those values are exposed to browsers.

## Asset migration

There are no committed realm images in this repository; the shared library starts clean and grows only when a player visits a new realm. The app also backfills a cached realm image from the same browser to Tigris when it is revisited.

For static files you intentionally want to upload, first preview the operation:

```bash
npm run tigris:migrate -- path/to/assets
```

Then upload only after checking the listed object keys:

```bash
TIGRIS_STORAGE_ENDPOINT=https://t3.storage.dev \
TIGRIS_BUCKET=alien-homecoming-art \
TIGRIS_REGION=auto \
TIGRIS_STORAGE_ACCESS_KEY_ID=... \
TIGRIS_STORAGE_SECRET_ACCESS_KEY=... \
npm run tigris:migrate -- path/to/assets --apply
```

The migration tool handles filesystem/static images only. It never deletes source assets or reads browser IndexedDB.

## Documentation

- [Deployment guide](DEPLOYMENT.md)
- [Tech stack and architecture](docs/TECH-STACK.md)
- [Shared-world database schema](docs/DATABASE-SCHEMA.md)
- [Cloudflare Worker notes](worker/README.md)

## Development commands

```bash
npm run dev             # frontend
npm run worker:dev      # local Worker + local D1
npm run build           # production build
npm run lint            # lint
npm run tigris:migrate -- path/to/assets
```
