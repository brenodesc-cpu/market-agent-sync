import { z } from "zod";

export const CAPABILITY = "catalog.normalize.v1";
export const companyDraftSchema = z.object({
  name: z.string().trim().min(2).max(70),
  description: z.string().trim().min(10).max(1000),
  serviceTitle: z.string().trim().min(4).max(100),
  price: z.number().int().min(1).max(1000),
  capability: z.literal(CAPABILITY),
  visibility: z.enum(["private", "commercial"]).default("private"),
});
export type CompanyDraft = z.infer<typeof companyDraftSchema>;
export const catalogueRowSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine(
        (value) => !/^[=+@-]/.test(value),
        "O SKU não pode começar com um comando de planilha.",
      ),
    size: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .refine(
        (value) => !/^[=+@-]/.test(value),
        "O tamanho não pode começar com um comando de planilha.",
      ),
    priceCents: z.number().int().min(0).max(1_000_000_000),
  })
  .strict();
export type CatalogueRow = z.infer<typeof catalogueRowSchema>;
export const catalogueRowsSchema = z.array(catalogueRowSchema).min(1).max(500);
export const orderRequestSchema = z
  .object({
    buyerCompanyId: z.string().uuid(),
    title: z.string().trim().min(3).max(120),
    budget: z.number().int().min(1).max(10000),
    rows: catalogueRowsSchema.optional(),
    task: z.string().trim().min(10).max(12000).optional(),
    offerVersionId: z.string().uuid().optional(),
    testFailure: z.boolean().default(false),
    autoCorrect: z.boolean().default(true),
    humanReview: z.boolean().default(true),
    requestId: z.string().uuid(),
  })
  .refine(
    (v) => Boolean(v.rows) !== Boolean(v.task),
    "Informe uma tarefa ou os dados do catálogo.",
  );
export type OrderRequest = z.infer<typeof orderRequestSchema>;
export const CATALOGUE_CRITERIA = [
  { criterion: "Formato CSV", expected: "sku,size,priceCents" },
  { criterion: "Produtos preservados", expected: true },
  { criterion: "Preços preservados", expected: true },
  { criterion: "Identificadores únicos", expected: true },
];
export const SAMPLE_ROWS: CatalogueRow[] = [
  { sku: "CAMISETA-01", size: "M", priceCents: 9900 },
  { sku: "CAMISETA-01", size: "G", priceCents: 9900 },
  { sku: "CALCA-02", size: "42", priceCents: 18990 },
];
export const STARTER_DRAFT: CompanyDraft = {
  name: "Minha empresa",
  description: "Uma empresa de agentes que prepara catálogos para lojas online.",
  serviceTitle: "Catálogo pronto para importar",
  price: 15,
  capability: CAPABILITY,
  visibility: "private",
};
export type AgentOffer = {
  id: string;
  offerId: string;
  companyId: string;
  companyName: string;
  title: string;
  description: string;
  price: number;
  deadlineHours: number;
  capability: string;
  category?: string;
  exampleTask?: string;
  criteria: typeof CATALOGUE_CRITERIA;
};
export type Check = {
  criterion: string;
  expected: string | boolean;
  observed: string | boolean;
  status: "passed" | "failed";
  evidence: string;
};

export function selectAffordableOffer(
  offers: AgentOffer[],
  buyerId: string,
  budget: number,
  selectedId?: string,
) {
  const candidates = offers.filter(
    (offer) =>
      offer.companyId !== buyerId && offer.capability === CAPABILITY && offer.price <= budget,
  );
  const selected = selectedId
    ? candidates.find((offer) => offer.id === selectedId)
    : candidates.sort(
        (a, b) =>
          a.price - b.price || a.deadlineHours - b.deadlineHours || a.id.localeCompare(b.id),
      )[0];
  if (!selected) throw new Error("Nenhum fornecedor disponível atende ao orçamento.");
  return selected;
}

