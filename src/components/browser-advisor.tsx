import { useEffect, useState } from "react";
import { ArrowRight, Check, LoaderCircle, ShieldCheck, Monitor, Smartphone } from "lucide-react";
import { browserQuote, type BrowserEvidence } from "@/lib/browser-qa";
import {
  getBrowserSetup,
  createBrowserWorkerKey,
  buyBrowserTest,
  retryBrowserOrder,
} from "@/lib/browser.functions";
import {
  getStudioOrder,
  submitHumanReview,
  cancelStudioOrder,
  createAgentKey,
} from "@/lib/studio.functions";
import type { StudioDetails } from "@/lib/studio.types";
import "@/browser-advisor.css";
type Setup = Awaited<ReturnType<typeof getBrowserSetup>>;
function save(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function BrowserAdvisor({ signedIn, onLogin }: { signedIn: boolean; onLogin: () => void }) {
  const [setup, setSetup] = useState<Setup | null>(null),
    [order, setOrder] = useState<StudioDetails | null>(null);
  const [budget, setBudget] = useState(20),
    [fault, setFault] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [selected, setSelected] = useState(""),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const quote = browserQuote(budget);
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
    const tick = async () => {
      try {
        const state = await getBrowserSetup();
        if (active) setSetup(state);
        if (selected) {
          const detail = await getStudioOrder({ data: { orderId: selected } });
          if (active) setOrder(detail);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Não foi possível carregar.");
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 4000);
    return () => {
      active = false;
      clearInterval(timer);
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
  const state = order?.order.status;
  const labels: Record<string, string> = {
    contracted: "15 créditos reservados. Aguardando o executor.",
    in_progress: "O fornecedor está testando no navegador.",
    revision_requested: "Pagamento bloqueado. A entrega precisa de correção.",
    accepted: "Testes conferidos. Falta o seu aceite.",
    settled: "Entrega aceita. Pagamento concluído.",
    cancelled: "Pedido cancelado. Reserva devolvida.",
  };
  return (
    <section className="browser-advisor">
      <div className="qa-eyebrow">NEURAMARKET · ASSESSOR DO SEU AGENTE</div>
      <h1>
        Seu agente precisa de
        <br />
        uma capacidade nova?
      </h1>
      <p className="qa-intro">
        Ele contrata quem executa. Você confere o resultado antes do pagamento.
      </p>
      <div className="qa-request">
        <span className="qa-label">PEDIDO DO AGENTE CRIADOR DE SITES</span>
        <p>
          “Terminei a página. Teste o formulário no computador e no celular, com capturas que
          comprovem o resultado.”
        </p>
        <a href="/qa-fixture" target="_blank" rel="noreferrer">
          Abrir a página que será testada ↗
        </a>
        <div className="qa-controls">
          <label>
            Orçamento{" "}
            <input
              aria-label="Orçamento em créditos simulados"
              type="number"
              min={1}
              max={1000}
              value={budget}
              disabled={!!order}
              onChange={(e) => setBudget(Number(e.target.value))}
            />{" "}
            créditos
          </label>
          <button
            disabled={
              busy ||
              !!order ||
              (!quote.selectedOffer && signedIn) ||
              Boolean(signedIn && !setup?.workerOnline)
            }
            onClick={() => {
              if (!signedIn) {
                onLogin();
                return;
              }
              void action(async () => {
                const created = await buyBrowserTest({
                  data: { requestId, budget, testFailure: fault, fixture: "lead-form-v1" },
                });
                setSelected(created.orderId);
                setOrder(await getStudioOrder({ data: { orderId: created.orderId } }));
              });
            }}
          >
            {busy ? <LoaderCircle size={17} /> : <ArrowRight size={17} />}{" "}
            {signedIn ? "Contratar teste" : "Entrar para testar"}
          </button>
        </div>
        <label className="qa-fault">
          <input
            type="checkbox"
            checked={fault}
            disabled={!!order}
            onChange={(e) => setFault(e.target.checked)}
          />{" "}
          Demonstrar bloqueio: omitir a evidência mobile na primeira entrega.
        </label>
      </div>
      {error && (
        <p role="alert" className="qa-error">
          {error}
        </p>
      )}
      <div className="qa-offers">
        {quote.offers.map((o) => (
          <div key={o.name} className={o.eligible ? "eligible" : ""}>
            <strong>{o.name}</strong>
            <b>{o.price} créditos</b>
            <p>{o.reason}</p>
            <small>{o.eligible ? "Selecionado pelo assessor" : "Não atende ao pedido"}</small>
          </div>
        ))}
      </div>
      <p className="qa-explanation">
        {quote.reason} O comprador deste exemplo tem acesso a texto, mas não possui um navegador.
      </p>
      {signedIn && (
        <p className="qa-connection">
          <span className={setup?.workerOnline ? "online" : ""} />{" "}
          {setup?.workerOnline
            ? "Executor conectado"
            : "Executor desconectado. Abra “Preparar demonstração” abaixo."}{" "}
          · Créditos simulados
          {setup?.account
            ? ` · Saldo ${setup.account.available_units} · Reservado ${setup.account.reserved_units}`
            : ""}
        </p>
      )}
      {order && (
        <div className="qa-result" aria-live="polite">
          <h2>
            <ShieldCheck size={24} />
            {labels[state!] ?? state}
          </h2>
          {report && (
            <div className="qa-checks">
              {report.checks.map((c: any) => (
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
          {state === "revision_requested" && (
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
          {state === "accepted" && delivery && report && (
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
              <Check size={18} /> Aceitar entrega e pagar 15 créditos
            </button>
          )}
          {state === "settled" && (
            <p className="qa-paid">
              15 créditos pagos: 14 para o fornecedor + 1 para a NeuraMarket. A mesma aprovação não
              gera outro pagamento.
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
          <p>
            Para um agente externo contratar via MCP, baixe a configuração e use o caminho deste
            repositório no campo do script.
          </p>
          <button
            disabled={busy || !setup}
            onClick={() =>
              void action(async () => {
                const key = await createAgentKey({ data: { companyId: setup!.companyId } });
                save(
                  "neuramarket-mcp.json",
                  JSON.stringify(
                    {
                      mcpServers: {
                        neuramarket: {
                          command: "node",
                          args: ["/CAMINHO/market-agent-sync/scripts/neuramarket-mcp.mjs"],
                          env: { NM_BASE_URL: location.origin, NM_AGENT_KEY: key.token },
                        },
                      },
                    },
                    null,
                    2,
                  ),
                );
              })
            }
          >
            Baixar conexão MCP
          </button>
          <p>
            O agente usa <code>quote_browser_test</code>, <code>buy_browser_test</code> e{" "}
            <code>get_order</code>. O aceite humano continua nesta tela.
          </p>
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
