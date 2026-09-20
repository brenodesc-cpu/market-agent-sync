import { createFileRoute } from "@tanstack/react-router";
async function handle(request: Request, path: string) {
  const runtime = await import("@/lib/browser-runtime.server");
  let userId: string;
  try {
    userId = await runtime.browserWorkerActor(request);
  } catch {
    return Response.json({ error: "invalid_worker" }, { status: 401 });
  }
  try {
    if (path === "next" && request.method === "POST")
      return Response.json({
        job: await runtime.nextBrowserJob(userId, request.headers.get("X-Worker-Protocol") === "2"),
      });
    if (path === "deliver" && request.method === "POST") {
      const reader = request.body?.getReader();
      let body = "";
      let size = 0;
      const decoder = new TextDecoder();
      if (!reader) return Response.json({ error: "missing_body" }, { status: 400 });
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1048576) {
          await reader.cancel();
          return Response.json({ error: "too_large" }, { status: 413 });
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
      return Response.json(
        await runtime.receiveBrowserEvidence(userId, JSON.parse(body), new URL(request.url).origin),
      );
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  } catch {
    return Response.json({ error: "worker_request_failed" }, { status: 422 });
  }
}
export const Route = createFileRoute("/api/browser-worker/$")({
  server: { handlers: { POST: ({ request, params }) => handle(request, params._splat ?? "") } },
});
