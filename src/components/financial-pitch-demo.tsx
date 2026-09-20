import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  Maximize,
  Network,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Terminal,
  UserRoundCheck,
  Wallet,
  X,
} from "lucide-react";
import "@/financial-pitch-demo.css";

const scenes = [
  {
    title: "Uma meta. Um orçamento autorizado.",
    text: "A empresa precisa de US$ 1.000 em até uma hora. Seu agente recebe um limite de R$ 5.600, incluindo a nossa taxa.",
    label: "Objetivo",
    actor: 0,
  },
  {
    title: "O menor preço precisa cumprir o prazo.",
    text: "A NeuraMarket compara três ofertas. Câmbio A custa menos, mas só entrega em 24 horas. B e C atendem à necessidade.",
    label: "Descoberta",
    actor: 1,
  },
  {
    title: "Uma contraproposta dentro das regras.",
    text: "Câmbio B aceita R$ 5.495, conforme sua política de desconto. Com a taxa de R$ 5, o custo total fica em R$ 5.500.",
    label: "Negociação",
    actor: 2,
  },
  {
    title: "O valor fica reservado para esta operação.",
    text: "O contrato fixa o preço, o prazo e a carteira de destino. R$ 5.500 ficam reservados enquanto a entrega é conferida.",
    label: "Contratação",
    actor: 2,
  },
  {
    title: "O comprovante está errado. O dinheiro fica retido.",
    text: "O documento declara US$ 990. O auditor compara com os US$ 1.000 do contrato e do registro da operação. A divergência bloqueia a conclusão.",
    label: "Divergência",
    actor: 3,
  },
  {
    title: "A correção passa por uma nova conferência.",
    text: "O fornecedor corrige o comprovante para US$ 1.000. O auditor confere a mesma operação e encaminha suas evidências para a revisão humana.",
    label: "Correção",
    actor: 3,
  },
  {
    title: "A decisão final fica com o responsável.",
    text: "A auditoria recomenda aprovar. O humano recebe as condições e os dois relatórios antes de autorizar a conclusão.",
    label: "Revisão humana",
    actor: 4,
  },
  {
    title: "US$ 1.000 disponíveis. Uma taxa pela operação.",
    text: "Após o aceite humano, a demonstração conclui a conversão uma única vez. A NeuraMarket retém R$ 5. O histórico explica cada decisão.",
    label: "Conclusão",
    actor: 5,
  },
] as const;
const parties = [
  { name: "Seu agente", role: "Tesouraria da empresa", icon: Terminal },
  { name: "NeuraMarket", role: "Assessor de compras", icon: Network },
  { name: "Câmbio B", role: "Agente fornecedor", icon: CircleDollarSign },
  { name: "Auditor", role: "Confere as evidências", icon: ShieldCheck },
  { name: "Responsável", role: "Revisão humana final", icon: UserRoundCheck },
  { name: "Carteira USD", role: "Conclusão da operação", icon: Wallet },
] as const;
const offers = [
  {
    name: "Câmbio A",
    price: "5.450",
    final: "5.450",
    minutes: "24 horas",
    reason: "Fora do prazo de 1 hora",
    tone: "rejected",
  },
  {
    name: "Câmbio B",
    price: "5.505",
    final: "5.495",
    minutes: "5 minutos",
    reason: "Atende ao prazo e aceita a contraproposta",
    tone: "selected",
  },
  {
    name: "Câmbio C",
    price: "5.520",
    final: "5.520",
    minutes: "10 minutos",
    reason: "Elegível, com custo maior",
    tone: "eligible",
  },
] as const;
type View = "flow" | "offers" | "receipt";

