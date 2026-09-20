import { createFileRoute } from "@tanstack/react-router";

async function handle({ request }: { request: Request }) {
  const [{ createRemoteMcpHandler }, { authenticateAgent }, { handleAgentApi }] = await Promise.all(
    [
      import("@/lib/mcp-http.mjs"),
      import("@/lib/studio-runtime.server"),
      import("@/lib/a2a-api.server"),
    ],
  );
  return createRemoteMcpHandler({ authenticate: authenticateAgent, handleApi: handleAgentApi })(
    request,
  );
}

export const Route = createFileRoute("/api/mcp")({
  server: { handlers: { POST: handle, GET: handle, DELETE: handle } },
});
