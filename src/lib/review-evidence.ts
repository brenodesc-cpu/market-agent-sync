/** A read-only explanation of persisted evidence, never a payment authorization. */
export type EvidenceJson =
  null | boolean | number | string | EvidenceJson[] | { [key: string]: EvidenceJson };

export type ReviewStatus = "approved" | "rejected" | "inconclusive";
export type CheckStatus = "passed" | "failed" | "inconclusive";

export interface ReviewOrder {
  id: string;
  status: string;
  current_delivery_version: number;
}

export interface ReviewDelivery {
  id: string;
  order_id: string;
  version: number;
  sha256: string | null;
  file_name: string;
  test_upload: boolean;
}

export interface ReviewReport {
  id: string;
  order_id: string;
  delivery_id: string;
  delivery_version: number;
  rules_version: string;
  tool_name: string;
  decision: string;
  summary: string;
  checks: unknown;
}

export interface ReviewContract {
  id: string;
  order_id: string;
  acceptance_criteria: unknown;
  price_units: number;
}

export interface ReviewEvidenceInput {
  order: ReviewOrder | null;
  delivery: ReviewDelivery | null;
  report: ReviewReport | null;
  contract: ReviewContract | null;
}

export interface ReviewCriterion {
  criterion: string;
  expected: Exclude<EvidenceJson, null>;
}

export interface ReviewCheck extends ReviewCriterion {
  observed: EvidenceJson;
  status: CheckStatus;
  evidence?: string;
}

export interface ReviewEvidence {
  schema_version: "review-evidence-v1";
  status: ReviewStatus;
  summary: string;
  issues: string[];
  order: ReviewOrder | null;
  contract:
    | (Omit<ReviewContract, "acceptance_criteria"> & {
        acceptance_criteria: ReviewCriterion[];
      })
    | null;
  delivery: ReviewDelivery | null;
  report: Omit<ReviewReport, "checks"> | null;
  checks: ReviewCheck[];
  can_authorize_payment: false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJson(value: unknown): value is EvidenceJson {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  return isRecord(value) && Object.values(value).every(isJson);
}

function canonicalJson(value: EvidenceJson): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as EvidenceJson)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function readCriterion(value: unknown): ReviewCriterion | null {
  if (!isRecord(value) || typeof value["criterion"] !== "string" || !value["criterion"].trim())
    return null;
  if (value["expected"] === null || !isJson(value["expected"])) return null;
  return { criterion: value["criterion"], expected: value["expected"] };
}

// The published demo predates the explicit-status format. Keep its translation
// closed and read-only; this does not change the settlement contract in SQL.
const legacyCriteria = new Map([
  ["container", "Contêiner"],
  ["aspect", "Proporção"],
  ["resolution", "Resolução"],
  ["duration", "Duração"],
  ["decode", "Decodificação"],
]);

function readContractCriterion(value: unknown, legacy: boolean): ReviewCriterion | null {
  if (!legacy) return readCriterion(value);
  if (!isRecord(value) || typeof value["key"] !== "string") return null;
  const criterion = legacyCriteria.get(value["key"]);
  if (!criterion || ("criterion" in value && value["criterion"] !== criterion)) return null;
  return readCriterion({ criterion, expected: value["expected"] });
}

function readCheckStatus(value: Record<string, unknown>, legacy: boolean): CheckStatus | null {
  const status = value["status"];
  const explicit =
    status === "passed" || status === "failed" || status === "inconclusive" ? status : null;
  const result = value["result"];
  const translated = result === "pass" ? "passed" : result === "fail" ? "failed" : null;
  if ("status" in value && !explicit) return null;
  if ("result" in value && (!translated || (explicit && translated !== explicit))) return null;
  // Legacy result alone is accepted only with the known legacy contract shape.
  return explicit ?? (legacy ? translated : null);
}

/**
 * Validates the linkage and the explicit checks already stored by the verifier.
 * It does not execute the verifier or certify the truth of the stored observations.
 * Free text, including report.summary, remains untrusted data for any LLM caller.
 */
