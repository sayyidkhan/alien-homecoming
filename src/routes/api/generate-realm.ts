import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/generate-realm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt, model = "openai/gpt-image-2" } = (await request.json()) as {
          prompt: string;
          model?: "openai/gpt-image-2" | "google/gemini-3.1-flash-lite-image";
        };
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const body =
          model === "google/gemini-3.1-flash-lite-image"
            ? {
                model,
                contents: [
                  { role: "user", parts: [{ text: prompt }] },
                ],
                generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
                stream: true,
              }
            : {
                model: "openai/gpt-image-2",
                prompt,
                size: "1024x1024",
                quality: "low",
                stream: true,
                partial_images: 3,
              };

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),

        });
        if (!upstream.ok || !upstream.body) {
          return new Response(await upstream.text(), { status: upstream.status });
        }
        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