export function parseCatalogueCsv(text: string): CatalogueRow[] {
  if (text.length > 128000) throw new Error("Use um arquivo de até 128 KB e 500 produtos.");
  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let afterQuote = false;
  const endCell = () => {
    row.push(cell);
    cell = "";
    afterQuote = false;
  };
  const endRow = () => {
    endCell();
    if (row.some((value) => value.length > 0)) table.push(row);
    row = [];
  };
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        afterQuote = true;
      } else cell += char;
    } else if (char === ",") endCell();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      endRow();
    } else if (char === '"' && !cell && !afterQuote) quoted = true;
    else {
      if (afterQuote || char === '"') throw new Error("O CSV contém aspas inválidas.");
      cell += char;
    }
  }
  if (quoted) throw new Error("O CSV contém um campo sem fechamento de aspas.");
  if (cell || row.length || afterQuote) endRow();
  const headers = table.shift()?.map((value) => value.trim());
  if (headers?.join(",") !== "sku,size,priceCents")
    throw new Error("O cabeçalho deve ser sku,size,priceCents. O preço é informado em centavos.");
  return catalogueRowsSchema.parse(
    table.map((values) => {
      if (values.length !== 3 || !/^\d+$/.test(values[2]!))
        throw new Error("Cada linha precisa ter SKU, tamanho e preço inteiro em centavos.");
      return { sku: values[0], size: values[1], priceCents: Number(values[2]) };
    }),
  );
}

export function createCatalogueCsv(rows: CatalogueRow[], injectFailure = false) {
  const normalized = catalogueRowsSchema
    .parse(rows)
    .map((row) => ({ ...row }))
    .sort((a, b) => `${a.sku}:${a.size}`.localeCompare(`${b.sku}:${b.size}`));
  if (injectFailure) normalized[0]!.priceCents += 1;
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  return (
    "sku,size,priceCents\r\n" +
    normalized
      .map((row) => [row.sku, row.size, row.priceCents].map(escape).join(","))
      .join("\r\n") +
    "\r\n"
  );
}

export function verifyCatalogue(
  source: CatalogueRow[],
  artifact: string,
): { checks: Check[]; decision: "approved" | "rejected"; summary: string } {
  const expected = catalogueRowsSchema.parse(source);
  let actual: CatalogueRow[] = [];
  let readable = true;
  try {
    actual = parseCatalogueCsv(artifact);
  } catch {
    readable = false;
  }
  const keys = (rows: CatalogueRow[]) =>
    rows.map((row) => JSON.stringify([row.sku, row.size])).sort();
  const prices = (rows: CatalogueRow[]) =>
    rows.map((row) => JSON.stringify([row.sku, row.size, row.priceCents])).sort();
  const unique = (rows: CatalogueRow[]) => new Set(keys(rows)).size === rows.length;
  const results = [
    readable,
    readable && JSON.stringify(keys(actual)) === JSON.stringify(keys(expected)),
    readable && JSON.stringify(prices(actual)) === JSON.stringify(prices(expected)),
    readable && unique(expected) && unique(actual),
  ];
  const changed = expected.find((row) => {
    const found = actual.find((item) => item.sku === row.sku && item.size === row.size);
    return found && found.priceCents !== row.priceCents;
  });
  const observedPrice =
    changed &&
    actual.find((item) => item.sku === changed.sku && item.size === changed.size)?.priceCents;
  const messages = [
    readable
      ? "O arquivo foi lido com as três colunas contratadas."
      : "O arquivo não segue o formato contratado.",
    `${actual.length} produtos na entrega; ${expected.length} produtos na origem.`,
    results[2]
      ? "Todos os preços coincidem com a origem."
      : changed
        ? `${changed.sku}, tamanho ${changed.size}: esperado ${changed.priceCents} centavos; recebido ${observedPrice} centavos.`
        : "Há um produto ausente, duplicado ou com identificador modificado.",
    results[3]
      ? "Cada combinação de SKU e tamanho aparece uma vez."
      : "Existem identificadores duplicados ou o arquivo é inválido.",
  ];
  const checks: Check[] = CATALOGUE_CRITERIA.map((criterion, i) => ({
    ...criterion,
    status: results[i] ? "passed" : "failed",
    observed:
      i === 0 ? (readable ? "sku,size,priceCents" : "Arquivo inválido") : Boolean(results[i]),
    evidence: messages[i]!,
  }));
  const approved = results.every(Boolean);
  return {
    checks,
    decision: approved ? "approved" : "rejected",
    summary: approved
      ? "Catálogo aprovado: produtos e preços preservados."
      : "A entrega foi reprovada. O valor permanece reservado.",
  };
}
