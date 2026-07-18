import { AwsClient } from "aws4fetch";
import { DurableObject } from "cloudflare:workers";

interface Env {
  DB: D1Database;
  ART_COORDINATOR: DurableObjectNamespace<SharedWorld>;
  TIGRIS_ENDPOINT: string;
  TIGRIS_BUCKET: string;
  TIGRIS_REGION?: string;
  TIGRIS_ACCESS_KEY_ID: string;
  TIGRIS_SECRET_ACCESS_KEY: string;
}

type ArtJob = {
  seed: string;
  status: "queued" | "generating" | "ready" | "failed";
  lease_id: string | null;
  lease_expires_at: number | null;
  attempt: number;
  object_key: string | null;
  content_type: string | null;
  updated_at: number;
};

type ArtEvent =
  | { type: "art.updated"; status: "generating"; leaseExpiresAt: number }
  | { type: "art.updated"; status: "ready"; url: string }
  | { type: "art.updated"; status: "failed"; retryAfterMs: number };

const COORDINATOR_NAME = "realm-art";
const LEASE_MS = 150_000;
const FAILED_RETRY_MS = 1_200;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  try {
    const url = new URL(origin);
    const isLovable = url.protocol === "https:" && url.hostname.endsWith(".lovable.app");
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return isLovable || isLocal ? origin : null;
  } catch {
    return null;
  }
}

function cors(response: Response, request: Request) {
  const origin = allowedOrigin(request);
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function artPath(seed: string) {
  return `/v1/art/${encodeURIComponent(seed)}`;
}

function artKey(seed: string) {
  return `realms/${encodeURIComponent(seed)}.png`;
}

function publicArtUrl(request: Request, seed: string) {
  return new URL(artPath(seed), request.url).toString();
}

function isValidSeed(seed: string) {
  return seed.length > 0 && seed.length <= 500;
}

function decodeDataUrl(dataUrl: string) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) return null;
  const bytes = Uint8Array.from(atob(match[2].replace(/\s/g, "")), (char) => char.charCodeAt(0));
  return { contentType: match[1], bytes };
}

function tigrisUrl(env: Env, objectKey: string) {
  const endpoint = env.TIGRIS_ENDPOINT.replace(/\/$/, "");
  const path = objectKey.split("/").map(encodeURIComponent).join("/");
  return `${endpoint}/${encodeURIComponent(env.TIGRIS_BUCKET)}/${path}`;
}

function tigrisClient(env: Env) {
  if (!env.TIGRIS_ACCESS_KEY_ID || !env.TIGRIS_SECRET_ACCESS_KEY) {
    throw new Error("Tigris credentials are not configured");
  }
  return new AwsClient({
    accessKeyId: env.TIGRIS_ACCESS_KEY_ID,
    secretAccessKey: env.TIGRIS_SECRET_ACCESS_KEY,
    service: "s3",
    region: env.TIGRIS_REGION || "auto",
  });
}

async function putTigris(env: Env, objectKey: string, image: { contentType: string; bytes: Uint8Array }) {
  const response = await tigrisClient(env).fetch(tigrisUrl(env, objectKey), {
    method: "PUT",
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    body: image.bytes,
  });
  if (!response.ok) throw new Error(`Tigris upload failed (${response.status})`);
}

async function getTigris(env: Env, objectKey: string) {
  return tigrisClient(env).fetch(tigrisUrl(env, objectKey));
}

/**
 * One globally named object serialises art ownership. Its original class name
 * is retained so the existing v1 Durable Object migration stays valid.
 */
export class SharedWorld extends DurableObject<Env> {
  private sockets = new Map<string, Set<WebSocket>>();

