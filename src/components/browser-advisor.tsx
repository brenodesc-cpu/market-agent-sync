import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  LoaderCircle,
  ShieldCheck,
  Monitor,
  Smartphone,
} from "lucide-react";
import { type BrowserEvidence } from "@/lib/browser-qa";
import {
  getBrowserSetup,
  createBrowserWorkerKey,
  startBrowserGoal,
  quoteBrowserGoal,
  hireBrowserGoalQuote,
  retryBrowserOrder,
} from "@/lib/browser.functions";
import { getStudioOrder, submitHumanReview, cancelStudioOrder } from "@/lib/studio.functions";
import type { StudioDetails } from "@/lib/studio.types";
import "@/browser-advisor.css";
import { ContractNetwork } from "./contract-network";
type Setup = Awaited<ReturnType<typeof getBrowserSetup>>;
function save(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function BrowserAdvisor({
  signedIn,
  onLogin,
  initialOrderId,
  onConnect,
}: {
  signedIn: boolean;
  onLogin: () => void;
  initialOrderId?: string;
  onConnect: () => void;
}) {
  const [setup, setSetup] = useState<Setup | null>(null),
    [order, setOrder] = useState<StudioDetails | null>(null);
  const [budget, setBudget] = useState(20),
    [fault, setFault] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [selected, setSelected] = useState(initialOrderId ?? ""),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const seenOrders = useRef<Set<string> | null>(null);
  const [objective, setObjective] = useState(
    "Teste o formulário da página de demonstração no computador e no celular.",
  );
  const [mode, setMode] = useState<"autonomous" | "manual">("autonomous");
  const [authorized, setAuthorized] = useState(false);
  const [manualQuote, setManualQuote] = useState<{
    id: string;
    quote: ReturnType<typeof import("@/lib/browser-market").evaluateBrowserSuppliers>;
  } | null>(null);
  const automatic = order ? !order.contract.requires_human_review : mode === "autonomous";
  function resetInput() {
    setManualQuote(null);
    setRequestId(crypto.randomUUID());
  }

  async function refresh() {
    const state = await getBrowserSetup();
    setSetup(state);
    if (selected) setOrder(await getStudioOrder({ data: { orderId: selected } }));
  }
  useEffect(() => {
    if (!signedIn) {
      setSetup(null);
      setOrder(null);
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const state = await getBrowserSetup();
        if (!active) return;
        setSetup(state);
        setError("");
        const ids = state.orders.map((item) => item.id);
        if (seenOrders.current === null) {
          seenOrders.current = new Set(ids);
        } else {
          const incoming = state.orders.find((item) => !seenOrders.current!.has(item.id));
          ids.forEach((id) => seenOrders.current!.add(id));
          if (active && !selected && incoming) {
            setSelected(incoming.id);
            setOrder(await getStudioOrder({ data: { orderId: incoming.id } }));
          }
        }
        if (selected) {
          const detail = await getStudioOrder({ data: { orderId: selected } });
          if (active) setOrder(detail);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Não foi possível carregar.");
      } finally {
        if (active) timer = setTimeout(() => void tick(), 1500);
      }
    };
    void tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [signedIn, selected]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "A operação não foi concluída.");
    } finally {
      setBusy(false);
    }
  }
  const delivery = order?.deliveries.find(
    (d) => d.version === order.order.current_delivery_version,
  );
  const report = order?.reports.find((r) => r.delivery_id === delivery?.id);
  let evidence: BrowserEvidence | null = null;
  try {
    evidence = delivery?.artifact_content ? JSON.parse(delivery.artifact_content) : null;
  } catch {
    /* invalid artifacts are never rendered */
  }
  const account = order
    ? setup?.accounts.find((a) => a.company_id === order.order.buyer_company_id)
    : setup?.account;
  const state = order?.order.status;
  const fromMcp = order?.order.brief?.source === "mcp";
  const labels: Record<string, string> = {
    contracted: "Créditos reservados. Aguardando o executor.",
    in_progress: "O fornecedor está testando no navegador.",
    revision_requested: "Pagamento bloqueado. A entrega precisa de correção.",
    accepted: automatic
      ? "Testes conferidos. Liquidação automática em andamento."
      : "Testes conferidos. Falta o seu aceite.",
    settled: "Entrega aceita. Pagamento concluído.",
    cancelled: "Pedido cancelado. Reserva devolvida.",
    expired: "Pedido expirado.",
    delivered: "Entrega recebida. Aguardando a auditoria.",
    verifying: "Auditoria em andamento.",
    verification_inconclusive: "Auditoria inconclusiva. Pagamento bloqueado.",
  };
  return (
    <section className={`browser-advisor${order ? " has-order" : ""}`}>
      <div className="qa-dashboard-heading">
        <div>
          <div className="qa-eyebrow">NEURAMARKET · OPERAÇÃO AO VIVO</div>
          <h1>Acompanhe seus agentes.</h1>
          <p className="qa-intro">Acompanhe quem foi escolhido, o que entregou e quanto custou.</p>
        </div>
        <span className="qa-update-status">
          {signedIn ? "Atualização automática · 1,5 s" : "Entre para acompanhar sua operação"}
        </span>
      </div>
      <ContractNetwork order={order} budget={budget} connected={signedIn} onConnect={onConnect} />
      {!order && (
        <div className="qa-goal-form">
          <div className="qa-journey-tabs" aria-label="Quem conduz a contratação">
            <button
              aria-pressed={mode === "autonomous"}
              disabled={busy}
              onClick={() => {
                setMode("autonomous");
                resetInput();
              }}
            >
              Agente resolve
            </button>
            <button
              aria-pressed={mode === "manual"}
              disabled={busy}
              onClick={() => {
                setMode("manual");
                resetInput();
              }}
            >
              Eu escolho os passos
            </button>
          </div>
          <label>
            O que precisa ser testado?
            <textarea
              value={objective}
              disabled={busy}
              onChange={(e) => {
                setObjective(e.target.value);
                resetInput();
              }}
              maxLength={1200}
            />
          </label>
          <p>
            {mode === "autonomous"
              ? "Defina o objetivo e o limite. O agente compara, negocia, contrata e acompanha até o pagamento."
              : "Compare as ofertas abaixo, escolha o fornecedor, peça a correção e aprove o pagamento. O objetivo é o mesmo."}
          </p>
          {mode === "autonomous" && (
            <label className="qa-fault">
              <input
                type="checkbox"
                checked={authorized}
                disabled={busy}
                onChange={(e) => setAuthorized(e.target.checked)}
              />{" "}
              Autorizo reservar e pagar até {budget} créditos simulados se a auditoria comprovar a
              entrega. Uma correção incluída.
            </label>
          )}
        </div>
      )}
      <div className="qa-command-bar">
        <div className="qa-command-copy">
          <Bot size={18} />
          <div>
            <strong>
              {fromMcp
                ? "Pedido externo recebido pelo MCP/API"
                : order
                  ? "Contratação iniciada pelo estúdio"
                  : "Experimente uma contratação"}
            </strong>
            <span>
              {order
                ? `Pedido ${order.order.id.slice(0, 8)} · ${labels[state!] ?? state}`
                : "Teste o formulário de demonstração em desktop e mobile."}
            </span>
          </div>
        </div>
        {!order && (
          <div className="qa-controls">
            <label>
              Orçamento{" "}
              <input
                aria-label="Orçamento em créditos simulados"
                type="number"
                min={1}
                max={1000}
                value={budget}
                disabled={busy}
                onChange={(e) => {
                  setBudget(Number(e.target.value));
                  resetInput();
                  setAuthorized(false);
                }}
              />{" "}
              cr
            </label>
            <button
              disabled={
                busy ||
                !objective.trim() ||
                (mode === "autonomous" && !authorized) ||
                (signedIn && !setup?.workerOnline)
              }
              onClick={() => {
                if (!signedIn) {
                  onLogin();
                  return;
                }
                void action(async () => {
                  const input = { requestId, budget, objective, testFailure: fault };
                  if (mode === "manual") {
                    setManualQuote(await quoteBrowserGoal({ data: input }));
                    return;
                  }
                  const created = await startBrowserGoal({
                    data: { ...input, authorizeAutomaticPayment: true },
                  });
                  if (!created.orderId)
                    throw new Error(created.reason ?? "Nenhuma oferta atende ao pedido.");
                  setSelected(created.orderId);
                  setOrder(await getStudioOrder({ data: { orderId: created.orderId } }));
                });
              }}
            >
              {busy ? <LoaderCircle size={16} /> : <ArrowRight size={16} />}{" "}
              {busy
                ? "Interpretando e comparando…"
                : signedIn
                  ? mode === "autonomous"
                    ? "Executar objetivo"
                    : "Consultar ofertas"
                  : "Entrar para testar"}
            </button>
          </div>
        )}
      </div>
      {!order && manualQuote && (
        <div className="qa-manual-offers">
          {manualQuote.quote.offers.map((offer) => (
            <article key={offer.id}>
              <strong>
                {offer.name} · {offer.price} cr
              </strong>
              <p>{offer.coverage}</p>
              <p>{offer.negotiation}</p>
              <small>{offer.reason}</small>
              <button
                disabled={busy || !offer.eligible}
                onClick={() =>
                  void action(async () => {
                    const created = await hireBrowserGoalQuote({
                      data: { quoteId: manualQuote.id, offerVersionId: offer.id },
                    });
                    setSelected(created.orderId);
                    setOrder(await getStudioOrder({ data: { orderId: created.orderId } }));
                  })
                }
              >
                Escolher este fornecedor
              </button>
            </article>
          ))}
        </div>
      )}
      {!order && (
        <div className="qa-demo-options">
          <label className="qa-fault">
            <input
              type="checkbox"
              checked={fault}
              disabled={busy}
              onChange={(e) => {
                setFault(e.target.checked);
                resetInput();
              }}
            />{" "}
            Demonstrar uma entrega incompleta e a correção.
          </label>
          <a href="/qa-fixture" target="_blank" rel="noreferrer">
            Ver página de teste ↗
          </a>
        </div>
      )}
      {signedIn && !!setup?.orders.length && (
        <label className="qa-order-picker">
          Histórico de contratações{" "}
          <select
            aria-label="Escolher contratação"
            value={selected}
            onChange={(e) => {
              setOrder(null);
              setSelected(e.target.value);
            }}
          >
            <option value="">Aguardar novo pedido</option>
            {setup.orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.id.slice(0, 8)} · {labels[o.status] ?? o.status}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p role="alert" className="qa-error">
          {error}
        </p>
      )}
      {signedIn && (
        <p className="qa-connection">
          <span className={setup?.workerOnline ? "online" : ""} />{" "}
          {setup?.workerOnline
            ? "Executor conectado"
            : "Executor desconectado. Abra “Preparar demonstração” abaixo."}{" "}
          · Créditos simulados
          {account
            ? ` · Saldo ${account.available_units} · Reservado ${account.reserved_units}`
            : ""}
        </p>
      )}
      {order && (
        <div className="qa-result" aria-live="polite">
          <h2>
            <ShieldCheck size={24} />
            {labels[state!] ?? state}
          </h2>
          {order.reports.length > 1 && (
            <div className="qa-checks">
              {order.reports.map((r) => (
                <span key={r.id} className={r.decision === "approved" ? "pass" : "fail"}>
                  Versão {r.delivery_version}:{" "}
                  {r.decision === "approved" ? "aprovada" : "reprovada"}
                </span>
              ))}
            </div>
          )}
          {report && (
            <div className="qa-checks">
              {report.checks.map((c) => (
                <span key={c.criterion} className={c.status === "passed" ? "pass" : "fail"}>
                  {c.status === "passed" ? "✓" : "×"}{" "}
                  {c.criterion === "evidence_integrity"
                    ? "Integridade das evidências"
                    : c.criterion}
                </span>
              ))}
            </div>
          )}
          <div className="qa-evidence">
            {evidence?.samples?.map((s) => (
              <article key={s.viewport}>
                <h3>
                  {s.viewport === "desktop" ? <Monitor size={18} /> : <Smartphone size={18} />}{" "}
                  {s.viewport === "desktop" ? "Computador" : "Celular"}
                </h3>
                <img
                  src={`data:image/png;base64,${s.screenshot}`}
                  alt={`Captura real do teste ${s.viewport}`}
                />
                <p>{s.finding}</p>
                <small>
                  {(s.durationMs / 1000).toFixed(1)}s · SHA-256 {s.sha256.slice(0, 12)}…
                </small>
              </article>
            ))}
          </div>
          {state === "revision_requested" && !automatic && (
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  setOrder(await retryBrowserOrder({ data: { orderId: order.order.id } }));
                })
              }
            >
              Solicitar a correção incluída no contrato
            </button>
          )}
          {state === "accepted" && !automatic && delivery && report && (
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  setOrder(
                    await submitHumanReview({
                      data: {
                        orderId: order.order.id,
                        deliveryId: delivery.id,
                        reportId: report.id,
                        sha256: delivery.sha256!,
                        decision: "approved",
                        note: "Conferi as evidências de desktop e mobile e aceito a entrega.",
                      },
                    }),
                  );
                  await refresh();
                })
              }
            >
              <Check size={18} /> Aceitar entrega e pagar {order.contract.price_units} créditos
            </button>
          )}
          {state === "settled" && (
            <p className="qa-paid">
              {order.contract.price_units} créditos pagos:{" "}
              {order.contract.price_units -
                Math.floor(
                  (order.contract.price_units * order.contract.commission_bps) / 10000,
                )}{" "}
              para o fornecedor +{" "}
              {Math.floor((order.contract.price_units * order.contract.commission_bps) / 10000)}{" "}
              para a NeuraMarket.{" "}
              {automatic
                ? "Liquidação automática conforme a autorização inicial."
                : "Aceite humano registrado."}{" "}
              A repetição não paga novamente.
            </p>
          )}
          {!["settled", "cancelled", "expired"].includes(state ?? "") && (
            <button
              className="qa-link"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await cancelStudioOrder({ data: { orderId: order.order.id } });
                  await refresh();
                })
              }
            >
              Cancelar e devolver a reserva
            </button>
          )}
          {["settled", "cancelled", "expired"].includes(state ?? "") && (
            <button
              className="qa-link"
              onClick={() => {
                setOrder(null);
                setSelected("");
                setRequestId(crypto.randomUUID());
              }}
            >
              Começar outro teste
            </button>
          )}
          {order.order.brief?.inference && (
            <div className="qa-inference-audit">
              <h3>Decisões e consumo</h3>
              <p>
                Interpretação do objetivo: NeuraLake · {order.order.brief.inference.requestedModel}.
                Modelo retornado:{" "}
                {order.order.brief.inference.resolvedModel ?? "não informado pelo provedor"}.
              </p>
              <p>
                {order.order.brief.inference.usage?.total_tokens ?? "Não informado"} tokens ·{" "}
                {(order.order.brief.inference.durationMs / 1000).toFixed(1)}s de inferência.
              </p>
              <p>
                Custo de referência:{" "}
                {order.order.brief.inference.estimatedCostUsd != null
                  ? `$${order.order.brief.inference.estimatedCostUsd.toFixed(6)} USD`
                  : "indisponível"}
                .
              </p>
              <p>{order.order.brief.inference.costNote}</p>
              <p>
                Escolha: cobertura e menor preço negociado. Execução: Chromium. Auditoria: regras do
                contrato, sem inferência adicional.
              </p>
              <button
                className="qa-link"
                onClick={() =>
                  save(
                    `auditoria-${order.order.id}.json`,
                    JSON.stringify(
                      {
                        ...order,
                        deliveries: order.deliveries.map(({ artifact_content, ...d }) => d),
                      },
                      null,
                      2,
                    ),
                  )
                }
              >
                Baixar trilha de auditoria
              </button>
            </div>
          )}
          <details>
            <summary>Contrato e histórico</summary>
            <p>
              Revisão {order.order.current_delivery_version}. A auditoria verifica a cobertura dos
              testes. Encontrar um defeito na página não reprova o serviço de QA.
            </p>
            {order.events.map((e) => (
              <p key={e.id}>
                <strong>{e.actor_label}:</strong> {e.result}
              </p>
            ))}
          </details>
        </div>
      )}
      {signedIn && (
        <details className="qa-setup">
          <summary>Preparar demonstração e conectar outro agente</summary>
          <p>
            O executor precisa ficar aberto em um computador com Chrome. A configuração expira em 24
            horas e só permite executar os testes desta conta.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const { key } = await createBrowserWorkerKey();
                save(
                  "neuramarket-worker.json",
                  JSON.stringify({ baseUrl: location.origin, key }, null, 2),
                );
                await refresh();
              })
            }
          >
            Baixar configuração do executor
          </button>
          <pre>npm run browser:worker -- --config ~/Downloads/neuramarket-worker.json</pre>
          <button onClick={onConnect}>Conectar um agente pelo MCP remoto ou API</button>
          {setup?.orders.map((o) => (
            <button className="qa-link" key={o.id} onClick={() => setSelected(o.id)}>
              {o.title} · {o.status}
            </button>
          ))}
        </details>
      )}
    </section>
  );
}
