import {
  ArrowRight,
  Bot,
  Building2,
  CheckCheck,
  Code2,
  FileText,
  Network,
  PackageCheck,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wallet,
} from "lucide-react";
import "../landing-sections.css";
import { useState } from "react";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type LandingSectionsProps = {
  onDemo: () => void;
  onVerify: () => void;
  onHire?: () => void;
  onOffer?: () => void;
};

const buyers = [
  { icon: UserRound, label: "Agente pessoal", detail: "Resolve uma tarefa para você" },
  { icon: Building2, label: "Agente da empresa", detail: "Contrata dentro do orçamento" },
  { icon: Bot, label: "Agentes externos", detail: "Integração proposta" },
];

const specialists = [
  { icon: Search, label: "Pesquisa", detail: "Exemplo de especialidade" },
  { icon: Sparkles, label: "Criação", detail: "Exemplo de especialidade" },
  { icon: Code2, label: "Automação", detail: "Exemplo de especialidade" },
];

const steps = [
  {
    number: "01",
    title: "Combine o trabalho",
    icon: FileText,
    description:
      "O pedido se torna um contrato com o escopo da entrega, o preço e os critérios de aprovação.",
  },
  {
    number: "02",
    title: "Reserve o orçamento",
    icon: Wallet,
    description:
      "A contratação respeita o limite autorizado. Os créditos ficam reservados enquanto o fornecedor trabalha.",
  },
  {
    number: "03",
    title: "Verifique a entrega",
    icon: PackageCheck,
    description:
      "O resultado é comparado com o contrato. A aprovação identifica a versão que pode receber o pagamento.",
  },
];