  async fetch(request: Request) {
    const url = new URL(request.url);
    const match = /^\/v1\/art\/([^/]+)\/(claim|complete|fail|live)$/.exec(url.pathname);
    if (!match) return new Response("Not found", { status: 404 });
    const seed = decodeURIComponent(match[1]);
    if (!isValidSeed(seed)) return json({ error: "Invalid art seed" }, { status: 400 });

    switch (match[2]) {
      case "claim":
        return request.method === "POST" ? this.claim(request, seed) : new Response("Method not allowed", { status: 405 });
      case "complete":
        return request.method === "POST" ? this.complete(request, seed) : new Response("Method not allowed", { status: 405 });
      case "fail":
        return request.method === "POST" ? this.fail(request, seed) : new Response("Method not allowed", { status: 405 });
      case "live":
        return request.method === "GET" ? this.openLiveConnection(request, seed) : new Response("Method not allowed", { status: 405 });
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  private async claim(request: Request, seed: string) {
    const body = (await request.json()) as {
      title?: unknown;
      promptHash?: unknown;
      parentSeed?: unknown;
      portalId?: unknown;
    };
    if (typeof body.title !== "string" || typeof body.promptHash !== "string") {
      return json({ error: "title and promptHash are required" }, { status: 400 });
    }

    const now = Date.now();
    const title = body.title.slice(0, 180);
    const promptHash = body.promptHash.slice(0, 180);
    const parentSeed = typeof body.parentSeed === "string" ? body.parentSeed.slice(0, 500) : null;
    const portalId = typeof body.portalId === "string" ? body.portalId.slice(0, 180) : null;
    await this.env.DB.prepare(
      "INSERT OR IGNORE INTO realms (seed, parent_seed, portal_id, title, prompt_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(seed, parentSeed, portalId, title, promptHash, now)
      .run();

    const job = await this.getJob(seed);
    if (job?.status === "ready") return json({ status: "ready", url: publicArtUrl(request, seed) });
    if (job?.status === "generating" && (job.lease_expires_at ?? 0) > now) {
      return json({ status: "waiting", leaseExpiresAt: job.lease_expires_at });
    }
    const leaseId = crypto.randomUUID();
    const leaseExpiresAt = now + LEASE_MS;
    const attempt = (job?.attempt ?? 0) + 1;
    await this.env.DB.prepare(
      `INSERT INTO art_jobs (seed, status, lease_id, lease_expires_at, attempt, object_key, updated_at, started_at)
       VALUES (?, 'generating', ?, ?, ?, ?, ?, ?)
       ON CONFLICT(seed) DO UPDATE SET status = 'generating', lease_id = excluded.lease_id,
         lease_expires_at = excluded.lease_expires_at, attempt = excluded.attempt,
         object_key = excluded.object_key, updated_at = excluded.updated_at, started_at = excluded.started_at,
         error_code = NULL`,
    )
      .bind(seed, leaseId, leaseExpiresAt, attempt, artKey(seed), now, now)
      .run();
    await this.recordEvent(seed, "claimed", attempt);
    const event: ArtEvent = { type: "art.updated", status: "generating", leaseExpiresAt };
    this.broadcast(seed, event);
    return json({ status: "owner", leaseId, leaseExpiresAt });
  }

  private async complete(request: Request, seed: string) {
    const body = (await request.json()) as { leaseId?: unknown; dataUrl?: unknown };
    const image = typeof body.dataUrl === "string" ? decodeDataUrl(body.dataUrl) : null;
    if (typeof body.leaseId !== "string" || !image || image.bytes.byteLength > MAX_IMAGE_BYTES) {
      return json({ error: "Expected leaseId and an image data URL up to 8 MB" }, { status: 400 });
    }
    const job = await this.getJob(seed);
    if (
      !job ||
      job.status !== "generating" ||
      job.lease_id !== body.leaseId ||
      (job.lease_expires_at ?? 0) <= Date.now()
    ) {
      return json({ error: "This image lease is no longer valid" }, { status: 409 });
    }

    const objectKey = job.object_key ?? artKey(seed);
    try {
      await putTigris(this.env, objectKey, image);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Tigris upload failed" }, { status: 503 });
    }

    const now = Date.now();
    await this.env.DB.prepare(
      "UPDATE art_jobs SET status = 'ready', lease_id = NULL, lease_expires_at = NULL, content_type = ?, completed_at = ?, updated_at = ?, error_code = NULL WHERE seed = ?",
    )
      .bind(image.contentType, now, now, seed)
      .run();
    await this.recordEvent(seed, "ready", job.attempt);
    const url = publicArtUrl(request, seed);
    this.broadcast(seed, { type: "art.updated", status: "ready", url });
    return json({ url });
  }

  private async fail(request: Request, seed: string) {
    const body = (await request.json()) as { leaseId?: unknown };
    if (typeof body.leaseId !== "string") return json({ error: "leaseId is required" }, { status: 400 });
    const job = await this.getJob(seed);
    if (job?.status !== "generating" || job.lease_id !== body.leaseId) {
      return json({ error: "This image lease is no longer valid" }, { status: 409 });
    }
    const now = Date.now();
    await this.env.DB.prepare(
      "UPDATE art_jobs SET status = 'failed', lease_id = NULL, lease_expires_at = NULL, updated_at = ?, error_code = 'generation_failed' WHERE seed = ?",
    )
      .bind(now, seed)
      .run();
    await this.recordEvent(seed, "failed", job.attempt);
    this.broadcast(seed, { type: "art.updated", status: "failed", retryAfterMs: FAILED_RETRY_MS });
    return json({ ok: true });
  }

  private async getJob(seed: string) {
    return this.env.DB.prepare(
      "SELECT seed, status, lease_id, lease_expires_at, attempt, object_key, content_type, updated_at FROM art_jobs WHERE seed = ?",
    )
      .bind(seed)
      .first<ArtJob>();
  }

  private async recordEvent(seed: string, eventType: string, attempt: number) {
    await this.env.DB.prepare(
      "INSERT INTO art_events (seed, event_type, attempt, created_at) VALUES (?, ?, ?, ?)",
    )
      .bind(seed, eventType, attempt, Date.now())
      .run();
  }

  private async openLiveConnection(request: Request, seed: string) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const sockets = this.sockets.get(seed) ?? new Set<WebSocket>();
    sockets.add(server);
    this.sockets.set(seed, sockets);
    const remove = () => {
      sockets.delete(server);
      if (sockets.size === 0) this.sockets.delete(seed);
    };
    server.addEventListener("close", remove);
    server.addEventListener("error", remove);

    const job = await this.getJob(seed);
    if (job?.status === "ready") server.send(JSON.stringify({ type: "art.updated", status: "ready", url: publicArtUrl(request, seed) }));
    if (job?.status === "generating" && job.lease_expires_at) {
      server.send(JSON.stringify({ type: "art.updated", status: "generating", leaseExpiresAt: job.lease_expires_at }));
    }
    if (job?.status === "failed") server.send(JSON.stringify({ type: "art.updated", status: "failed", retryAfterMs: FAILED_RETRY_MS }));
    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(seed: string, event: ArtEvent) {
    const payload = JSON.stringify(event);
    for (const socket of this.sockets.get(seed) ?? []) {
      try {
        socket.send(payload);
      } catch {
        this.sockets.get(seed)?.delete(socket);
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), request);
    if (url.pathname === "/health") return cors(json({ ok: true }), request);

    const coordinatorMatch = /^\/v1\/art\/([^/]+)\/(claim|complete|fail|live)$/.exec(url.pathname);
    if (coordinatorMatch) {
      if (url.pathname.endsWith("/live") && request.headers.get("Origin") && !allowedOrigin(request)) {
        return new Response("Origin not allowed", { status: 403 });
      }
      const coordinator = env.ART_COORDINATOR.get(env.ART_COORDINATOR.idFromName(COORDINATOR_NAME), {
        locationHint: "apac-se",
      });
      const response = await coordinator.fetch(request);
      return url.pathname.endsWith("/live") ? response : cors(response, request);
    }

    const artMatch = /^\/v1\/art\/([^/]+)$/.exec(url.pathname);
    if (!artMatch) return cors(new Response("Not found", { status: 404 }), request);
    const seed = decodeURIComponent(artMatch[1]);
    if (!isValidSeed(seed)) return cors(json({ error: "Invalid art seed" }, { status: 400 }), request);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return cors(new Response("Method not allowed", { status: 405 }), request);
    }

    const job = await env.DB.prepare(
      "SELECT status, object_key, content_type FROM art_jobs WHERE seed = ?",
    )
      .bind(seed)
      .first<Pick<ArtJob, "status" | "object_key" | "content_type">>();
    if (job?.status !== "ready" || !job.object_key) {
      return cors(new Response("Not found", { status: 404 }), request);
    }
    if (request.method === "HEAD") return cors(new Response(null, { status: 200 }), request);

    try {
      const object = await getTigris(env, job.object_key);
      if (!object.ok || !object.body) return cors(new Response("Image temporarily unavailable", { status: 502 }), request);
      return cors(
        new Response(object.body, {
          headers: {
            "Content-Type": job.content_type ?? object.headers.get("Content-Type") ?? "image/png",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        }),
        request,
      );
    } catch (error) {
      return cors(json({ error: error instanceof Error ? error.message : "Image fetch failed" }, { status: 503 }), request);
    }
  },
} satisfies ExportedHandler<Env>;
