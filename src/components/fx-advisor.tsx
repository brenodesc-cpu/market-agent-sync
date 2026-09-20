import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ShieldCheck, LoaderCircle, Download } from "lucide-react";
import { getFxView, startFxView, quoteFxView, hireFxView, actFxView } from "@/lib/fx.functions";
import type { FxSnapshot, FxQuote, FxOffer } from "@/lib/fx-market";
import "@/fx-advisor.css";
const money = (c: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(c / 100);
const labels: Record<string, string> = {
  reserved: "Valor reservado",
  delivered: "Comprovante recebido",
  rejected: "Comprovante reprovado",
  corrected: "Comprovante corrigido",
  approved: "Auditoria aprovada",
  awaiting_approval: "Aguardando seu aceite",
  settled: "Dólares disponíveis",
  cancelled: "Cancelada; reserva devolvida",
  expired: "Prazo encerrado; reserva devolvida",
};
const eventLabels: Record<string, string> = {
  offers_evaluated: "Ofertas comparadas por prazo e custo",
  negotiated: "Condições negociadas",
  reserved: "Contrato fixado e valor reservado",
  operation_pending: "Operação registrada no simulador",
  delivered: "Comprovante entregue",
  audited: "Auditoria do registro",
  correction_requested: "Correção pedida sem nova transferência",
  settled: "Liquidação concluída uma vez",
  cancelled: "Reserva devolvida",
  expired: "Prazo encerrado",
};
function friendly(error: unknown) {
  const m = error instanceof Error ? error.message : String(error);
  return (
    (
      {
        fx_no_eligible_offer:
          "Nenhuma oferta atende ao prazo e ao orçamento. Ajuste os limites e inicie uma nova cotação.",
        fx_insufficient_balance: "Saldo simulado insuficiente para esta operação.",
        fx_quote_expired: "A cotação venceu. Faça uma nova cotação.",
        fx_idempotency_conflict:
          "Este pedido já possui outros termos. Use Nova operação para mudar os limites.",
        fx_authorization_required: "Autorize a movimentação simulada antes de continuar.",
      } as Record<string, string>
    )[m] ?? m
  );
}
export function FxAdvisor({
  signedIn,
  onLogin,
  companyId,
  initialOrderId,
  identity,
}: {
  signedIn: boolean;
  onLogin: () => void;
  companyId?: string;
  initialOrderId?: string;
  identity: string;
}) {
  const [snapshot, setSnapshot] = useState<FxSnapshot | null>(null),
    [quote, setQuote] = useState<FxQuote | null>(null),
    [orderId, setOrderId] = useState(initialOrderId ?? ""),
    [mode, setMode] = useState<"autonomous" | "manual">("autonomous");
  const [amount, setAmount] = useState(1000),
    [budget, setBudget] = useState(5600),
    [minutes, setMinutes] = useState(60),
    [authorized, setAuthorized] = useState(false),
    [fault, setFault] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef("");
  const scope = companyId ? { companyId } : {};
  const storageKey = `nm-fx-request:${identity}:${companyId ?? "default"}`;
  useEffect(() => {
    request.current = sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
    sessionStorage.setItem(storageKey, request.current);
  }, [storageKey]);
  const seenOrders = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    let alive = true,
      fetching = false;
    async function refresh() {
      if (fetching) return;
      fetching = true;
      try {
        const data = JSON.parse(
          await getFxView({
            data: { ...(companyId ? { companyId } : {}), ...(orderId ? { orderId } : {}) },
          }),
        ) as FxSnapshot;
        if (!alive) return;
        setSnapshot(data);
        if (!orderId && data.orders) {
          const ids = new Set(data.orders.map((o) => o.id));
          const incoming = seenOrders.current
            ? data.orders.find((o) => !seenOrders.current!.has(o.id))
            : null;
          seenOrders.current = ids;
          if (incoming) setOrderId(incoming.id);
        }
      } catch (e) {
        if (alive) setError(friendly(e));
      } finally {
        fetching = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [signedIn, companyId, orderId]);
  async function act(work: () => Promise<string>) {
    setBusy(true);
    setError("");
    try {
      const data = JSON.parse(await work()) as FxSnapshot;
      setSnapshot(data);
      if (data.order) setOrderId(data.order.id);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }
  const order = snapshot?.order;
  const comparison = order ? snapshot?.quote : quote;
  const offers = comparison?.data.offers ?? [];
  const total = order?.contract.totalBrlCents;
  const done = order?.status === "settled";
  const input = () => ({
    ...scope,
    requestId: request.current,
    targetUsdCents: Math.round(amount * 100),
    maxTotalBrlCents: Math.round(budget * 100),
    maxSettlementMinutes: minutes,
  });
  function fresh() {
    request.current = crypto.randomUUID();
    sessionStorage.setItem(storageKey, request.current);
    setOrderId("");
    setSnapshot(null);
    setQuote(null);
    setError("");
    setAuthorized(false);
  }
  async function submit() {
    if (!signedIn) {
      onLogin();
      return;
    }
    if (mode === "manual") {
      setBusy(true);
      setError("");
      try {
        setQuote(JSON.parse(await quoteFxView({ data: input() })));
      } catch (e) {
        setError(friendly(e));
      } finally {
        setBusy(false);
      }
    } else
      await act(() =>
        startFxView({ data: { ...input(), authorizeSimulation: true, testFailure: fault } }),
      );
  }
  return (
    <section className="fx-advisor">
      <div className="fx-simulation">
        SIMULAÇÃO FINANCEIRA <span>Instituições fictícias · Nenhum dinheiro real</span>
      </div>
      <header className="fx-heading">
        <span className="studio-eyebrow">TESOURARIA PARA AGENTES</span>
        <h1>{done ? "Conversão concluída." : "Seu agente escolhe o câmbio."}</h1>
        <p>
          Defina quanto precisa receber e o limite de gasto. A contratação segue até a conferência
          da operação.
        </p>
        <a href="/demo" className="studio-secondary">
          Ver a demonstração do pitch <ArrowRight size={15} />
        </a>
      </header>
      <div className="fx-wallet">
        <span>
          BRL disponível{" "}
          <strong>
            {snapshot ? money(snapshot.wallet.available_brl) : "Entre para consultar"}
          </strong>
        </span>
        <span>
          Reservado <strong>{snapshot ? money(snapshot.wallet.reserved_brl) : "Entre"}</strong>
        </span>
        <span>
          USD disponível{" "}
          <strong>{snapshot ? money(snapshot.wallet.available_usd, "USD") : "Entre"}</strong>
        </span>
      </div>
      {error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}
      {!order && (
        <div className="fx-goal">
          <div className="fx-mode">
            <button
              aria-pressed={mode === "autonomous"}
              onClick={() => {
                setMode("autonomous");
                setQuote(null);
              }}
            >
              Agente resolve
            </button>
            <button
              aria-pressed={mode === "manual"}
              onClick={() => {
                setMode("manual");
                setQuote(null);
              }}
            >
              Eu escolho os passos
            </button>
          </div>
          <h2>Quero dólares disponíveis na carteira da empresa.</h2>
          <div className="fx-inputs">
            <label>
              Receber em USD
              <input
                type="number"
                min="1"
                max="10000"
                step="0.01"
                value={amount}
                disabled={busy || !!quote}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </label>
            <label>
              Gastar no máximo em BRL
              <input
                type="number"
                min="1"
                max="100000"
                step="0.01"
                value={budget}
                disabled={busy || !!quote}
                onChange={(e) => setBudget(Number(e.target.value))}
              />
            </label>
            <label>
              Prazo máximo
              <select
                value={minutes}
                disabled={busy || !!quote}
                onChange={(e) => setMinutes(Number(e.target.value))}
              >
                <option value={60}>1 hora</option>
                <option value={1440}>24 horas</option>
                <option value={2880}>48 horas</option>
              </select>
            </label>
          </div>
          <p>
            A taxa da plataforma de {money(500)} está incluída no limite. O envio posterior a um
            fornecedor internacional fica fora desta demo.
          </p>
          <label className="fx-consent">
            <input
              type="checkbox"
              checked={authorized}
              onChange={(e) => setAuthorized(e.target.checked)}
            />
            Autorizo reservar e movimentar até {money(Math.round(budget * 100))} na carteira
            simulada conforme o contrato.
          </label>
          <label className="fx-consent">
            <input
              type="checkbox"
              checked={fault}
              disabled={busy || !!quote}
              onChange={(e) => setFault(e.target.checked)}
            />
            Demonstrar um comprovante incorreto e sua correção.
          </label>
          <button
            className="studio-primary"
            disabled={busy || (signedIn && !authorized)}
            onClick={() => void submit()}
          >
            {busy ? <LoaderCircle className="fx-spin" size={18} /> : <ArrowRight size={18} />}{" "}
            {!signedIn
              ? "Entrar para testar"
              : mode === "manual"
                ? "Comparar ofertas"
                : "Executar pelo agente"}
          </button>
          <button className="studio-text-button" disabled={busy} onClick={fresh}>
            Nova cotação
          </button>
          {busy && (
            <p role="status">
              Consultando as ofertas e registrando a operação. Se houver uma interrupção, o mesmo
              pedido poderá ser retomado.
            </p>
          )}
        </div>
      )}
      {comparison && (
        <>
          <h2>Quem atende ao pedido?</h2>
          <div className="fx-offers">
            {offers.map((offer: FxOffer) => (
              <article
                key={offer.supplierId}
                className={
                  offer.supplierId ===
                  (order?.contract.supplierId ?? comparison.data.selected?.supplierId)
                    ? "fx-selected"
                    : ""
                }
              >
                <span>{offer.name} · simulado</span>
                <h3>{money(offer.totalBrlCents)}</h3>
                <p>
                  {offer.settlementMinutes <= 60
                    ? `Até ${offer.settlementMinutes} minutos`
                    : `Até ${offer.settlementMinutes / 60} horas`}{" "}
                  · taxas incluídas
                </p>
                <p>{offer.reason}</p>
                <small>
                  Anunciado {money(offer.listTotalBrlCents)} → aceito {money(offer.totalBrlCents)}
                </small>
                {!order && mode === "manual" && (
                  <button
                    className="studio-secondary"
                    disabled={!offer.eligible || busy || !authorized}
                    onClick={() =>
                      void act(() =>
                        hireFxView({
                          data: {
                            ...scope,
                            quoteId: comparison.id,
                            supplierId: offer.supplierId,
                            authorizeSimulation: true,
                            testFailure: fault,
                          },
                        }),
                      )
                    }
                  >
                    Escolher {offer.name}
                  </button>
                )}
              </article>
            ))}
          </div>
          <p className="fx-caption">{comparison.inference?.summary ?? comparison.data.policy}</p>
        </>
      )}
      {order && (
        <>
          <div className="fx-result">
            <div>
              <span>{labels[order.status] ?? order.status}</span>
              <h2>{money(order.contract.targetUsdCents, "USD")}</h2>
              <p>{done ? "Disponibilizados na carteira simulada" : "Valor líquido contratado"}</p>
            </div>
            <ArrowRight size={30} />
            <div>
              <span>Custo total contratado</span>
              <h2>{money(total!)}</h2>
              <p>
                {money(order.contract.principalBrlCents)} para o fornecedor + {money(500)} para a
                plataforma
              </p>
            </div>
            {done && <Check size={30} />}
          </div>
          <div className="fx-actors">
            {["Tesouraria", order.contract.name, "Auditor", "Liquidação"].map((v, i) => (
              <span key={v}>
                <b>{i + 1}</b>
                {v}
              </span>
            ))}
          </div>
          <div className="fx-details">
            <div>
              <h2>
                <ShieldCheck size={20} /> Conferência da operação
              </h2>
              {snapshot?.reports?.map((report) => (
                <article className="fx-audit" key={report.version}>
                  <strong>
                    Comprovante {report.version}:{" "}
                    {report.decision === "approved" ? "aprovado" : "reprovado"}
                  </strong>
                  {report.checks.map((c) => (
                    <p key={c.criterion} className={c.passed ? "fx-pass" : "fx-fail"}>
                      {c.passed ? "✓" : "×"} {c.criterion}
                      {c.expected != null
                        ? ` · esperado ${money(c.expected, "USD")}, recebido ${money(c.observed ?? 0, "USD")}`
                        : ""}
                    </p>
                  ))}
                </article>
              ))}
              <p className="fx-caption">
                O auditor consulta o registro do simulador. A correção altera apenas o comprovante
                da mesma operação.
              </p>
            </div>
            <div>
              <h2>O que aconteceu</h2>
              <ol className="fx-timeline">
                {snapshot?.events?.map((e) => (
                  <li key={e.id}>
                    <strong>{eventLabels[e.type] ?? e.type}</strong>
                    <span>
                      {e.actor} · {new Date(e.created_at).toLocaleTimeString("pt-BR")}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="fx-actions">
            {!["settled", "cancelled", "expired"].includes(order.status) && (
              <>
                <button
                  className="studio-primary"
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      actFxView({
                        data: {
                          ...scope,
                          orderId: order.id,
                          action:
                            order.status === "awaiting_approval"
                              ? "accept"
                              : order.status === "rejected" && order.mode === "manual"
                                ? "correct"
                                : "resume",
                        },
                      }),
                    )
                  }
                >
                  {order.status === "awaiting_approval"
                    ? "Aprovar conversão simulada"
                    : order.status === "rejected" && order.mode === "manual"
                      ? "Pedir correção"
                      : "Retomar operação"}
                </button>
                <button
                  className="studio-secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      actFxView({ data: { ...scope, orderId: order.id, action: "cancel" } }),
                    )
                  }
                >
                  Cancelar e devolver reserva
                </button>
              </>
            )}
            <button
              className="studio-secondary"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = `cambio-simulado-${order.id}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Download size={16} /> Baixar auditoria
            </button>
            <button className="studio-text-button" disabled={busy} onClick={fresh}>
              Nova operação
            </button>
          </div>
          <details>
            <summary>Custos de inferência e identificadores</summary>
            <p>Operação: {snapshot?.operation?.operation_id ?? "Ainda não emitida"}</p>
            <p>
              Modelo da explicação: {snapshot?.quote?.inference?.resolvedModel ?? "não informado"}.
              Tokens: {snapshot?.quote?.inference?.usage?.total_tokens ?? "não informados"}.
            </p>
            <p>
              Estimativa em USD: {snapshot?.quote?.inference?.estimatedCostUsd ?? "indisponível"}.
              Referência da equipe: US$ 0,15 entrada e US$ 0,60 saída por milhão. Não representa
              cobrança efetiva. Seleção, auditoria e liquidação usam regras determinísticas.
            </p>
          </details>
        </>
      )}
      {!order && snapshot?.orders?.length ? (
        <div className="fx-history">
          <h2>Operações anteriores</h2>
          {snapshot.orders.map((o) => (
            <button key={o.id} onClick={() => setOrderId(o.id)}>
              {money(o.contract.targetUsdCents, "USD")} · {labels[o.status] ?? o.status}{" "}
              <ArrowRight size={14} />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
