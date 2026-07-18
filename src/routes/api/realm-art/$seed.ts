import { createFileRoute } from "@tanstack/react-router";

const BUCKET = "realm-art";

function storagePathForSeed(seed: string) {
  // Keep it flat; seeds are opaque strings from mulberry32.
  const safe = seed.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safe}.png`;
}

export const Route = createFileRoute("/api/realm-art/$seed")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const seed = params.seed;
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const { data: row } = await supabaseAdmin
          .from("realm_art")
          .select("storage_path")
          .eq("seed", seed)
          .maybeSingle();

        if (!row) {
          return new Response(JSON.stringify({ needsPaint: true }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        const { data: blob, error } = await supabaseAdmin.storage
          .from(BUCKET)
          .download(row.storage_path);

        if (error || !blob) {
          return new Response(JSON.stringify({ needsPaint: true }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(blob, {
          headers: {
            "content-type": "image/png",
            // Seeds are content-addressed; the image never changes.
            "cache-control": "public, max-age=31536000, immutable",
          },
        });
      },

      POST: async ({ request, params }) => {
        const seed = params.seed;
        const body = (await request.json()) as {
          dataUrl?: string;
          title?: string;
          family?: string;
        };
        if (!body.dataUrl || !body.dataUrl.startsWith("data:image/")) {
          return new Response("Invalid dataUrl", { status: 400 });
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // Skip if already stored — first-visitor writes win.
        const { data: existing } = await supabaseAdmin
          .from("realm_art")
          .select("public_url")
          .eq("seed", seed)
          .maybeSingle();
        if (existing) {
          return Response.json({ ok: true, cached: true });
        }

        const base64 = body.dataUrl.split(",")[1] ?? "";
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const storagePath = storagePathForSeed(seed);

        const { error: uploadError } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(storagePath, bytes, {
            contentType: "image/png",
            upsert: true,
          });
        if (uploadError) {
          return new Response(`Upload failed: ${uploadError.message}`, {
            status: 500,
          });
        }

        // The bucket is private; we serve bytes through this same route.
        const publicUrl = `/api/realm-art/${encodeURIComponent(seed)}`;

        const { error: insertError } = await supabaseAdmin
          .from("realm_art")
          .upsert(
            {
              seed,
              title: body.title ?? null,
              family: body.family ?? null,
              storage_path: storagePath,
              public_url: publicUrl,
            },
            { onConflict: "seed" },
          );
        if (insertError) {
          return new Response(`Insert failed: ${insertError.message}`, {
            status: 500,
          });
        }

        return Response.json({ ok: true, url: publicUrl });
      },
    },
  },
});
