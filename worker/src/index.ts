import { DurableObject } from "cloudflare:workers";

interface Env {
  ART: R2Bucket;
  WORLD: DurableObjectNamespace<SharedWorld>;
}

type SharedWorldRecord = {
  state: unknown;
  revision: number;
  updatedAt: number;
};

const WORLD_KEY = "world";
const WORLD_NAME = "global";

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
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, PUT, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function artKey(seed: string) {
  return `realms/${encodeURIComponent(seed)}.png`;
}

function artPath(seed: string) {
  return `/v1/art/${encodeURIComponent(seed)}`;
}

function decodeDataUrl(dataUrl: string) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) return null;
  const bytes = Uint8Array.from(atob(match[2].replace(/\s/g, "")), (char) => char.charCodeAt(0));
  return { contentType: match[1], bytes };
}

export class SharedWorld extends DurableObject<Env> {
  private sockets = new Set<WebSocket>();

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === "/v1/world/live") return this.openLiveConnection(request);
    if (url.pathname !== "/v1/world") return new Response("Not found", { status: 404 });

    if (request.method === "GET") {
      const record = await this.ctx.storage.get<SharedWorldRecord>(WORLD_KEY);
      return record
        ? json(record)
        : json({ error: "World has not been initialised" }, { status: 404 });
    }

    if (request.method !== "PUT") return new Response("Method not allowed", { status: 405 });

    const body = (await request.json()) as { state?: unknown; expectedRevision?: number | null };
    if (
      !body.state ||
      (!Number.isInteger(body.expectedRevision) && body.expectedRevision !== null)
    ) {
      return json({ error: "state and expectedRevision are required" }, { status: 400 });
    }

    const current = await this.ctx.storage.get<SharedWorldRecord>(WORLD_KEY);
    if (current && body.expectedRevision !== current.revision) {
      return json({ error: "World changed", ...current }, { status: 409 });
    }

    const next: SharedWorldRecord = {
      state: body.state,
      revision: (current?.revision ?? 0) + 1,
      updatedAt: Date.now(),
    };
    await this.ctx.storage.put(WORLD_KEY, next);
    this.broadcast({ type: "world.updated", ...next });
    return json(next);
  }

  private async openLiveConnection(request: Request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sockets.add(server);
    server.addEventListener("close", () => this.sockets.delete(server));
    server.addEventListener("error", () => this.sockets.delete(server));

    const current = await this.ctx.storage.get<SharedWorldRecord>(WORLD_KEY);
    if (current) server.send(JSON.stringify({ type: "world.updated", ...current }));
    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(message: unknown) {
    const payload = JSON.stringify(message);
    for (const socket of this.sockets) {
      try {
        socket.send(payload);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }), request);
    }

    if (url.pathname === "/health") return cors(json({ ok: true }), request);

    if (url.pathname === "/v1/world" || url.pathname === "/v1/world/live") {
      if (
        url.pathname.endsWith("/live") &&
        request.headers.get("Origin") &&
        !allowedOrigin(request)
      ) {
        return new Response("Origin not allowed", { status: 403 });
      }
      const id = env.WORLD.idFromName(WORLD_NAME);
      const world = env.WORLD.get(id, { locationHint: "apac-se" });
      const response = await world.fetch(request);
      return url.pathname.endsWith("/live") ? response : cors(response, request);
    }

    const artMatch = /^\/v1\/art\/([^/]+)$/.exec(url.pathname);
    if (!artMatch) return cors(new Response("Not found", { status: 404 }), request);

    const seed = decodeURIComponent(artMatch[1]);
    const key = artKey(seed);
    const publicUrl = new URL(artPath(seed), url.origin).toString();

    if (request.method === "HEAD") {
      const object = await env.ART.head(key);
      return cors(new Response(null, { status: object ? 200 : 404 }), request);
    }

    if (request.method === "GET") {
      const object = await env.ART.get(key);
      if (!object) return cors(new Response("Not found", { status: 404 }), request);
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("ETag", object.httpEtag);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      return cors(new Response(object.body, { headers }), request);
    }

    if (request.method !== "PUT")
      return cors(new Response("Method not allowed", { status: 405 }), request);

    const existing = await env.ART.head(key);
    if (existing) return cors(json({ url: publicUrl, alreadyExisted: true }), request);

    const body = (await request.json()) as { dataUrl?: string };
    const image = typeof body.dataUrl === "string" ? decodeDataUrl(body.dataUrl) : null;
    if (!image || image.bytes.byteLength > 8 * 1024 * 1024) {
      return cors(
        json({ error: "Expected an image data URL up to 8 MB" }, { status: 400 }),
        request,
      );
    }

    await env.ART.put(key, image.bytes, {
      httpMetadata: {
        contentType: image.contentType,
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
    return cors(json({ url: publicUrl, alreadyExisted: false }), request);
  },
} satisfies ExportedHandler<Env>;