export function buildReviewEvidence(input: ReviewEvidenceInput): ReviewEvidence {
  const { order, delivery, report, contract } = input;
  const issues: string[] = [];
  const criteria: ReviewCriterion[] = [];
  const checks: ReviewCheck[] = [];
  const legacy =
    Array.isArray(contract?.acceptance_criteria) &&
    contract.acceptance_criteria.some((criterion) => isRecord(criterion) && "key" in criterion);

  if (!order) issues.push("Pedido ausente.");
  if (!delivery) issues.push("Entrega ausente.");
  if (!report) issues.push("Relatório de verificação ausente.");
  if (!contract) issues.push("Contrato ausente.");

  if (
    order &&
    (!order.id ||
      !Number.isInteger(order.current_delivery_version) ||
      order.current_delivery_version < 1)
  ) {
    issues.push("Pedido sem uma versão de entrega válida.");
  }
  if (
    order &&
    delivery &&
    (delivery.order_id !== order.id || delivery.version !== order.current_delivery_version)
  ) {
    issues.push("A entrega não pertence à versão atual deste pedido.");
  }
  if (order && contract && contract.order_id !== order.id) {
    issues.push("O contrato não pertence a este pedido.");
  }
  if (
    order &&
    report &&
    (report.order_id !== order.id || report.delivery_version !== order.current_delivery_version)
  ) {
    issues.push("O relatório não pertence à versão atual deste pedido.");
  }
  if (
    delivery &&
    report &&
    (report.delivery_id !== delivery.id || report.delivery_version !== delivery.version)
  ) {
    issues.push("O relatório não identifica esta entrega.");
  }
  if (
    delivery &&
    (!delivery.id ||
      typeof delivery.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/i.test(delivery.sha256))
  ) {
    issues.push("A entrega não tem uma identificação de arquivo válida.");
  }
  if (report && (!report.id || !report.rules_version.trim() || !report.tool_name.trim())) {
    issues.push("O relatório não identifica a ferramenta e a versão das regras.");
  }
  if (
    contract &&
    (!contract.id || !Number.isSafeInteger(contract.price_units) || contract.price_units < 0)
  ) {
    issues.push("O contrato não tem uma identificação ou um preço válido.");
  }

  if (contract) {
    if (!Array.isArray(contract.acceptance_criteria) || contract.acceptance_criteria.length === 0) {
      issues.push("O contrato não define uma lista de critérios verificáveis.");
    } else {
      for (const raw of contract.acceptance_criteria) {
        const criterion = readContractCriterion(raw, legacy);
        if (!criterion) issues.push("O contrato contém um critério inválido.");
        else if (criteria.some((item) => item.criterion === criterion.criterion))
          issues.push("O contrato contém um critério duplicado.");
        else criteria.push(criterion);
      }
    }
  }

  if (report) {
    if (!Array.isArray(report.checks) || report.checks.length === 0) {
      issues.push("O relatório não contém verificações explícitas.");
    } else {
      for (const raw of report.checks) {
        const criterion = readCriterion(raw);
        if (!criterion || !isRecord(raw)) {
          issues.push("O relatório contém uma verificação inválida.");
          continue;
        }
        if (checks.some((item) => item.criterion === criterion.criterion)) {
          issues.push("O relatório contém uma verificação duplicada.");
          continue;
        }
        const parsedStatus = readCheckStatus(raw, legacy);
        const status: CheckStatus = parsedStatus ?? "inconclusive";
        if (!parsedStatus) {
          issues.push(
            `A verificação "${criterion.criterion}" não tem um resultado explícito válido.`,
          );
        }
        checks.push({
          ...criterion,
          observed: isJson(raw["observed"]) ? raw["observed"] : null,
          status,
          ...(typeof raw["evidence"] === "string" ? { evidence: raw["evidence"] } : {}),
        });
      }
    }
  }

  if (
    criteria.length !== checks.length ||
    criteria.some((criterion) => {
      const check = checks.find((item) => item.criterion === criterion.criterion);
      return !check || canonicalJson(criterion.expected) !== canonicalJson(check.expected);
    })
  ) {
    issues.push(
      "As verificações não correspondem a todos os critérios e valores esperados do contrato.",
    );
  }

  let status: ReviewStatus = "inconclusive";
  if (issues.length === 0 && report) {
    if (checks.some((check) => check.status === "failed")) {
      status = "rejected";
    } else if (checks.some((check) => check.status === "inconclusive")) {
      issues.push("Há verificações inconclusivas.");
    } else if (report.decision === "approved") {
      status = "approved";
    } else if (report.decision === "rejected") {
      status = "rejected";
    } else {
      issues.push("A decisão registrada no relatório é inconclusiva ou contém um erro.");
    }
  }

  const summary =
    status === "approved"
      ? "Todos os critérios da entrega atual estão aprovados no relatório."
      : status === "rejected"
        ? "O relatório aponta uma falha na entrega atual."
        : "Faltam evidências para confirmar a aprovação da entrega atual.";

  return {
    schema_version: "review-evidence-v1",
    status,
    summary,
    issues: [...new Set(issues)],
    order: order
      ? {
          id: order.id,
          status: order.status,
          current_delivery_version: order.current_delivery_version,
        }
      : null,
    contract: contract
      ? {
          id: contract.id,
          order_id: contract.order_id,
          price_units: contract.price_units,
          acceptance_criteria: criteria,
        }
      : null,
    delivery: delivery
      ? {
          id: delivery.id,
          order_id: delivery.order_id,
          version: delivery.version,
          sha256: delivery.sha256,
          file_name: delivery.file_name,
          test_upload: delivery.test_upload,
        }
      : null,
    report: report
      ? {
          id: report.id,
          order_id: report.order_id,
          delivery_id: report.delivery_id,
          delivery_version: report.delivery_version,
          rules_version: report.rules_version,
          tool_name: report.tool_name,
          decision: report.decision,
          summary: report.summary,
        }
      : null,
    checks,
    can_authorize_payment: false,
  };
}
