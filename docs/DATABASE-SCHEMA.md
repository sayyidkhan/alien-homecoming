# Shared-world database schema

The shared-world database is a Cloudflare D1 (SQLite) database named
`alien-homecoming-universe`. It stores **metadata and coordination state**, not
image files. Finished realm images live in the private Tigris bucket
`alien-homecoming-art`.

Player progression is deliberately not in this database. A player's route,
discoveries, and position remain in browser `localStorage`; browser image caches
live in memory and IndexedDB.

## Data model

```text
realms (one canonical realm per seed)
  seed ──────────────┐
                     │ 1:1
                     ▼
                art_jobs (one current job per realm)
                     │
                     │ 1:many
                     ▼
                art_events (append-only lifecycle history)

art_jobs.object_key ──► Tigris object
                        realm-art/v1/<seed>.png
```

`seed` is deterministic for the current universe version and the route through
it. It is the global cache key: identical seeds resolve to one shared image.

## `realms`

Created when a browser first claims art for a seed. It records the realm context
needed for traceability; it does not contain the image prompt or image bytes.

| Column | Type | Constraints | Meaning |
| --- | --- | --- | --- |
| `seed` | `TEXT` | Primary key | Stable global realm/art identifier. |
| `parent_seed` | `TEXT` | Nullable | Seed of the realm from which this realm was reached. |
| `portal_id` | `TEXT` | Nullable | Portal used to enter the realm. |
| `title` | `TEXT` | Required | Display title captured at claim time. |
| `prompt_hash` | `TEXT` | Required | Non-secret fingerprint of the generated-image prompt. |
| `created_at` | `INTEGER` | Required | Unix epoch milliseconds. |

## `art_jobs`

There is at most one current job per realm. The Worker and a globally named
Durable Object use this row as the durable lease record, so browsers can race
safely without generating the same realm in parallel.

| Column | Type | Constraints | Meaning |
| --- | --- | --- | --- |
| `seed` | `TEXT` | Primary key; references `realms(seed)` | Realm whose image is being coordinated. |
| `status` | `TEXT` | Required; `queued`, `generating`, `ready`, or `failed` | Current lifecycle state. |
| `lease_id` | `TEXT` | Nullable | Opaque ownership token held only by the generating browser. |
| `lease_expires_at` | `INTEGER` | Nullable | Lease deadline in Unix epoch milliseconds. Current lease duration: 150 seconds. |
| `attempt` | `INTEGER` | Required; default `0` | Number of ownership attempts for this seed. |
| `object_key` | `TEXT` | Nullable | Tigris object key once assigned, normally `realm-art/v1/<seed>.png`. |
| `content_type` | `TEXT` | Nullable | Stored image MIME type, for example `image/png`. |
| `error_code` | `TEXT` | Nullable | Last terminal/retryable failure classification. |
| `started_at` | `INTEGER` | Nullable | Current attempt start time. |
| `completed_at` | `INTEGER` | Nullable | Time the image was successfully stored. |
| `updated_at` | `INTEGER` | Required | Last state transition time. |

Indexes:

| Index | Columns | Used for |
| --- | --- | --- |
| `art_jobs_status_updated_idx` | `status`, `updated_at` | Finding stale generation leases and operational inspection. |

## `art_events`

An append-only audit trail of job transitions. It is intentionally lightweight:
the current truth lives in `art_jobs`; events explain how it arrived there.

| Column | Type | Constraints | Meaning |
| --- | --- | --- | --- |
| `id` | `INTEGER` | Primary key; autoincrement | Event identifier. |
| `seed` | `TEXT` | Required; references `art_jobs(seed)` | Related realm job. |
| `event_type` | `TEXT` | Required | Lifecycle event, currently `claimed`, `ready`, or `failed`. |
| `attempt` | `INTEGER` | Nullable | Job attempt associated with the event. |
| `created_at` | `INTEGER` | Required | Unix epoch milliseconds. |

Index: `art_events_seed_created_idx (seed, created_at)` supports a realm's
timeline in chronological order.

## Job lifecycle and invariants

```text
missing ──claim──► generating ──complete + Tigris upload──► ready
                       │                                      │
                       ├──fail────────────────────────────────► failed
                       └──lease expiry──► next claim/attempt ──┘
```

1. `POST /v1/art/:seed/claim` creates the realm if necessary.
2. Only one caller receives `owner` plus a `lease_id`; other callers receive
   `waiting` and subscribe to `/v1/art/:seed/live` over WebSocket.
3. The owner sends its final data URL to `POST /v1/art/:seed/complete`.
4. The Worker checks that the lease is still current, uploads the image to
   Tigris, updates the D1 job to `ready`, records an event, and broadcasts the
   Worker-served image URL.
5. A failed owner calls `/fail`, or an expired lease can be claimed by a new
   browser. The image is never marked `ready` until the Tigris upload succeeds.

The client never receives Tigris credentials. `GET /v1/art/:seed` reads the
private object through the Worker only after D1 reports `ready`.

## Operational queries

Run these from the repository root. They are read-only.

```bash
# Current job state
npx wrangler d1 execute alien-homecoming-universe --remote \
  --config worker/wrangler.jsonc \
  --command "SELECT seed, status, attempt, updated_at, object_key FROM art_jobs ORDER BY updated_at DESC;"

# Jobs that may have a stale lease
npx wrangler d1 execute alien-homecoming-universe --remote \
  --config worker/wrangler.jsonc \
  --command "SELECT seed, lease_id, lease_expires_at, updated_at FROM art_jobs WHERE status = 'generating' ORDER BY updated_at ASC;"

# Event history for one realm (replace <seed>)
npx wrangler d1 execute alien-homecoming-universe --remote \
  --config worker/wrangler.jsonc \
  --command "SELECT event_type, attempt, created_at FROM art_events WHERE seed = '<seed>' ORDER BY created_at;"
```

## Schema source and reset policy

- Initial schema: [`worker/migrations/0001_universe.sql`](../worker/migrations/0001_universe.sql)
- One-time legacy reset: [`worker/migrations/0002_reset_realm_art.sql`](../worker/migrations/0002_reset_realm_art.sql)

The reset migration removed rows that referenced the old `realms/<seed>.png`
object prefix. It is recorded by Wrangler and does not re-run on later deploys.
Do not use it as a routine cleanup mechanism. The controlled Tigris cleanup
script is documented in [DEPLOYMENT.md](../DEPLOYMENT.md).
