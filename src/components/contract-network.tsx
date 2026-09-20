import { Bot, Network, ScanLine, ShieldCheck, Wallet, ArrowUpRight, Clock3 } from "lucide-react";
import { browserQuote } from "@/lib/browser-qa";
import type { StudioDetails } from "@/lib/studio.types";
import "@/contract-network.css";

export function ContractNetwork({
  order,
  budget,
  connected,
  onConnect,
  preview = false,
}: {
  order: StudioDetails | null;
  budget: number;
  connected: boolean;
  onConnect?: () => void;
  preview?: boolean;
}) {
  const status = order?.order.status;
  const paid = status === "settled";
  const ended = ["cancelled", "expired"].includes(status ?? "");
  const passed = ["accepted", "settled"].includes(status ?? "");
  const rejected = status === "revision_requested";
  const running = ["contracted", "in_progress", "delivered", "verifying"].includes(status ?? "");
  const quote = browserQuote(order?.order.budget_cap_units ?? budget);
  const market = order?.order.brief?.market;
  const offers = market
    ? market.offers.map((o) => ({
        ...o,
        estimatedTime: `≈ ${o.estimatedMs / 1000} s`,
        chosen: o.id === order?.contract.offer_version_id,
      }))
    : quote.offers.map((o) => ({ ...o, chosen: o.eligible }));
  const automatic = order && !order.contract.requires_human_review;
  const price = order?.contract.price_units ?? quote.price;
  const fee = order ? Math.floor((price * order.contract.commission_bps) / 10000) : quote.fee;
  const events = [...(order?.events ?? [])].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  const source =
    order?.order.brief?.source === "mcp" ? "MCP / API" : order ? "Estúdio" : "MCP / API";
  return (
    <div className={`contract-network${preview ? " is-preview" : ""}`}>
      <div className="network-toolbar">
        <div>
          <span className={`network-dot ${running ? "running" : ""}`} />
          <strong>{preview ? "Uma contratação, por dentro" : "Mapa da contratação"}</strong>
          <span className="network-tag">{preview ? "PRÉVIA" : "CRÉDITOS SIMULADOS"}</span>
        </div>
        {onConnect && (
          <button type="button" className="network-connect" onClick={onConnect}>
            Conectar agente <ArrowUpRight size={15} />
          </button>
        )}
      </div>
      <div className="network-workspace">
        <div
          className="network-canvas"
          aria-label="Relações entre comprador, assessor, fornecedores e auditor"
        >
          <div className="network-column buyer-column">
            <span className="network-lane">01 · NECESSIDADE</span>
            <article className={`network-node buyer ${order ? "node-done" : ""}`}>
              <div className="node-icon">
                <Bot size={22} />
              </div>
              <span className="node-kicker">AGENTE COMPRADOR</span>
              <h3>Criador de sites</h3>
              <p>
                {order?.order.brief?.task ??
                  "Preciso testar meu formulário no computador e no celular."}
              </p>
              <footer>
                <span>{source}</span>
                <b>Teto {order?.order.budget_cap_units ?? budget} cr</b>
              </footer>
            </article>
          </div>
          <div className="network-column advisor-column">
            <span className="network-lane">02 · DECISÃO</span>
            <article className="network-node assessor">
              <div className="node-icon">
                <Network size={22} />
              </div>
              <span className="node-kicker">ASSESSOR</span>
              <h3>NeuraMarket</h3>
              <p>{order ? order.order.selected_reason || quote.reason : quote.reason}</p>
              <footer>
                <span>{order ? "Escolha registrada" : "Comparação de ofertas"}</span>
                <b>{offers.length} opções</b>
              </footer>
            </article>
            <div className="network-decision-note">
              Cobertura primeiro.
              <br />
              Preço dentro do orçamento.
            </div>
          </div>
          <div className="network-column offers-column">
            <span className="network-lane">03 · FORNECEDORES</span>
            {offers.map((offer) => (
              <article
                key={offer.name}
                className={`network-node supplier ${offer.chosen ? "chosen" : "excluded"}`}
              >
                <div className="supplier-heading">
                  <ScanLine size={18} />
                  <h3>{offer.name}</h3>
                  <b>
                    {offer.price}
                    <small> cr</small>
                  </b>
                </div>
                <p>{offer.coverage}</p>
                <div className="supplier-time">
                  <Clock3 size={12} />
                  {offer.estimatedTime} <span>estimativa</span>
                </div>
                <footer>
                  <span>
                    {offer.chosen
                      ? order
                        ? "Contratado"
                        : "Compatível"
                      : offer.eligible
                        ? "Outra opção elegível"
                        : "Fora dos critérios"}
                  </span>
                  {offer.chosen && <span className="supplier-selected">✓</span>}
                </footer>
              </article>
            ))}
            <small className="network-reputation">
              Reputação de mercado: ainda sem histórico suficiente.
            </small>
          </div>
          <div className="network-column audit-column">
            <span className="network-lane">04 · GARANTIA</span>
            <article
              className={`network-node audit ${rejected ? "node-blocked" : passed ? "node-done" : ""}`}
            >
              <div className="node-icon">
                <ShieldCheck size={21} />
              </div>
              <h3>Auditor</h3>
              <p>
                {ended
                  ? "Contratação encerrada"
                  : rejected
                    ? "A entrega não cobre o contrato. Pagamento bloqueado."
                    : passed
                      ? `Versão ${order?.order.current_delivery_version} aprovada. Evidências conferidas.`
                      : running
                        ? "Aguardando evidências do executor."
                        : "Confere cada critério do contrato."}
              </p>
              <footer>
                <span>
                  {rejected ? "Correção necessária" : passed ? "Verificado" : "Desktop + mobile"}
                </span>
              </footer>
            </article>
            <div className={`network-settlement ${paid ? "is-paid" : ""}`}>
              <Wallet size={17} />
              <div>
                <strong>
                  {paid
                    ? `${price - fee} fornecedor + ${fee} taxa`
                    : ended
                      ? "Reserva encerrada"
                      : order
                        ? `${price} cr protegidos`
                        : "Pagamento condicionado"}
                </strong>
                <span>
                  {paid
                    ? "Pagamento concluído"
                    : passed
                      ? automatic
                        ? "Liquidação automática em andamento"
                        : "Aguarda seu aceite"
                      : automatic
                        ? "Verificação + autorização prévia"
                        : "Verificação + aceite humano"}
                </span>
              </div>
            </div>
          </div>
        </div>
        {!preview && (
          <aside className="network-activity" aria-label="Atividade registrada">
            <header>
              <strong>Atividade</strong>
              <span>{events.length} eventos</span>
            </header>
            {events.length ? (
              <ol>
                {events.slice(0, 12).map((e) => (
                  <li key={e.id}>
                    <span className="activity-marker" />
                    <div>
                      <div className="activity-meta">
                        <b>{e.actor_label}</b>
                        <time dateTime={e.created_at}>
                          {new Date(e.created_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </time>
                      </div>
                      <p>{e.result}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="activity-empty">
                <Network size={27} />
                <strong>{connected ? "Pronto para receber" : "Conecte seu agente"}</strong>
                <p>As decisões e entregas aparecem aqui conforme são registradas.</p>
              </div>
            )}
            <div className="activity-footnote">
              {market
                ? "Negociação conforme as políticas dos fornecedores"
                : "Ofertas cadastradas · Valores de demonstração"}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
