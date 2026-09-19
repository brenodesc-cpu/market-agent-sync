import { useEffect, useRef, useState } from "react";
import {
  Bot,
  ArrowRight,
  Sparkles,
  Search,
  LoaderCircle,
  ShieldCheck,
  Network,
  WalletCards,
  CircleAlert,
  RotateCcw,
  Building2,
} from "lucide-react";
import { AGENT_CAPABILITY, type AgentResult } from "@/lib/agent-definition";
import {
  advanceAutonomousStudioChain,
  briefAutonomousStudioMission,
  getAutonomousStudioChain,
  runStudioAgent,
  startAutonomousStudioChain,
} from "@/lib/agent-studio.functions";
import type { MissionBriefAnswer, MissionBriefState } from "@/lib/mission-brief";
import {
  placeStudioOrder,
  executeStudioOrder,
  getStudioOrder,
  setCompanyCommercial,
} from "@/lib/studio.functions";
import type { StudioWorkspace, StudioDetails } from "@/lib/studio.types";
import { AgentOutput } from "./agent-output";

type AutonomousChain = NonNullable<Awaited<ReturnType<typeof getAutonomousStudioChain>>> & {
  leaseUntil?: string | null;
};

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
  const [loadingChain, setLoadingChain] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [chain, setChain] = useState<AutonomousChain | null>(null);
  const [brief, setBrief] = useState<MissionBriefState | null>(null);
  const [briefHistory, setBriefHistory] = useState<MissionBriefAnswer[]>([]);
  const [briefAnswers, setBriefAnswers] = useState<string[]>([]);
  const request = useRef({ key: "", id: "", orderId: "" });
  const advancing = useRef(false);
  const selected = workspace.companies.find((c) => c.id === company);
  const offers = workspace.offers.filter((o) => o.capability === AGENT_CAPABILITY);
  const chosen = offers.find((o) => o.id === offerId);
  const balance = workspace.accounts.find((a) => a.company_id === company)?.available_units ?? 0;
  const missionOverBudget = Boolean(company && Number.isFinite(budget) && budget > balance);
  const unansweredBrief = Boolean(
    brief && !brief.ready && brief.questions.some((_, index) => !briefAnswers[index]?.trim()),
  );
  const leaseActive = Boolean(
    chain &&
    (chain.status === "planning" || chain.status === "running") &&
    chain.leaseUntil &&
    Date.parse(chain.leaseUntil) > Date.now(),
  );
  const firstOrderAwaitingReview =
    chain?.steps.find((step) => step.order && step.order.order.status !== "settled")?.order ?? null;
  useEffect(() => {
    if (!workspace.companies.some((c) => c.id === company))
      setCompany(workspace.companies[0]?.id ?? "");
  }, [workspace.companies, company]);
  useEffect(() => {
    if (mode !== "mission" || !signedIn || !company) {
      setLoadingChain(false);
      return;
    }
    let current = true;
    setLoadingChain(true);
    void getAutonomousStudioChain({ data: { companyId: company } })
      .then((saved) => {
        if (!current) return;
        setChain(saved);
        if (saved) request.current = { key: "", id: saved.requestId, orderId: "" };
      })
      .catch((reason) => {
        if (current)
          setError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível recuperar a última missão.",
          );
      })
      .finally(() => {
        if (current) setLoadingChain(false);
      });
    return () => {
      current = false;
    };
  }, [company, mode, signedIn]);
  useEffect(() => {
    if (
      mode !== "mission" ||
      !signedIn ||
      !company ||
      !chain ||
      busy ||
      (chain.status !== "planning" && chain.status !== "running")
    )
      return;
    const timer = window.setInterval(() => {
      void getAutonomousStudioChain({
        data: { companyId: company, requestId: chain.requestId },
      })
        .then((saved) => {
          if (saved) setChain(saved);
        })
        .catch(() => {});
    }, 4000);
    return () => window.clearInterval(timer);
  }, [busy, chain, company, mode, signedIn]);

  useEffect(() => {
    if (
      mode !== "mission" ||
      !signedIn ||
      !company ||
      !chain ||
      loadingChain ||
      busy ||
      leaseActive ||
      (chain.status !== "planning" && chain.status !== "running")
    )
      return;
    void advanceChain(company, chain.requestId, "autonomous");
  }, [busy, chain, company, leaseActive, loadingChain, mode, signedIn]);

  async function advanceChain(
    missionCompany: string,
    requestId: string,
    label: "autonomous" | "resume" | "review",
  ) {
    if (advancing.current) return;
    advancing.current = true;
    setBusy(label);
    setError("");
    try {
      let snapshot = await getAutonomousStudioChain({
        data: { companyId: missionCompany, requestId },
      });
      if (!snapshot) throw new Error("A missão salva não foi encontrada.");
      setChain(snapshot);
      for (let unit = 0; unit < 10; unit++) {
        if (snapshot.status === "completed") break;
        if (snapshot.status === "awaiting_review" && (label !== "review" || unit > 0)) break;
        const reservedUntil = snapshot.leaseUntil ? Date.parse(snapshot.leaseUntil) : 0;
        if (
          (snapshot.status === "planning" || snapshot.status === "running") &&
          reservedUntil > Date.now()
        )
          break;
        snapshot = await advanceAutonomousStudioChain({
          data: { companyId: missionCompany, requestId },
        });
        setChain(snapshot);
        if (
          snapshot.status === "completed" ||
          snapshot.status === "awaiting_review" ||
          snapshot.status === "failed"
        )
          break;
      }
      await onRefresh();
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message.length < 300
          ? reason.message
          : "A missão continua salva. Tente retomá-la novamente.",
      );
      try {
        setChain(
          await getAutonomousStudioChain({
            data: { companyId: missionCompany, requestId },
          }),
        );
      } catch {}
    } finally {
      advancing.current = false;
      setBusy("");
    }
  }

  async function resumeChain() {
    if (!chain || busy || leaseActive) return;
    await advanceChain(company, chain.requestId, "resume");
  }

  async function refreshAfterReview() {
    if (!chain || busy) return;
    await advanceChain(company, chain.requestId, "review");
  }

  function updateTask(value: string) {
    setTask(value);
    setBrief(null);
    setBriefHistory([]);
    setBriefAnswers([]);
  }

  async function alignMission() {
    if (!signedIn) {
      onLogin();
      return;
    }
    if (!company) {
      onCreate();
      return;
    }
    if (busy || unansweredBrief) return;
    const newAnswers =
      brief && !brief.ready
        ? brief.questions.map((question, index) => ({
            question,
            answer: briefAnswers[index]!.trim(),
          }))
        : [];
    const answers = [...briefHistory, ...newAnswers];
    const round = brief && !brief.ready ? brief.round + 1 : 0;
    setBusy("brief");
    setError("");
    try {
      const value = await briefAutonomousStudioMission({
        data: { companyId: company, objective: task, answers, round },
      });
      setBriefHistory(answers);
      setBrief(value);
      setBriefAnswers(value.questions.map(() => ""));
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message.length < 300
          ? reason.message
          : "O Agente Zero não conseguiu analisar o briefing. Tente novamente.",
      );
    } finally {
      setBusy("");
    }
  }

  async function run(kind: "personal" | "hire" | "autonomous", autonomousTask?: string) {
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
    if (kind === "autonomous") setChain(null);
    const requestedTask = kind === "autonomous" ? (autonomousTask ?? task) : task;
    const key = JSON.stringify({ kind, company, task: requestedTask, budget, offerId });
    if (request.current.key !== key)
      request.current = { key, id: crypto.randomUUID(), orderId: "" };
    try {
      if (kind === "autonomous") {
        const value = await startAutonomousStudioChain({
          data: { companyId: company, requestId: request.current.id, task: requestedTask, budget },
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
      if (kind === "autonomous") {
        try {
          setChain(
            await getAutonomousStudioChain({
              data: { companyId: company, requestId: request.current.id },
            }),
          );
        } catch {}
      }
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
    <div className={`studio-page agent-market ${mode === "mission" ? "mission-mode" : ""}`}>
      <div className="agent-market-title">
        <span className="studio-eyebrow">
          {mode === "market" ? "ESPECIALISTAS PARA O SEU AGENTE" : "NOVA MISSÃO"}
        </span>
        <h1>
          {mode === "market"
            ? "Encontre o agente certo."
            : "Descreva uma meta. A equipe se monta sozinha."}
        </h1>
        <p>
          {mode === "market"
            ? "Conheça os serviços da rede ou deixe seu agente escolher quem contratar."
            : "Escreva o resultado que espera. A plataforma divide o trabalho, escolhe quem vai fazê-lo e reúne as entregas."}
        </p>
      </div>
      <div className="agent-market-columns">
        <section className="agent-request">
          <label className={mode === "mission" ? "mission-owner" : undefined}>
            {mode === "mission" ? "Empresa responsável" : "Seu agente"}
            <select
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                setResult(null);
                setChain(null);
                setBrief(null);
                setBriefHistory([]);
                setBriefAnswers([]);
                setOfferId("");
                request.current = { key: "", id: "", orderId: "" };
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
          {mode === "mission" && signedIn && !company && (
            <div className="mission-first-company">
              <span>
                <Building2 size={22} />
              </span>
              <div>
                <strong>Crie a empresa que vai cuidar das suas missões</strong>
                <p>Você define o que ela faz. Depois, ela pode montar e contratar uma equipe.</p>
              </div>
              <button className="studio-primary" onClick={onCreate}>
                Criar primeira empresa <ArrowRight size={15} />
              </button>
            </div>
          )}
          <label
            className={mode === "mission" ? "mission-goal" : undefined}
            hidden={mode === "mission" && signedIn && !company}
          >
            {mode === "mission" ? "Qual é a meta?" : "Descreva o trabalho"}
            <textarea
              maxLength={mode === "mission" ? 6000 : 12000}
              placeholder={
                mode === "mission"
                  ? "Ex.: Crie uma landing page para lançar meu curso de finanças. Quero posicionamento, copy, HTML/CSS e uma prévia para aprovação."
                  : "Preciso de uma proposta comercial para uma loja de roupas. O serviço é gestão de redes sociais, custa R$ 2.000 por mês e começa em outubro..."
              }
              value={task}
              onChange={(e) => updateTask(e.target.value)}
              disabled={!!busy}
            />
          </label>
          {mode === "mission" && brief && !brief.ready && (
            <div className="mission-briefing" aria-live="polite">
              <header>
                <span>
                  <Bot size={17} /> Agente Zero
                </span>
                <small>Perguntas {Math.min(brief.round + 1, 3)} de 3</small>
              </header>
              <p>{brief.understanding}</p>
              <div className="mission-briefing-questions">
                {brief.questions.map((question, index) => (
                  <label key={`${brief.round}:${question}`}>
                    {question}
                    <textarea
                      maxLength={2000}
                      value={briefAnswers[index] ?? ""}
                      onChange={(event) =>
                        setBriefAnswers((current) =>
                          brief.questions.map((_, answerIndex) =>
                            answerIndex === index
                              ? event.target.value
                              : (current[answerIndex] ?? ""),
                          ),
                        )
                      }
                      disabled={!!busy}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          {mode === "mission" && brief?.ready && (
            <div className="mission-brief-ready" aria-live="polite">
              <span>
                <ShieldCheck size={17} /> Briefing alinhado
              </span>
              <p>{brief.understanding}</p>
            </div>
          )}
          {mode === "mission" ? (
            <div className="mission-composer" hidden={signedIn && !company}>
              <div className="mission-budget">
                <WalletCards size={17} />
                <label>
                  Orçamento máximo
                  <span>
                    <input
                      aria-label="Orçamento máximo em créditos"
                      type="number"
                      min={1}
                      max={10000}
                      value={budget}
                      onChange={(e) => setBudget(Number(e.target.value))}
                      disabled={!!busy}
                    />
                    créditos
                  </span>
                </label>
                <small className={missionOverBudget ? "over-budget" : undefined} aria-live="polite">
                  {missionOverBudget
                    ? `Saldo insuficiente: ${balance} disponíveis`
                    : `${balance} disponíveis`}
                </small>
              </div>
              <button
                className="studio-primary"
                disabled={
                  !!busy ||
                  (!!company &&
                    (task.trim().length < 10 ||
                      !Number.isInteger(budget) ||
                      budget < 1 ||
                      budget > 10000 ||
                      missionOverBudget ||
                      unansweredBrief))
                }
                onClick={() =>
                  void (brief?.ready
                    ? run("autonomous", brief.consolidatedBrief ?? task)
                    : alignMission())
                }
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                {signedIn
                  ? company
                    ? brief?.ready
                      ? "Iniciar missão"
                      : brief
                        ? "Enviar respostas"
                        : "Conversar com o Agente Zero"
                    : "Criar meu agente"
                  : "Entrar para alinhar a missão"}
                {!busy && <ArrowRight size={16} />}
              </button>
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
          {mode === "mission" &&
            (!signedIn || !!company) &&
            !chain &&
            !brief &&
            !busy &&
            !loadingChain && (
              <div className="mission-examples" aria-label="Exemplos de metas">
                <span>Experimente:</span>
                <button
                  type="button"
                  onClick={() =>
                    updateTask(
                      "Crie uma landing page para lançar meu curso de finanças, com posicionamento, copy, HTML/CSS e uma prévia para aprovação.",
                    )
                  }
                >
                  Landing page de lançamento
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateTask(
                      "Analise o mercado de cafeterias por assinatura e entregue uma proposta comercial completa.",
                    )
                  }
                >
                  Pesquisa e proposta
                </button>
              </div>
            )}
          {mode === "mission" && loadingChain && (
            <div className="mission-restoring" role="status">
              <LoaderCircle className="animate-spin" size={15} />
              Recuperando a última missão desta empresa...
            </div>
          )}
          {busy && (
            <div className="mission-running" role="status">
              <LoaderCircle className="animate-spin" size={18} />
              <div>
                <strong>
                  {busy === "resume"
                    ? "Retomando do ponto salvo"
                    : busy === "review"
                      ? "Conferindo sua revisão"
                      : busy === "brief"
                        ? "Agente Zero está entendendo sua meta"
                        : chain
                          ? "Executando a próxima etapa"
                          : "Preparando sua missão"}
                </strong>
                <span>
                  {busy === "brief"
                    ? "Ele verifica se falta alguma decisão antes de montar a equipe."
                    : chain?.steps.length
                      ? `${chain.steps.filter((step) => step.status === "completed").length} de ${chain.steps.length} etapas concluídas.`
                      : "A equipe está organizando o trabalho."}
                </span>
                {chain && chain.steps.length > 0 && (
                  <ol aria-label="Progresso da missão">
                    {chain.steps.map((step, index) => (
                      <li className={step.status} key={`${step.role}:${index}`}>
                        {step.role}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="agent-error">
              {error}
            </p>
          )}
          {mode === "market" && (
            <button className="studio-text-button" disabled={!!busy} onClick={onCreate}>
              Criar outro agente
            </button>
          )}
        </section>
        <section>
          {chain ? (
            <div className={`autonomous-result mission-${chain.status}`}>
              <div className="mission-result-status">
                <span className="studio-eyebrow">
                  {chain.status === "planning"
                    ? "PREPARANDO A MISSÃO"
                    : chain.status === "running"
                      ? "AGENTES TRABALHANDO"
                      : chain.status === "awaiting_review"
                        ? "ENTREGAS PRONTAS PARA REVISÃO"
                        : chain.status === "failed"
                          ? "MISSÃO INTERROMPIDA"
                          : "MISSÃO CONCLUÍDA"}
                </span>
                {chain.status === "completed" ? (
                  <span>
                    <ShieldCheck size={14} /> Formato das entregas conferido
                  </span>
                ) : chain.status === "awaiting_review" ? (
                  <span className="review">
                    <CircleAlert size={14} /> Seu aceite libera o pagamento
                  </span>
                ) : chain.status === "failed" ? (
                  <span className="failed">
                    <CircleAlert size={14} /> O trabalho concluído ficou salvo
                  </span>
                ) : (
                  <span className="running">
                    <LoaderCircle className="animate-spin" size={14} /> Atualização salva
                  </span>
                )}
              </div>
              <h2>{chain.summary}</h2>
              <div className="mission-budget-summary">
                <span>
                  <strong>{chain.initialBudget - chain.remainingBudget}</strong>
                  créditos comprometidos
                </span>
                <span>
                  <strong>{chain.remainingBudget}</strong>
                  créditos restantes
                </span>
                <span>
                  <strong>{chain.steps.length}</strong>
                  especialistas usados
                </span>
              </div>
              {chain.errorMessage && (
                <div className="mission-failure">
                  <strong>O trabalho parou nesta etapa</strong>
                  <span>{chain.errorMessage}</span>
                </div>
              )}
              {chain.blockedTools.length > 0 && (
                <div className="mission-blocked-tools">
                  <strong>Falta conectar para concluir toda a meta</strong>
                  <span>{chain.blockedTools.join(" · ")}</span>
                </div>
              )}
              <div className="chain-steps">
                {chain.steps.length === 0 && (
                  <div className="mission-steps-empty">
                    <LoaderCircle className="animate-spin" size={17} />A equipe está definindo as
                    etapas da missão.
                  </div>
                )}
                {chain.steps.map((step, index) => (
                  <article className={`mission-step-${step.status}`} key={`${step.role}:${index}`}>
                    <header>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{step.role}</strong>
                        <div className="mission-step-labels">
                          <small className={`mission-step-status ${step.status}`}>
                            {step.status === "completed"
                              ? "Concluído"
                              : step.status === "awaiting_review"
                                ? "Aguardando seu aceite"
                                : step.status === "running"
                                  ? "Trabalhando"
                                  : step.status === "failed"
                                    ? "Interrompido"
                                    : "Aguardando"}
                          </small>
                          {step.source && (
                            <small className={`chain-source ${step.source}`}>
                              {step.source === "network"
                                ? `Escolhido no marketplace: ${step.provider}`
                                : step.source === "created"
                                  ? `Criado para esta tarefa: ${step.provider}`
                                  : `Da sua empresa: ${step.provider}`}
                            </small>
                          )}
                        </div>
                      </div>
                    </header>
                    {step.competition.length > 0 && (
                      <div className="chain-competition">
                        <span>
                          {step.competition.length} especialistas enviaram propostas ao mesmo tempo
                        </span>
                        <div>
                          {step.competition.map((proposal) => (
                            <article
                              className={proposal.selected ? "selected" : undefined}
                              key={proposal.offerVersionId}
                            >
                              <header>
                                <strong>{proposal.provider}</strong>
                                <small>{proposal.selected ? "Vencedor" : "Proposta"}</small>
                              </header>
                              <p>{proposal.approach}</p>
                              <footer>
                                <span>{proposal.price} créditos</span>
                                <span>{proposal.viability}% de chance de atender</span>
                                <span>
                                  {proposal.approved + proposal.rejected === 0
                                    ? "sem histórico"
                                    : `${Math.round(proposal.reputation * 100)}% de confiança · ${proposal.approved} aprovadas · ${proposal.rejected} rejeitadas`}
                                </span>
                                {proposal.score !== null && (
                                  <strong>Nota {Math.round(proposal.score * 100)}/100</strong>
                                )}
                              </footer>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="chain-decision">
                      <span>Por que foi escolhido</span>
                      <p>{step.reason}</p>
                    </div>
                    {step.result ? (
                      <div className="chain-delivery">
                        <span>Entrega</span>
                        <AgentOutput value={step.result} />
                      </div>
                    ) : (
                      <div className={`mission-step-waiting ${step.status}`}>
                        {step.status === "failed" ? (
                          <CircleAlert size={15} />
                        ) : (
                          <LoaderCircle
                            className={step.status === "running" ? "animate-spin" : undefined}
                            size={15}
                          />
                        )}
                        <span>
                          {step.errorMessage ||
                            (step.status === "running"
                              ? "Este especialista ainda está produzindo a entrega."
                              : "Esta etapa começa quando a anterior terminar.")}
                        </span>
                      </div>
                    )}
                    {step.order && (
                      <button className="studio-secondary" onClick={() => onOrder(step.order!)}>
                        Revisar contratação <ArrowRight size={15} />
                      </button>
                    )}
                  </article>
                ))}
              </div>
              <div className="mission-result-actions">
                {chain.status === "awaiting_review" ? (
                  <>
                    <button
                      className="studio-primary"
                      disabled={!!busy || !firstOrderAwaitingReview}
                      onClick={() => firstOrderAwaitingReview && onOrder(firstOrderAwaitingReview)}
                    >
                      Revisar primeira entrega <ArrowRight size={15} />
                    </button>
                    <button
                      className="studio-secondary"
                      disabled={!!busy}
                      onClick={() => void refreshAfterReview()}
                    >
                      {busy === "review" ? (
                        <LoaderCircle className="animate-spin" size={15} />
                      ) : (
                        <RotateCcw size={15} />
                      )}
                      {busy === "review" ? "Atualizando..." : "Atualizar após revisão"}
                    </button>
                  </>
                ) : chain.status !== "completed" ? (
                  <button
                    className={`studio-primary ${leaseActive ? "mission-lease-active" : ""}`}
                    disabled={!!busy || leaseActive}
                    onClick={() => void resumeChain()}
                  >
                    {busy === "resume" ? (
                      <LoaderCircle className="animate-spin" size={15} />
                    ) : leaseActive ? (
                      <LoaderCircle className="animate-spin" size={15} />
                    ) : (
                      <RotateCcw size={15} />
                    )}
                    {busy === "resume"
                      ? "Retomando..."
                      : leaseActive
                        ? "Execução ainda reservada"
                        : "Retomar missão"}
                  </button>
                ) : null}
                {chain.status !== "awaiting_review" && (
                  <button
                    className="studio-secondary mission-again"
                    disabled={!!busy}
                    onClick={() => {
                      setChain(null);
                      updateTask("");
                      setError("");
                      request.current = { key: "", id: "", orderId: "" };
                    }}
                  >
                    Nova missão
                  </button>
                )}
              </div>
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
          ) : mode === "mission" ? (
            <div className="mission-explainer">
              <Network size={28} />
              <h2>Você pede. A equipe trabalha.</h2>
              <p>As decisões e entregas aparecem aqui.</p>
              <ol>
                <li>
                  <span>1</span>
                  <div>
                    <strong>Entendemos o pedido</strong>
                    <small>O trabalho é dividido em etapas claras.</small>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Escolhemos a equipe</strong>
                    <small>Comparamos especialistas ou criamos um para a tarefa.</small>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>O resultado é conferido</strong>
                    <small>Cada etapa usa o trabalho anterior até concluir a missão.</small>
                  </div>
                </li>
              </ol>
              <div>
                <ShieldCheck size={16} />
                Pagamentos ficam reservados até a verificação.
              </div>
            </div>
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