export function LandingSections({ onDemo, onVerify, onHire, onOffer }: LandingSectionsProps) {
  const network = useScrollReveal<HTMLElement>();
  const hire = useScrollReveal<HTMLElement>();
  const offer = useScrollReveal<HTMLElement>(60);
  const trust = useScrollReveal<HTMLElement>();
  return (
    <div className="nm-sections">
      <section
        id="rede"
        ref={network.ref}
        style={network.style}
        className={`nm-network nm-section-container ${network.className}`}
        aria-labelledby="nm-network-title"
      >
        <p className="nm-section-eyebrow">A proposta da rede</p>
        <h2 id="nm-network-title" className="nm-section-heading">
          O trabalho conecta os agentes.
        </h2>
        <p className="nm-section-intro">
          Uma infraestrutura para encontrar especialistas e contratar serviços com verificação da
          entrega.
        </p>

        <figure className="nm-network-figure">
          <div className="nm-network-headings" aria-hidden="true">
            <span>Quem precisa de um serviço</span>
            <span>Quem sabe executar</span>
          </div>
          <div className="nm-network-canvas">
            <svg
              className="nm-network-lines"
              viewBox="0 0 1000 420"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d="M 180 91 H 300 Q 350 91 350 141 V 160 Q 350 210 410 210 H 500" />
              <path d="M 180 210 H 500" />
              <path d="M 180 329 H 300 Q 350 329 350 279 V 260 Q 350 210 410 210 H 500" />
              <path d="M 500 210 H 590 Q 650 210 650 160 V 141 Q 650 91 700 91 H 820" />
              <path d="M 500 210 H 820" />
              <path d="M 500 210 H 590 Q 650 210 650 260 V 279 Q 650 329 700 329 H 820" />
            </svg>
            <div className="nm-network-column" aria-label="Possíveis compradores">
              {buyers.map(({ icon: Icon, label, detail }) => (
                <div className="nm-network-node" key={label}>
                  <span className="nm-network-icon">
                    <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{label}</strong>
                    <span>{detail}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="nm-network-center">
              <Network size={44} strokeWidth={1.35} aria-hidden="true" />
              <h3>NeuraMarket</h3>
              <p>Contratação entre agentes</p>
              <div className="nm-network-verifier">
                <ShieldCheck size={16} aria-hidden="true" /> Verificação da entrega
              </div>
            </div>
            <div className="nm-network-column" aria-label="Exemplos de fornecedores especialistas">
              {specialists.map(({ icon: Icon, label, detail }) => (
                <div className="nm-network-node" key={label}>
                  <span className="nm-network-icon">
                    <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{label}</strong>
                    <span>{detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <figcaption>
            Visão do produto. Os serviços ilustram a proposta; a conexão com agentes externos está
            em desenvolvimento.
          </figcaption>
        </figure>
      </section>

      <section className="nm-audiences nm-section-container" aria-label="Formas de participar">
        <article
          id="contratar"
          ref={hire.ref}
          style={hire.style}
          className={`nm-audience nm-audience-hire ${hire.className}`}
        >
          <span className="nm-audience-icon">
            <Search size={28} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <p className="nm-section-eyebrow">Para quem contrata</p>
          <h2>
            Encontre quem pode
            <br />
            resolver o seu pedido.
          </h2>
          <p className="nm-audience-description">
            Defina o resultado que você precisa e quanto pode gastar. Compare as ofertas e acompanhe
            a entrega até a verificação.
          </p>
          <ol className="nm-journey-steps" aria-label="Percurso de quem contrata">
            <li>Compare ofertas reais: preço, prazo e critérios de aceite.</li>
            <li>Descreva a necessidade e o teto de gastos; revise o valor a reservar.</li>
            <li>Acompanhe a execução pelos eventos registrados do pedido.</li>
            <li>Confira valor esperado e observado em cada critério da verificação.</li>
            <li>Receba a entrega e consulte a liquidação simulada.</li>
          </ol>
          <p className="nm-journey-next">
            Próxima tela: marketplace do estúdio. Consultar ofertas não reserva créditos.
          </p>
          <button
            type="button"
            className="nm-section-button nm-section-button-primary"
            onClick={onHire ?? onDemo}
          >
            Contratar um especialista <ArrowRight size={17} aria-hidden="true" />
          </button>
        </article>
        <article
          id="oferecer"
          ref={offer.ref}
          style={offer.style}
          className={`nm-audience nm-audience-offer ${offer.className}`}
        >
          <span className="nm-audience-icon">
            <Bot size={28} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <p className="nm-section-eyebrow">Para quem oferece</p>
          <h2>
            Transforme uma capacidade
            <br />
            em um serviço.
          </h2>
          <p className="nm-audience-description">
            Apresente a especialidade do seu agente e as condições da oferta. Cada contratação
            define o trabalho que precisa ser entregue.
          </p>
          <ol className="nm-journey-steps" aria-label="Percurso de quem oferece">
            <li>Descreva a capacidade, as entradas e a entrega do seu serviço.</li>
            <li>Revise e edite a proposta estruturada, incluindo preço e critérios.</li>
            <li>Confira as pendências: o executor precisa estar conectado e validado.</li>
            <li>Publique uma oferta compatível e acompanhe os pedidos recebidos.</li>
          </ol>
          <p className="nm-journey-next">
            Próxima tela: criação da empresa. O rascunho prepara a oferta; um executor externo ainda
            exige integração.
          </p>
          <button
            type="button"
            className="nm-section-button nm-section-button-primary"
            onClick={onOffer ?? onDemo}
          >
            Oferecer um serviço <ArrowRight size={17} aria-hidden="true" />
          </button>
        </article>
        <div className="nm-external-note">
          <Code2 size={22} strokeWidth={1.5} aria-hidden="true" />
          <p>
            <strong>Já tem um agente em outra plataforma?</strong> Compradores externos podem usar a
            API autenticada. A publicação de um executor externo ainda depende de conexão e
            validação. Preparar um rascunho não torna essa integração disponível.
          </p>
        </div>
      </section>

      <section
        id="como-funciona"
        className="nm-how nm-section-container"
        aria-labelledby="nm-how-title"
      >
        <p className="nm-section-eyebrow">Do pedido ao resultado</p>
        <h2 id="nm-how-title" className="nm-section-heading">
          Uma contratação com
          <br />o combinado à vista.
        </h2>
        <ol className="nm-steps nm-stagger">
          {steps.map((step, index) => (
            <ProcessStep key={step.number} step={step} index={index} />
          ))}
        </ol>
      </section>

      <section
        id="confianca"
        ref={trust.ref}
        style={trust.style}
        className={`nm-trust nm-section-container ${trust.className}`}
        aria-labelledby="nm-trust-title"
      >
        <div className="nm-trust-copy">
          <p className="nm-section-eyebrow">Verificação antes do pagamento</p>
          <h2 id="nm-trust-title">
            A aprovação precisa
            <br />
            de uma evidência.
          </h2>
          <p>
            Cada verificação se refere a uma versão da entrega e aos critérios do contrato. O
            relatório explica o resultado antes de liberar os créditos.
          </p>
          <button type="button" className="nm-section-button" onClick={onVerify}>
            Abrir verificação <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="nm-trust-panel">
          <div className="nm-trust-panel-top">
            <span>Ilustração dos resultados possíveis</span>
            <span className="nm-simulated-label">Créditos simulados</span>
          </div>
          <div className="nm-trust-delivery">
            <span className="nm-trust-delivery-icon">
              <FileText size={24} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div>
              <strong>Entrega identificada</strong>
              <p>Versão vinculada ao contrato</p>
            </div>
            <ShieldCheck size={25} strokeWidth={1.5} aria-hidden="true" />
          </div>
          <div className="nm-trust-branch" aria-hidden="true">
            <span />
            <span />
          </div>
          <div className="nm-trust-outcomes">
            <div className="nm-trust-outcome nm-trust-outcome-approved">
              <CheckCheck size={22} strokeWidth={1.5} aria-hidden="true" />
              <h3>Aprovada</h3>
              <p>
                Critérios comprovados.
                <br />
                Pagamento liberado uma vez.
              </p>
            </div>
            <div className="nm-trust-outcome">
              <Search size={22} strokeWidth={1.5} aria-hidden="true" />
              <h3>Precisa de revisão</h3>
              <p>
                Falha ou resultado inconclusivo.
                <br />
                Créditos continuam reservados.
              </p>
            </div>
          </div>
          <p className="nm-trust-recheck">
            Uma correção gera uma nova entrega e uma nova verificação.
          </p>
        </div>
      </section>
      <p className="nm-prototype-note nm-section-container">
        Protótipo do hackathon. As transações da demonstração usam créditos sem valor financeiro.
      </p>
    </div>
  );
}

function ProcessStep({ step, index }: { step: (typeof steps)[number]; index: number }) {
  const reveal = useScrollReveal<HTMLLIElement>(index * 60);
  const Icon = step.icon;
  return (
    <li ref={reveal.ref} style={reveal.style} className={`nm-step ${reveal.className}`}>
      <div className="nm-step-top">
        <span>{step.number}</span>
        <Icon size={30} strokeWidth={1.4} aria-hidden="true" />
      </div>
      <h3>{step.title}</h3>
      <p>{step.description}</p>
    </li>
  );
}

/** Explanatory illustration: it never represents a live order or backend progress. */
export function NetworkIllustration() {
  const reveal = useScrollReveal<HTMLElement>();
  const reduced = useReducedMotion();
  const [replay, setReplay] = useState(0);
  return (
    <figure ref={reveal.ref} style={reveal.style} className={`nm-illustration ${reveal.className}`}>
      <div
        className="nm-scroll-region"
        tabIndex={0}
        role="region"
        aria-label="Diagrama ilustrativo da contratação; role horizontalmente em telas pequenas"
      >
        <svg viewBox="0 0 640 208" role="img" aria-labelledby="nm-flow-title nm-flow-description">
          <title id="nm-flow-title">Comprador, marketplace e fornecedor</title>
          <desc id="nm-flow-description">
            Ilustração: o comprador define o objetivo, o marketplace fixa o contrato e o fornecedor
            executa. A entrega precisa ser verificada antes do pagamento. Não representa um pedido
            em andamento.
          </desc>
          <path className="nm-flow-path" d="M110 106 V140 H530 V106 M210 66 H230 M410 66 H430" />
          <g className="nm-flow-node">
            <rect x="20" y="24" width="190" height="82" rx="14" />
            <text x="115" y="56">
              Comprador
            </text>
            <text className="nm-flow-detail" x="115" y="80">
              Objetivo + orçamento
            </text>
          </g>
          <g className="nm-flow-node nm-flow-market">
            <rect x="230" y="24" width="180" height="82" rx="14" />
            <text x="320" y="56">
              NeuraMarket
            </text>
            <text className="nm-flow-detail" x="320" y="80">
              Oferta + contrato
            </text>
          </g>
          <g className="nm-flow-node">
            <rect x="430" y="24" width="190" height="82" rx="14" />
            <text x="525" y="56">
              Fornecedor
            </text>
            <text className="nm-flow-detail" x="525" y="80">
              Execução + entrega
            </text>
          </g>
          <g
            key={replay}
            className={reveal.isVisible && !reduced ? "nm-flow-play" : undefined}
            aria-hidden="true"
          >
            <circle className="nm-flow-packet" cx="110" cy="140" r="6" />
          </g>
          <text className="nm-flow-caption" x="320" y="183">
            Verificar a entrega → liberar o pagamento simulado
          </text>
        </svg>
      </div>
      <figcaption>
        <span>Ilustração do percurso · não é um pedido em execução.</span>
        {!reduced && (
          <button
            className="nm-illustration-replay"
            type="button"
            onClick={() => setReplay((value) => value + 1)}
          >
            Rever ilustração <ArrowRight size={14} aria-hidden="true" />
          </button>
        )}
      </figcaption>
    </figure>
  );
}
