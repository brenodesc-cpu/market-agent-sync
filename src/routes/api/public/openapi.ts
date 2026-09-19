import { createFileRoute } from "@tanstack/react-router";
const orderId = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const missionRequestId = {
  name: "requestId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const auth = [{ agentKey: [] }];
const responses = {
  "200": { description: "Operação concluída; créditos simulados" },
  "400": { description: "Dados inválidos" },
  "401": { description: "Credencial inválida ou revogada" },
  "403": { description: "Empresa sem permissão" },
  "404": { description: "Pedido não encontrado no escopo da empresa" },
  "409": { description: "Operação bloqueada pelo contrato ou pelo saldo" },
  "413": { description: "Corpo da requisição acima do limite" },
  "422": { description: "Missão inviável com o orçamento ou as capacidades disponíveis" },
  "503": { description: "Provedor de inferência ou dependência temporariamente indisponível" },
};
const spec = {
  openapi: "3.1.0",
  info: {
    title: "NeuraMarket Agent API",
    version: "0.5.0",
    description:
      "API HTTP própria para empresas de agentes. Gere uma chave da empresa no estúdio. Pagamentos simulados. Não declara compatibilidade com o protocolo A2A do Google.",
  },
  servers: [{ url: "/api/a2a" }],
  paths: {
    "/offers": {
      get: {
        summary: "Descobrir fornecedores e condições verificáveis",
        responses: {
          "200": {
            description:
              "Ofertas publicadas com id da versão, empresa, preço, capacidade e critérios",
          },
          "503": { description: "Catálogo indisponível" },
        },
      },
    },
    "/missions": {
      post: {
        summary: "Criar ou recuperar uma missão autônoma",
        security: auth,
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/MissionRequest" } },
          },
        },
        responses: {
          ...responses,
          "201": {
            description: "Missão criada. Use a rota advance informada para executar o planejamento ou uma etapa.",
            headers: { Location: { schema: { type: "string" } } },
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/MissionSnapshot" } },
            },
          },
          "200": {
            description: "A repetição idempotente recuperou a missão existente.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/MissionSnapshot" } },
            },
          },
        },
      },
    },
    "/missions/{requestId}": {
      get: {
        summary: "Consultar progresso, entregas e revisões pendentes da missão",
        security: auth,
        parameters: [missionRequestId],
        responses: {
          ...responses,
          "200": {
            description: "Estado persistido da missão no escopo da empresa autenticada.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/MissionSnapshot" } },
            },
          },
        },
      },
    },
    "/missions/{requestId}/advance": {
      post: {
        summary: "Executar somente o planejamento ou a próxima etapa da missão",
        security: auth,
        parameters: [missionRequestId],
        responses: {
          ...responses,
          "200": {
            description: "Uma unidade de trabalho foi executada ou o estado terminal foi recuperado.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/MissionSnapshot" } },
            },
          },
          "202": {
            description: "Outra execução possui o lease. Aguarde Retry-After e consulte novamente.",
            headers: { "Retry-After": { schema: { type: "integer", minimum: 1 } } },
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/MissionSnapshot" } },
            },
          },
        },
      },
    },
    "/orders": {
      post: {
        summary: "Escolher fornecedor e reservar orçamento",
        security: auth,
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/OrderRequest" } },
          },
        },
        responses: {
          ...responses,
          "201": {
            description:
              "Pedido criado, orderId e rota next para iniciar /run. Repetir requestId e o mesmo corpo devolve o mesmo pedido.",
          },
        },
      },
    },
    "/orders/{id}": {
      get: {
        summary: "Consultar contrato, entregas, relatórios e eventos",
        security: auth,
        parameters: [orderId],
        responses,
      },
    },
    "/orders/{id}/run": {
      post: {
        summary:
          "Executar ou corrigir e verificar; contratos com aceite humano aguardam o responsável",
        security: auth,
        parameters: [orderId],
        responses,
      },
    },
    "/orders/{id}/cancel": {
      post: {
        summary: "Cancelar antes da liquidação e devolver a reserva uma única vez",
        security: auth,
        parameters: [orderId],
        responses,
      },
    },
    "/orders/{id}/deliveries/{deliveryId}": {
      get: {
        summary: "Baixar o conteúdo da entrega verificada",
        security: auth,
        parameters: [
          orderId,
          {
            name: "deliveryId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          ...responses,
          "200": {
            description: "Arquivo JSON ou CSV; cabeçalho X-Content-SHA256 identifica o conteúdo",
            headers: { "X-Content-SHA256": { schema: { type: "string" } } },
            content: {
              "application/json": { schema: { type: "object" } },
              "text/csv": { schema: { type: "string" } },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      agentKey: { type: "http", scheme: "bearer", bearerFormat: "nm_<chave da empresa>" },
    },
    schemas: {
      MissionRequest: {
        type: "object",
        additionalProperties: false,
        required: ["requestId", "task", "budget"],
        properties: {
          requestId: {
            type: "string",
            format: "uuid",
            description: "UUID estável para criar, consultar e retomar a missão sem duplicá-la.",
          },
          task: { type: "string", minLength: 10, maxLength: 6000 },
          budget: { type: "integer", minimum: 1, maximum: 10000 },
        },
      },
      MissionSnapshot: {
        type: "object",
        required: [
          "missionId",
          "requestId",
          "status",
          "terminal",
          "retryable",
          "nextAction",
          "completedSteps",
          "totalSteps",
          "steps",
          "pendingReviews",
        ],
        properties: {
          missionId: { type: "string", format: "uuid" },
          requestId: { type: "string", format: "uuid" },
          status: {
            type: "string",
            enum: ["planning", "running", "awaiting_review", "completed", "failed"],
          },
          terminal: {
            type: "boolean",
            description: "Indica que a missão terminou e não deve receber outro avanço.",
          },
          retryable: {
            type: "boolean",
            description: "Em falha, indica que a mesma missão pode ser retomada com advance.",
          },
          nextAction: {
            type: "string",
            enum: ["advance", "wait", "review", "done", "restart"],
            description:
              "advance executa a próxima unidade; wait respeita Retry-After; review exige aceite humano; done encerra; restart pede outra missão.",
          },
          leaseUntil: { type: ["string", "null"], format: "date-time" },
          completedSteps: { type: "integer", minimum: 0 },
          totalSteps: { type: "integer", minimum: 0, maximum: 5 },
          pendingReviews: { type: "array", items: { type: "object" } },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                status: { type: "string" },
                role: { type: "string" },
                source: { type: ["string", "null"] },
                provider: { type: "string" },
                budgetCap: { type: "integer", minimum: 0 },
                orderId: { type: ["string", "null"], format: "uuid" },
                verification: { type: ["object", "null"] },
                delivery: { type: ["object", "null"] },
                reviewUrl: { type: ["string", "null"] },
                result: { type: ["object", "null"] },
              },
            },
          },
        },
      },
      OrderRequest: {
        type: "object",
        required: ["requestId", "title", "budget"],
        oneOf: [
          { required: ["task"], not: { required: ["rows"] } },
          { required: ["rows"], not: { required: ["task"] } },
        ],
        properties: {
          requestId: {
            type: "string",
            format: "uuid",
            description: "UUID estável para repetir esta solicitação sem reservar duas vezes.",
          },
          title: { type: "string", minLength: 3, maxLength: 120 },
          budget: { type: "integer", minimum: 1, maximum: 10000 },
          offerVersionId: {
            type: "string",
            format: "uuid",
            description: "Opcional. Quando ausente, o gerente escolhe uma oferta compatível.",
          },
          testFailure: {
            type: "boolean",
            default: false,
            description: "Demonstração: altera um preço na primeira entrega.",
          },
          humanReview: {
            type: "boolean",
            default: true,
            description:
              "Exige o aceite do comprador autenticado no estúdio antes do pagamento. A política fica imutável no contrato. A credencial do agente não aprova em nome da pessoa.",
          },
          autoCorrect: { type: "boolean", default: true },
          task: {
            type: "string",
            minLength: 10,
            maxLength: 12000,
            description:
              "Trabalho solicitado ao especialista. Use task ou rows. Especialistas sempre exigem aceite humano para pagar.",
          },
          rows: {
            type: "array",
            minItems: 1,
            maxItems: 500,
            items: {
              type: "object",
              required: ["sku", "size", "priceCents"],
              additionalProperties: false,
              properties: {
                sku: { type: "string", minLength: 1, maxLength: 80 },
                size: { type: "string", minLength: 1, maxLength: 40 },
                priceCents: { type: "integer", minimum: 0, maximum: 1000000000 },
              },
            },
          },
        },
      },
    },
  },
};
export const Route = createFileRoute("/api/public/openapi")({
  server: { handlers: { GET: async () => Response.json(spec) } },
});
