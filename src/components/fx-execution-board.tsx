import { useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleDollarSign,
  FileCheck2,
  Maximize,
  Network,
  ShieldCheck,
  Terminal,
  UserRoundCheck,
  Wallet,
} from "lucide-react";
import type { FxQuote, FxSnapshot } from "@/lib/fx-market";
import "@/financial-pitch-demo.css";

const money = (amount: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amount / 100);
const statuses: Record<string, string> = {
  reserved: "Valor reservado",
  delivered: "Comprovante recebido",
  rejected: "Entrega reprovada",
  corrected: "Comprovante corrigido",
  approved: "Auditoria aprovada",
  awaiting_approval: "Aguardando aprovação humana",
  settled: "Conversão concluída",
  cancelled: "Operação cancelada",
  expired: "Prazo encerrado",
};
export function FxExecutionBoard({
  snapshot,
  quote,
  busy,
  onApprove,
}: {
  snapshot: FxSnapshot | null;
  quote: FxQuote | null;
  busy: boolean;
  onApprove: () => void;
}) {
  const [view, setView] = useState<"flow" | "offers" | "receipt">("flow");
  const [fullscreenError, setFullscreenError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const order = snapshot?.order;
  const comparison = order ? snapshot?.quote : quote;
  const selected = order?.contract ?? comparison?.data.selected;
  const offers = comparison?.data.offers ?? [];
  const terminal = !!order && ["settled", "cancelled", "expired"].includes(order.status);
  const settled = order?.status === "settled" && !!snapshot?.ledger;
  const needsHuman = order?.mode === "manual";
  const currentReport = snapshot?.reports?.find((r) => r.version === order?.current_version);
  const currentReceipt = snapshot?.receipts?.find((r) => r.version === order?.current_version);
  const observed = currentReceipt?.body["targetUsdCents"];
  const active = !order
    ? 1
    : order.status === "reserved"
      ? 2
      : ["delivered", "corrected", "rejected"].includes(order.status)
        ? 3
        : order.status === "awaiting_approval"
          ? 4
          : order.status === "settled"
            ? 5
            : 3;
  const participants = [
    { title: "Seu agente", detail: "Objetivo e orçamento", icon: Terminal },
    { title: "NeuraMarket", detail: "Compara e negocia", icon: Network },
    {
      title: selected?.name ?? "Fornecedor",
      detail: order ? "Contrato registrado" : "Oferta selecionada",
      icon: CircleDollarSign,
    },
    { title: "Auditor", detail: "Confere o registro", icon: ShieldCheck },
    {
      title: needsHuman ? "Responsável" : "Autorização",
      detail: needsHuman ? "Revisão humana final" : "Permissão inicial",
      icon: UserRoundCheck,
    },
    {
      title: "Carteira USD",
      detail: settled ? "Valor disponibilizado" : "Aguardando conclusão",
      icon: Wallet,
    },
  ];
  const explanation = !order
    ? "As condições abaixo foram devolvidas pelo servidor para esta cotação."
    : order.status === "awaiting_approval"
      ? "O auditor conferiu a entrega. Revise os relatórios abaixo e autorize a conversão simulada."
      : order.status === "rejected"
        ? "A entrega não passou na verificação. O dinheiro continua reservado. Confira o relatório e peça correção ou cancele."
        : settled
          ? "A movimentação foi registrada no banco. O recibo separa o valor do fornecedor da taxa da plataforma."
          : terminal
            ? "Esta operação foi encerrada sem pagamento. Consulte o histórico para ver a devolução da reserva."
            : "O painel acompanha os registros deste pedido. Os relatórios e os saldos são devolvidos pelo servidor.";
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (root.current?.requestFullscreen) await root.current.requestFullscreen();
      else setFullscreenError("Use a tela cheia do navegador.");
    } catch {
      setFullscreenError("Use a tela cheia do navegador.");
    }
  }
  return (
    <section
      className="nm-financial-demo fd-embedded"
      ref={root}
      aria-label="Execução da contratação"
    >
      <header className="fd-header">
        <span className="fd-brand">
          <Network size={22} /> Neura<span>Market</span>
        </span>
        <span className="fd-badge">Operação do aplicativo · Dinheiro simulado</span>
        <button onClick={() => void fullscreen()} aria-label="Apresentar contratação em tela cheia">
          <Maximize size={18} />
        </button>
      </header>
      <div className="fd-main">
        <div className="fd-intro">
          <div>
            <p className="fd-eyebrow">ASSESSOR DE COMPRAS PARA AGENTES</p>
            <h2>
              {order
                ? (statuses[order.status] ?? order.status)
                : "Ofertas recebidas para esta missão"}
            </h2>
          </div>
          <span className="fd-record-id">
            {order
              ? `Pedido ${order.id.slice(0, 8)}`
              : comparison
                ? `Cotação ${comparison.id.slice(0, 8)}`
                : "Aguardando cotação"}
          </span>
        </div>
        {selected && (
          <div className="fd-mission">
            <div>
              <span className="fd-label">OBJETIVO</span>
              <strong>{money(selected.targetUsdCents, "USD")}</strong>
              <span>na carteira da empresa</span>
            </div>
            <div>
              <span className="fd-label">LIMITE AUTORIZADO</span>
              <strong>
                {money(order?.contract.maxTotalBrlCents ?? comparison!.input.maxTotalBrlCents)}
              </strong>
              <span>taxas incluídas</span>
            </div>
            <div>
              <span className="fd-label">PRAZO MÁXIMO</span>
              <strong>
                {order?.contract.maxSettlementMinutes ?? comparison?.input.maxSettlementMinutes} min
              </strong>
              <span>conforme o contrato</span>
            </div>
            <div className="fd-money-status">
              <span className="fd-label">
                {settled
                  ? "CUSTO TOTAL"
                  : order && !terminal
                    ? "RESERVADO NESTE PEDIDO"
                    : "CUSTO COTADO"}
              </span>
              <strong>{money(selected.totalBrlCents)}</strong>
              <span>
                {settled
                  ? `${money(snapshot!.ledger!.platform_fee_brl)} de taxa`
                  : terminal
                    ? "Reserva devolvida"
                    : "Pagamento pendente"}
              </span>
            </div>
          </div>
        )}
        <div className="fd-view-bar">
          <nav aria-label="Visões da contratação">
            <button aria-pressed={view === "flow"} onClick={() => setView("flow")}>
              <Network size={16} /> Fluxo
            </button>
            <button aria-pressed={view === "offers"} onClick={() => setView("offers")}>
              <CircleDollarSign size={16} /> Ofertas
            </button>
            <button aria-pressed={view === "receipt"} onClick={() => setView("receipt")}>
              <FileCheck2 size={16} /> Recibo
            </button>
          </nav>
          <span className="fd-stage-label">
            {order ? statuses[order.status] : "Cotação registrada"}
          </span>
        </div>
        <div className="fd-canvas">
          {view === "flow" && (
            <>
              <div className="fd-chain">
                {participants.map((p, i) => {
                  const Icon = p.icon;
                  return (
                    <div
                      className={`fd-party ${i === active && !terminal ? "active" : ""} ${i < active && !["cancelled", "expired"].includes(order?.status ?? "") ? "complete" : ""} ${i === 4 ? "human" : ""}`}
                      key={i}
                    >
                      <div className="fd-party-top">
                        <Icon size={23} />
                        {i < active ? (
                          <Check size={14} />
                        ) : (
                          <span className="fd-node-state">0{i + 1}</span>
                        )}
                      </div>
                      <strong>{p.title}</strong>
                      <span>{p.detail}</span>
                      {i < 5 && <ArrowRight className="fd-edge" size={16} />}
                    </div>
                  );
                })}
              </div>
              <div className="fd-flow-bottom">
                <div className="fd-market-mini">
                  <span className="fd-label">OFERTAS DO SERVIDOR</span>
                  {offers.map((o) => (
                    <div
                      key={o.supplierId}
                      className={
                        o.supplierId === selected?.supplierId
                          ? "fd-mini-selected"
                          : !o.eligible
                            ? "fd-mini-rejected"
                            : ""
                      }
                    >
                      <b>{o.name}</b>
                      <span>{money(o.totalBrlCents)}</span>
                      <small>{o.settlementMinutes} min</small>
                      <span className="fd-mini-verdict">
                        {o.supplierId === selected?.supplierId ? "Selecionado" : o.reason}
                      </span>
                    </div>
                  ))}
                  <small>Preços totais com a taxa da plataforma.</small>
                </div>
                <div
                  className={`fd-proof ${currentReport?.decision === "rejected" ? "error" : currentReport?.decision === "approved" ? "verified" : ""}`}
                >
                  <span className="fd-label">
                    COMPROVANTE {order?.current_version || "PENDENTE"}
                  </span>
                  <div className="fd-proof-values">
                    <div>
                      <small>Contrato</small>
                      <strong>
                        {selected ? money(selected.targetUsdCents, "USD") : "Aguardando"}
                      </strong>
                    </div>
                    <ArrowRight size={20} />
                    <div>
                      <small>Documento recebido</small>
                      <strong>
                        {typeof observed === "number" ? money(observed, "USD") : "Pendente"}
                      </strong>
                    </div>
                  </div>
                  <p>
                    {currentReport
                      ? currentReport.decision === "approved"
                        ? "Critérios conferidos com o registro da operação."
                        : "A verificação encontrou uma divergência."
                      : "Aguardando a entrega e a verificação do servidor."}
                  </p>
                </div>
              </div>
            </>
          )}
          {view === "offers" && (
            <div className="fd-offers-grid">
              {offers.map((offer) => (
                <article
                  key={offer.supplierId}
                  className={`fd-offer ${offer.supplierId === selected?.supplierId ? "selected" : !offer.eligible ? "rejected" : ""}`}
                >
                  <div className="fd-offer-heading">
                    <span>FORNECEDOR SIMULADO</span>
                    <CircleDollarSign size={22} />
                  </div>
                  <h3>{offer.name}</h3>
                  <div className="fd-offer-price">{money(offer.totalBrlCents)}</div>
                  <p>Até {offer.settlementMinutes} minutos · taxas incluídas</p>
                  <div className="fd-offer-negotiation">
                    <span>Preço anunciado: {money(offer.listTotalBrlCents)}</span>
                    <strong>Redução: {money(offer.listTotalBrlCents - offer.totalBrlCents)}</strong>
                  </div>
                  <p className="fd-offer-reason">{offer.reason}</p>
                </article>
              ))}
              <p className="fd-offers-note">
                {comparison?.inference?.summary ?? comparison?.data.policy}
              </p>
            </div>
          )}
          {view === "receipt" &&
            (settled ? (
              <div className="fd-receipt-layout">
                <div className="fd-receipt-story">
                  <span className="fd-eyebrow">MOVIMENTAÇÃO CONFIRMADA NO BANCO</span>
                  <h2>Conversão concluída.</h2>
                  <p>O extrato desta operação registra o valor entregue e a taxa da NeuraMarket.</p>
                  <div className="fd-receipt-status">
                    <ShieldCheck size={20} />
                    {needsHuman
                      ? "Auditoria e aceite humano concluídos"
                      : "Auditoria e autorização inicial conferidas"}
                  </div>
                </div>
                <article className="fd-receipt paid">
                  <div className="fd-receipt-heading">
                    <Network size={20} />
                    <b>NeuraMarket</b>
                    <span>CONCLUÍDO</span>
                  </div>
                  <span className="fd-label">VALOR DISPONIBILIZADO</span>
                  <h3>{money(snapshot!.ledger!.target_usd, "USD")}</h3>
                  <dl>
                    <div>
                      <dt>Fornecedor</dt>
                      <dd>{order!.contract.name}</dd>
                    </div>
                    <div>
                      <dt>Conversão</dt>
                      <dd>{money(snapshot!.ledger!.principal_brl)}</dd>
                    </div>
                    <div className="fd-fee">
                      <dt>Receita NeuraMarket</dt>
                      <dd>{money(snapshot!.ledger!.platform_fee_brl)}</dd>
                    </div>
                    <div className="fd-total">
                      <dt>Total</dt>
                      <dd>
                        {money(
                          snapshot!.ledger!.principal_brl + snapshot!.ledger!.platform_fee_brl,
                        )}
                      </dd>
                    </div>
                  </dl>
                  <p>Valores fictícios. Operação persistida no simulador.</p>
                  <span className="fd-receipt-id">{snapshot?.operation?.operation_id}</span>
                </article>
              </div>
            ) : (
              <div className="fd-pending-receipt">
                <Wallet size={35} />
                <h3>A conclusão ainda não foi registrada.</h3>
                <p>
                  {order?.status === "awaiting_approval"
                    ? "O recibo fica disponível depois da sua aprovação e da confirmação do servidor."
                    : "Acompanhe as ofertas e a auditoria na visão Fluxo."}
                </p>
              </div>
            ))}
        </div>
        <section
          className={`fd-narration ${order?.status === "awaiting_approval" ? "waiting" : ""}`}
        >
          <div>
            <h3>{order ? statuses[order.status] : "Seleção por prazo e custo total"}</h3>
            <p>{explanation}</p>
          </div>
          {order?.status === "awaiting_approval" && (
            <button className="fd-approve" disabled={busy} onClick={onApprove}>
              <UserRoundCheck size={18} />
              {busy ? "Registrando…" : "Aprovar conversão simulada"}
            </button>
          )}
        </section>
        {!!snapshot?.reports?.length && (
          <div className="fd-record-reports">
            {snapshot.reports.map((report) => (
              <article key={report.version} className={report.decision}>
                <strong>
                  Comprovante {report.version} ·{" "}
                  {report.decision === "approved" ? "Aprovado" : "Reprovado"}
                </strong>
                {report.checks.map((check) => (
                  <p key={check.criterion}>
                    {check.passed ? "✓" : "×"} {check.criterion}
                    {check.expected != null
                      ? `: esperado ${money(check.expected, "USD")}, recebido ${typeof check.observed === "number" ? money(check.observed, "USD") : "não informado"}`
                      : ""}
                  </p>
                ))}
              </article>
            ))}
          </div>
        )}
        <p className="fd-data-source">
          {fullscreenError ||
            "Dados do pedido e da auditoria no servidor. Instituições e dinheiro são simulados."}
        </p>
      </div>
    </section>
  );
}
