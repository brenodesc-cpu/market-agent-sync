import { useEffect, useRef, useState } from "react";
import { Bot, ArrowRight, Sparkles, Search, LoaderCircle, ShieldCheck } from "lucide-react";
import { AGENT_CAPABILITY, type AgentResult } from "@/lib/agent-definition";
import { runAutonomousStudioChain, runStudioAgent } from "@/lib/agent-studio.functions";
import {
  placeStudioOrder,
  executeStudioOrder,
  getStudioOrder,
  setCompanyCommercial,
} from "@/lib/studio.functions";
import type { StudioWorkspace, StudioDetails } from "@/lib/studio.types";
import { AgentOutput } from "./agent-output";

export function AgentMarket({
  workspace,
  signedIn,
  mode,
  initialCompany,
  onLogin,
  onCreate,
  onOrder,
  onRefresh,
}: {
  workspace: StudioWorkspace;
  signedIn: boolean;
  mode: "market" | "mission";
  initialCompany?: string;
  onLogin: () => void;
  onCreate: () => void;
  onOrder: (detail: StudioDetails) => void;
  onRefresh: () => Promise<void>;
}) {
  const [company, setCompany] = useState(initialCompany ?? workspace.companies[0]?.id ?? "");
  const [task, setTask] = useState(""),
    [budget, setBudget] = useState(30),
    [offerId, setOfferId] = useState("");
  const [search, setSearch] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [result, setResult] = useState<AgentResult | null>(null);
  const [chain, setChain] = useState<Awaited<ReturnType<typeof runAutonomousStudioChain>> | null>(
    null,
  );
  const request = useRef({ key: "", id: "", orderId: "" });
  const selected = workspace.companies.find((c) => c.id === company);
  const offers = workspace.offers.filter((o) => o.capability === AGENT_CAPABILITY);
  const chosen = offers.find((o) => o.id === offerId);
  const balance = workspace.accounts.find((a) => a.company_id === company)?.available_units ?? 0;
  useEffect(() => {
    if (!workspace.companies.some((c) => c.id === company))
      setCompany(workspace.companies[0]?.id ?? "");
  }, [workspace.companies, company]);
  async function run(kind: "personal" | "hire" | "autonomous") {
    if (!signedIn) {
      onLogin();
      return;
    }
    if (!company) {
      onCreate();
      return;
    }
    if (busy) return;
    setBusy(kind);
    setError("");
    const key = JSON.stringify({ kind, company, task, budget, offerId });
    if (request.current.key !== key)
      request.current = { key, id: crypto.randomUUID(), orderId: "" };
    try {
      if (kind === "autonomous") {
        const value = await runAutonomousStudioChain({
          data: { companyId: company, requestId: request.current.id, task, budget },
        });
        setChain(value);
      } else if (kind === "personal") {
        const value = await runStudioAgent({
          data: { companyId: company, requestId: request.current.id, task },
        });
        setResult(value.result);
      } else {
        if (!request.current.orderId) {
          const created = await placeStudioOrder({
            data: {
              buyerCompanyId: company,
              title: task.slice(0, 120),
              task,
              budget,
              offerVersionId: offerId || undefined,
              requestId: request.current.id,
              testFailure: false,
              autoCorrect: false,
              humanReview: true,
            },
          });
          request.current.orderId = created.orderId;
        }
        const complete = await executeStudioOrder({ data: { orderId: request.current.orderId } });
        onOrder(complete);
      }
      await onRefresh();
    } catch (e) {
      setError(
        e instanceof Error && e.message.length < 300
          ? e.message
          : "Não foi possível concluir. Confira seus pedidos antes de repetir.",
      );
      // Preserve the reserved order and show its retry/cancel controls if inference fails.
      if (request.current.orderId) {
        try {
          onOrder(await getStudioOrder({ data: { orderId: request.current.orderId } }));
        } catch {}
      }
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="studio-page agent-market">
      <div className="agent-market-title">
        <span className="studio-eyebrow">
          {mode === "market" ? "ESPECIALISTAS PARA O SEU AGENTE" : "DO PEDIDO À ENTREGA"}
        </span>
        <h1>{mode === "market" ? "Encontre o agente certo." : "O que você quer resolver?"}</h1>
        <p>
          {mode === "market"
            ? "Conheça os serviços da rede ou deixe seu agente escolher quem contratar."
            : "Dê uma meta e um orçamento. O gestor monta a cadeia, reaproveita, contrata ou cria os agentes necessários."}
        </p>
      </div>
      <div className="agent-market-columns">
        <section className="agent-request">
          <label>
            Seu agente
            <select
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                setResult(null);
                setOfferId("");
              }}
              disabled={!!busy}
            >
              <option value="" disabled>
                {signedIn ? "Crie seu primeiro agente" : "Entre para usar seus agentes"}
              </option>
              {workspace.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {mode === "mission" ? "Qual é a meta?" : "Descreva o trabalho"}
            <textarea
              maxLength={12000}
              placeholder="Preciso de uma proposta comercial para uma loja de roupas. O serviço é gestão de redes sociais, custa R$ 2.000 por mês e começa em outubro..."
              value={task}
              onChange={(e) => setTask(e.target.value)}
              disabled={!!busy}
            />
          </label>
          {mode === "mission" ? (
            <div className="agent-hire-box autonomous-run">
              <label>
                Orçamento máximo
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  disabled={!!busy}
                />
              </label>
              <small>Saldo disponível: {balance} créditos simulados.</small>
              <button
                className="studio-primary"
                disabled={!!busy || task.trim().length < 10 || !company || budget < 1}
                onClick={() => void run("autonomous")}
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                {signedIn
                  ? company
                    ? "Executar missão"
                    : "Criar meu agente"
                  : "Entrar para executar"}
              </button>
              <p>
                <ShieldCheck size={15} /> Cada agente recebe a entrega anterior. Contratações são
                verificadas antes do pagamento.
              </p>
            </div>
          ) : (
            <div className="agent-hire-box">
              <h3>
                <Sparkles size={17} /> Contratar na rede
              </h3>
              <label>
                Quem executa?
                <select
                  value={offerId}
                  onChange={(e) => setOfferId(e.target.value)}
                  disabled={!!busy}
                >
                  <option value="">Meu agente escolhe o especialista</option>
                  {offers
                    .filter((o) => o.companyId !== company)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.companyName} · {o.price} créditos
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Orçamento máximo
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  disabled={!!busy}
                />
              </label>
              <small>
                Saldo disponível: {balance} créditos simulados.
                {chosen
                  ? ` Esta oferta custa ${chosen.price}.`
                  : " O preço da oferta escolhida será reservado."}
              </small>
              <button
                className="studio-primary"
                disabled={
                  !!busy ||
                  (signedIn &&
                    !!company &&
                    (task.trim().length < 10 ||
                      !Number.isInteger(budget) ||
                      budget < 1 ||
                      budget > 10000 ||
                      (!!chosen && chosen.price > budget)))
                }
                onClick={() => void run("hire")}
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" size={16} />
                ) : (
                  <ArrowRight size={16} />
                )}{" "}
                {signedIn
                  ? company
                    ? "Contratar e executar"
                    : "Criar meu agente"
                  : "Entrar para contratar"}
              </button>
              <p>
                <ShieldCheck size={15} />O pagamento exige a verificação e o seu aceite.
              </p>
            </div>
          )}
          {busy && (
            <p role="status">
              {busy === "personal"
                ? "Seu agente está trabalhando pela NeuraLake..."
                : "O gestor está comparando, contratando e verificando..."}
            </p>
          )}
          {error && (
            <p role="alert" className="agent-error">
              {error}
            </p>
          )}
          <button className="studio-text-button" disabled={!!busy} onClick={onCreate}>
            Criar outro agente
          </button>
        </section>
        <section>
          {chain ? (
            <div className="autonomous-result">
              <span className="studio-eyebrow">CADEIA CONCLUÍDA</span>
              <h2>{chain.summary}</h2>
              <p>
                {chain.initialBudget - chain.remainingBudget} créditos reservados na rede.{" "}
                {chain.remainingBudget} disponíveis nesta missão.
              </p>
              {chain.blockedTools.length > 0 && (
                <div className="agent-error">
                  <strong>Integrações necessárias</strong>
                  <br />
                  {chain.blockedTools.join(" · ")}
                </div>
              )}
              <div className="chain-steps">
                {chain.steps.map((step, index) => (
                  <article key={`${step.role}:${index}`}>
                    <header>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{step.role}</strong>
                        <small>
                          {step.source === "network"
                            ? `Contratado: ${step.provider}`
                            : step.source === "created"
                              ? `Criado: ${step.provider}`
                              : `Interno: ${step.provider}`}
                        </small>
                      </div>
                    </header>
                    <p>{step.reason}</p>
                    <AgentOutput value={step.result} />
                    {step.order && (
                      <button className="studio-secondary" onClick={() => onOrder(step.order!)}>
                        Revisar contratação <ArrowRight size={15} />
                      </button>
                    )}
                  </article>
                ))}
              </div>
              <button
                className="studio-text-button"
                onClick={() => {
                  setChain(null);
                  request.current = { key: "", id: "", orderId: "" };
                }}
              >
                Nova missão
              </button>
            </div>
          ) : result ? (
            <>
              <div className="agent-result-heading">
                <h2>Resultado do seu agente</h2>
                <button className="studio-text-button" onClick={() => setResult(null)}>
                  Ver marketplace
                </button>
              </div>
              <AgentOutput value={result} />
              {selected?.visibility === "private" && (
                <div className="agent-commercialize">
                  <h3>Este trabalho pode virar um serviço.</h3>
                  <p>
                    Você pode oferecer este agente a outros compradores. O preço e a descrição
                    definidos na criação ficarão públicos.
                  </p>
                  <button
                    className="studio-primary"
                    disabled={!!busy}
                    onClick={async () => {
                      setBusy("publish");
                      setError("");
                      try {
                        await setCompanyCommercial({ data: { companyId: company, enabled: true } });
                        await onRefresh();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Não foi possível publicar.");
                      } finally {
                        setBusy("");
                      }
                    }}
                  >
                    Publicar no marketplace
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="agent-search">
                <Search size={17} />
                <input
                  aria-label="Buscar agentes"
                  placeholder="Buscar por especialidade..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {offers.length === 0 ? (
                <div className="agent-market-empty">
                  <Bot size={38} />
                  <h2>A rede começa com os seus agentes</h2>
                  <p>
                    Crie um especialista, teste uma tarefa e publique sua oferta. Ele aparecerá aqui
                    para receber contratações.
                  </p>
                  <button className="studio-primary" onClick={onCreate}>
                    Criar especialista
                  </button>
                </div>
              ) : (
                <div className="agent-offer-grid">
                  {offers
                    .filter((o) =>
                      `${o.companyName} ${o.title} ${o.description} ${o.category}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((o) => (
                      <article
                        key={o.id}
                        className={`studio-provider-card ${offerId === o.id ? "selected" : ""}`}
                      >
                        <div>
                          <span className="studio-provider-avatar">{o.companyName[0]}</span>
                          <span className="studio-tag">{o.category || "Especialista"}</span>
                        </div>
                        <h3>{o.companyName}</h3>
                        <strong>{o.title}</strong>
                        <p>{o.description}</p>
                        <details>
                          <summary>O que você recebe</summary>
                          <p>
                            {o.criteria
                              .map((c) =>
                                c.criterion === "Seções combinadas"
                                  ? String(c.expected)
                                  : c.criterion,
                              )
                              .join(" · ")}
                          </p>
                        </details>
                        <footer>
                          <b>
                            {o.price}
                            <small> créditos</small>
                          </b>
                          <button
                            className="studio-secondary"
                            disabled={!!busy || o.companyId === company}
                            onClick={() => {
                              setOfferId(o.id);
                              setBudget((b) => Math.max(b, o.price));
                              if (!task) setTask(o.exampleTask ?? "");
                            }}
                          >
                            {o.companyId === company
                              ? "Seu agente"
                              : offerId === o.id
                                ? "Selecionado"
                                : "Selecionar"}
                          </button>
                        </footer>
                      </article>
                    ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
