import { Check, CircleHelp, X } from "lucide-react";
import { buildReviewEvidence } from "@/lib/review-evidence";
import type { getDemoWorkspace } from "@/lib/demo.functions";
import { ReviewAssistant } from "./review-assistant";

type Workspace = Awaited<ReturnType<typeof getDemoWorkspace>>;
const labels = { approved: "Aprovado", rejected: "Reprovado", inconclusive: "Inconclusivo" };

export function ReviewEvidencePanel({ data }: { data: Workspace }) {
  const order = data.order;
  if (!order) return <p>Nenhum pedido disponível.</p>;
  const delivery =
    data.deliveries.find(
      (item) => item.order_id === order.id && item.version === order.current_delivery_version,
    ) ?? null;
  const report =
    data.reports.find((item) => item.order_id === order.id && item.delivery_id === delivery?.id) ??
    null;
  const evidence = buildReviewEvidence({ order, contract: data.contract, delivery, report });
  return (
    <>
      <div className="mb-8 border-b pb-7">
        <p className="section-kicker">VERIFICAÇÃO INDEPENDENTE</p>
        <h2 className="section-title">Evidências antes do pagamento</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O relatório precisa corresponder ao contrato e à versão atual da entrega.
        </p>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="section-kicker">RELATÓRIO ATUAL</p>
            <h3>{evidence.summary}</h3>
          </div>
          <span
            className={
              evidence.status === "approved"
                ? "badge-success"
                : evidence.status === "rejected"
                  ? "badge-error"
                  : "badge-warn"
            }
          >
            {labels[evidence.status]}
          </span>
        </div>
        <div className="space-y-2 border-b p-5 text-sm">
          <p>
            Entrega:{" "}
            {delivery
              ? `${delivery.file_name}, versão ${delivery.version}`
              : "Nenhuma entrega atual registrada"}
          </p>
          <div className="hash-row">
            <span>SHA-256</span>
            <code>{delivery?.sha256 ?? "Não registrado"}</code>
          </div>
          <p className="text-xs text-muted-foreground">
            Ferramenta registrada: {report?.tool_name ?? "Não registrada"}.{" "}
            {delivery?.test_upload ? "Arquivo identificado como teste." : ""}
          </p>
        </div>
        {evidence.issues.length > 0 && (
          <div className="border-b bg-amber-50 p-5 text-sm text-amber-950">
            <ul className="list-disc space-y-1 pl-5">
              {evidence.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-4">Critério</th>
                <th className="p-4">Esperado</th>
                <th className="p-4">Observado</th>
                <th className="p-4">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {evidence.checks.map((check) => (
                <tr key={check.criterion} className="border-b last:border-0">
                  <th className="p-4 font-medium">{check.criterion}</th>
                  <td className="p-4">{display(check.expected)}</td>
                  <td className="p-4">{display(check.observed)}</td>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-1">
                      {check.status === "passed" ? (
                        <>
                          <Check className="size-4 text-green-700" />
                          Passou
                        </>
                      ) : check.status === "failed" ? (
                        <>
                          <X className="size-4 text-red-700" />
                          Falhou
                        </>
                      ) : (
                        <>
                          <CircleHelp className="size-4 text-amber-700" />
                          Inconclusivo
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {evidence.checks.length === 0 && (
            <p className="p-5 text-sm text-muted-foreground">
              Ainda não há critérios verificáveis neste relatório.
            </p>
          )}
        </div>
      </section>
      <ReviewAssistant key={order.id} orderId={order.id} />
    </>
  );
}
function display(value: unknown) {
  return value === null || value === undefined
    ? "Não registrado"
    : typeof value === "string"
      ? value
      : JSON.stringify(value);
}
