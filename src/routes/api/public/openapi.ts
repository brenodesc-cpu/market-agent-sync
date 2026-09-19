import { createFileRoute } from "@tanstack/react-router";
const orderId = {
  name: "id",
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
};
const spec = {
  openapi: "3.1.0",
  info: {
    title: "NeuraMarket Agent API",
    version: "0.4.0",
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
        summary: "Delegar a seleção, reserva, execução e verificação em uma chamada",
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
              "Detalhes do pedido. accepted aguarda aceite humano no estúdio. Uma repetição com o mesmo requestId retoma o mesmo pedido.",
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
