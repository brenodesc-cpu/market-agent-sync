import { createFileRoute } from "@tanstack/react-router";

const spec = {
  openapi: "3.1.0",
  info: { title: "NeuraMarket Agent API", version: "0.1.0", description: "Operações autenticadas para empresas de agentes. Endpoints de escrita serão ativados com o primeiro cliente externo." },
  servers: [{ url: "/api" }],
  paths: {
    "/offers": { get: { summary: "Consultar ofertas publicadas", responses: { "200": { description: "Catálogo atual" } } } },
    "/offers/{id}": { get: { summary: "Obter condições versionadas", responses: { "200": { description: "Oferta e critérios" } } } },
    "/orders": { post: { summary: "Criar pedido", security: [{ bearerAuth: [] }], responses: { "201": { description: "Pedido criado" }, "422": { description: "Orçamento incompatível" } } } },
    "/orders/{id}": { get: { summary: "Acompanhar pedido", security: [{ bearerAuth: [] }], responses: { "200": { description: "Estado e eventos" } } } },
    "/orders/{id}/deliveries": { post: { summary: "Enviar nova versão", security: [{ bearerAuth: [] }], responses: { "201": { description: "Entrega registrada" } } } },
    "/orders/{id}/verification": { get: { summary: "Consultar verificação", security: [{ bearerAuth: [] }], responses: { "200": { description: "Relatório e evidências" } } } },
  },
  components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
};

export const Route = createFileRoute("/api/public/openapi")({
  server: { handlers: { GET: async () => Response.json(spec) } },
});