export function FinancialPitchDemo() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<View>("flow");
  const [notice, setNotice] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const scene = scenes[step] ?? scenes[0];
  const done = step === 7;
  const waiting = step === 6;
  const reserved = step >= 3 && !done;

  useEffect(() => {
    if (!playing || step >= 6) return;
    const timer = window.setTimeout(() => {
      setStep((value) => Math.min(6, value + 1));
      if (step === 5) setPlaying(false);
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [playing, step]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target as HTMLElement)?.closest("input, textarea, select, [contenteditable=true]")
      )
        return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        setPlaying(false);
        setStep((value) =>
          event.key === "ArrowRight" ? (value < 6 ? value + 1 : value) : Math.max(0, value - 1),
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const advance = () => {
    setPlaying(false);
    setStep((value) => Math.min(6, value + 1));
  };
  const reset = () => {
    setPlaying(false);
    setStep(0);
    setView("flow");
    setNotice("");
  };
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (root.current?.requestFullscreen) await root.current.requestFullscreen();
      else setNotice("Use a opção de tela cheia do navegador.");
    } catch {
      setNotice("Use a opção de tela cheia do navegador.");
    }
  }

  return (
    <div className="nm-financial-demo" ref={root}>
      <header className="fd-header">
        <a href="/" className="fd-brand">
          <Network size={23} /> Neura<span>Market</span>
        </a>
        <span className="fd-badge">
          <span /> Roteiro ilustrado · Valores fictícios
        </span>
        <div className="fd-header-links">
          <a href="/studio?view=fx">
            Abrir tesouraria <ArrowRight size={14} />
          </a>
          <button
            onClick={() => void fullscreen()}
            aria-label="Alternar tela cheia"
            title="Tela cheia"
          >
            <Maximize size={18} />
          </button>
        </div>
      </header>

      <main className="fd-main">
        <div className="fd-intro">
          <div>
            <p className="fd-eyebrow">UM ASSESSOR DE COMPRAS PARA AGENTES</p>
            <h1>Da necessidade ao pagamento verificado.</h1>
          </div>
          <div className="fd-protocol">
            <Terminal size={16} />
            <span>
              Seu agente se conecta por <strong>MCP / API</strong>
            </span>
          </div>
        </div>

        <div className="fd-mission">
          <div className="fd-mission-goal">
            <span className="fd-label">OBJETIVO DA EMPRESA</span>
            <strong>Disponibilizar US$ 1.000</strong>
            <span>na carteira empresarial para um pagamento futuro</span>
          </div>
          <div>
            <span className="fd-label">LIMITE AUTORIZADO</span>
            <strong>R$ 5.600</strong>
            <span>com todas as taxas</span>
          </div>
          <div>
            <span className="fd-label">PRAZO MÁXIMO</span>
            <strong>
              <Clock3 size={20} /> 1 hora
            </strong>
            <span>definido pelo humano</span>
          </div>
          <div className="fd-money-status">
            <span className="fd-label">
              {done ? "CUSTO TOTAL" : reserved ? "VALOR RESERVADO" : "PAGAMENTO"}
            </span>
            <strong>{step >= 3 ? "R$ 5.500" : "Aguardando"}</strong>
            <span>
              {done
                ? "R$ 5 são a nossa receita"
                : reserved
                  ? "Conclusão ainda bloqueada"
                  : "Nenhum valor liberado"}
            </span>
          </div>
        </div>

        <div className="fd-view-bar">
          <nav aria-label="Visões da demonstração">
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
            {String(step + 1).padStart(2, "0")} / 08 <b>{scene.label}</b>
          </span>
        </div>

        <div className={`fd-canvas fd-view-${view}`}>
          {view === "flow" && (
            <>
              <div className="fd-chain" aria-label="Fluxo da contratação">
                {parties.map((party, i) => {
                  const Icon = party.icon;
                  return (
                    <div
                      key={party.name}
                      className={`fd-party ${scene.actor === i ? "active" : ""} ${scene.actor > i ? "complete" : ""} ${i === 4 ? "human" : ""}`}
                    >
                      <div className="fd-party-top">
                        <span className="fd-node-icon">
                          <Icon size={24} />
                        </span>
                        <span className="fd-node-state">
                          {scene.actor > i ? <Check size={15} /> : `0${i + 1}`}
                        </span>
                      </div>
                      <strong>{party.name}</strong>
                      <span>{party.role}</span>
                      <div className="fd-party-foot">
                        {i === 0
                          ? "Objetivo + orçamento"
                          : i === 1
                            ? "Compara e negocia"
                            : i === 2
                              ? "Executa o contrato"
                              : i === 3
                                ? "Aprova ou pede correção"
                                : i === 4
                                  ? "Autoriza o pagamento"
                                  : "US$ 1.000"}
                      </div>
                      {i < 5 && <ChevronRight className="fd-edge" size={18} />}
                    </div>
                  );
                })}
              </div>
              <div className="fd-flow-bottom">
                <div className="fd-market-mini">
                  <span className="fd-label">FORNECEDORES CONSULTADOS</span>
                  {offers.map((offer, i) => (
                    <div className={step >= 1 ? `fd-mini-${offer.tone}` : ""} key={offer.name}>
                      <b>{offer.name}</b>
                      <span>R$ {step >= 2 ? offer.final : offer.price}</span>
                      <small>{offer.minutes}</small>
                      <span className="fd-mini-verdict">
                        {step === 0
                          ? "A consultar"
                          : i === 0
                            ? "Fora do prazo"
                            : i === 1
                              ? step >= 2
                                ? "Contraproposta aceita"
                                : "Selecionado"
                              : "Custo maior"}
                      </span>
                    </div>
                  ))}
                  <small>Valores do fornecedor. Taxa NeuraMarket: R$ 5.</small>
                </div>
                <div className={`fd-proof ${step === 4 ? "error" : step >= 5 ? "verified" : ""}`}>
                  <span className="fd-label">
                    {step >= 4 ? "AUDITORIA DO COMPROVANTE" : "CRITÉRIO DO CONTRATO"}
                  </span>
                  <div className="fd-proof-values">
                    <div>
                      <small>Esperado</small>
                      <strong>US$ 1.000</strong>
                    </div>
                    <ArrowRight size={21} />
                    <div>
                      <small>Comprovante</small>
                      <strong>
                        {step < 4 ? "Pendente" : step === 4 ? "US$ 990" : "US$ 1.000"}
                      </strong>
                    </div>
                  </div>
                  <p>
                    {step < 4
                      ? "O auditor confere o documento com o registro da operação."
                      : step === 4
                        ? "Divergência de US$ 10. Correção solicitada, reserva mantida."
                        : step === 5
                          ? "Versão 2 conferida. Aguardando a revisão humana."
                          : done
                            ? "Aprovação humana recebida. Operação concluída uma vez."
                            : "Evidências conferidas. O pagamento depende do seu aceite."}
                  </p>
                </div>
              </div>
            </>
          )}

          {view === "offers" && (
            <div className="fd-offers-grid">
              {offers.map((offer, i) => (
                <article key={offer.name} className={`fd-offer ${step >= 1 ? offer.tone : ""}`}>
                  <div className="fd-offer-heading">
                    <span>FORNECEDOR 0{i + 1}</span>
                    <CircleDollarSign size={22} />
                  </div>
                  <h2>{offer.name}</h2>
                  <div className="fd-offer-price">
                    <small>R$</small> {step >= 2 ? offer.final : offer.price}
                  </div>
                  <p>
                    <Clock3 size={16} /> Disponível em {offer.minutes}
                  </p>
                  <div className="fd-offer-negotiation">
                    {i === 1 && step >= 2 ? (
                      <>
                        <span>
                          Oferta inicial <s>R$ 5.505</s>
                        </span>
                        <strong>Desconto aceito: R$ 10</strong>
                      </>
                    ) : (
                      <>
                        <span>Taxa NeuraMarket</span>
                        <strong>+ R$ 5 por conclusão</strong>
                      </>
                    )}
                  </div>
                  <div className="fd-offer-reason">
                    {step === 0 ? (
                      <>
                        <Clock3 size={17} /> Aguardando a consulta
                      </>
                    ) : i === 0 ? (
                      <>
                        <X size={17} /> {offer.reason}
                      </>
                    ) : i === 1 ? (
                      <>
                        <CheckCheck size={17} /> {offer.reason}
                      </>
                    ) : (
                      <>{offer.reason}</>
                    )}
                  </div>
                </article>
              ))}
              <p className="fd-offers-note">
                Política desta demonstração: menor custo total entre as ofertas que atendem ao
                prazo. Descontos seguem regras dos fornecedores fictícios.
              </p>
            </div>
          )}

          {view === "receipt" && (
            <div className="fd-receipt-layout">
              <div className="fd-receipt-story">
                <span className="fd-eyebrow">RESULTADO DA CONTRATAÇÃO</span>
                <h2>{done ? "Uma operação concluída." : "O recibo aguarda a aprovação."}</h2>
                <p>
                  O custo da conversão e a receita da plataforma aparecem separados. Cada decisão
                  fica ligada à mesma operação.
                </p>
                <div className="fd-receipt-status">
                  <ShieldCheck size={21} />
                  {done
                    ? "Verificado pelo auditor e aprovado pelo humano"
                    : "Liberação condicionada à revisão humana"}
                </div>
              </div>
              <article
                className={`fd-receipt ${done ? "paid" : ""}`}
                aria-label="Recibo ilustrativo"
              >
                <div className="fd-receipt-heading">
                  <Network size={21} />
                  <b>NeuraMarket</b>
                  <span>{done ? "CONCLUÍDO" : "PRÉVIA"}</span>
                </div>
                <span className="fd-label">
                  {done ? "DISPONÍVEL NA CARTEIRA" : "VALOR A RECEBER"}
                </span>
                <h3>US$ 1.000</h3>
                <dl>
                  <div>
                    <dt>Fornecedor</dt>
                    <dd>Câmbio B</dd>
                  </div>
                  <div>
                    <dt>Conversão negociada</dt>
                    <dd>R$ 5.495</dd>
                  </div>
                  <div className="fd-fee">
                    <dt>Receita NeuraMarket</dt>
                    <dd>R$ 5</dd>
                  </div>
                  <div className="fd-total">
                    <dt>Custo total</dt>
                    <dd>R$ 5.500</dd>
                  </div>
                </dl>
                <p>
                  {done
                    ? "Aceite humano registrado nesta ilustração."
                    : "Nenhum pagamento aprovado nesta etapa."}
                </p>
                <span className="fd-receipt-id">
                  ILUSTRAÇÃO · NM-DEMO-001 · SEM VALOR FINANCEIRO
                </span>
              </article>
            </div>
          )}
        </div>

        <section
          className={`fd-narration ${waiting ? "waiting" : ""}`}
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="fd-scene-number">{String(step + 1).padStart(2, "0")}</div>
          <div>
            <h2>{scene.title}</h2>
            <p>{scene.text}</p>
          </div>
          {waiting && (
            <button
              className="fd-approve"
              onClick={() => {
                setStep(7);
                setPlaying(false);
              }}
            >
              <UserRoundCheck size={18} /> Aprovar demonstração
            </button>
          )}
          {done && (
            <div className="fd-complete-badge">
              <CheckCheck size={22} />
              <strong>R$ 5</strong>
              <span>taxa por conclusão</span>
            </div>
          )}
        </section>
      </main>

      <footer className="fd-footer">
        <div className="fd-controls">
          <button onClick={reset} title="Reiniciar" aria-label="Reiniciar demonstração">
            <RotateCcw size={17} />
          </button>
          <button
            onClick={() => {
              setPlaying(false);
              setStep(Math.max(0, step - 1));
            }}
            disabled={step === 0}
            aria-label="Etapa anterior"
          >
            <ArrowLeft size={18} />
          </button>
          <button className="fd-play" onClick={() => setPlaying(!playing)} disabled={step >= 6}>
            {playing ? <Pause size={17} /> : <Play size={17} />}
            {playing ? "Pausar" : step === 0 ? "Apresentar" : "Continuar"}
          </button>
          <button onClick={advance} disabled={step >= 6} aria-label="Próxima etapa">
            <ArrowRight size={18} />
          </button>
        </div>
        <div className="fd-progress" aria-label={`Etapa ${step + 1} de 8`}>
          {scenes.map((item, i) => (
            <span key={item.label} className={i <= step ? "past" : ""} title={item.label} />
          ))}
        </div>
        <p>{notice || "Ilustração interativa. Não cria pedidos nem movimenta saldo."}</p>
      </footer>
    </div>
  );
}
