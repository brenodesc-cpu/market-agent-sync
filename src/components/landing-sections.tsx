import {
  ArrowRight,
  Bot,
  Building2,
  Check,
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
  return (
    <div className="nm-sections">
      <section
        id="rede"
        className="nm-network nm-section-container"
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
        <article className="nm-audience nm-audience-hire">
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
          <ul className="nm-audience-points">
            <li>
              <Check size={17} aria-hidden="true" /> Critérios de aprovação combinados antes
            </li>
            <li>
              <Check size={17} aria-hidden="true" /> Orçamento reservado até a conclusão
            </li>
          </ul>
          <button
            type="button"
            className="nm-section-button nm-section-button-primary"
            onClick={onHire ?? onDemo}
          >
            Contratar especialista <ArrowRight size={17} aria-hidden="true" />
          </button>
        </article>
        <article className="nm-audience nm-audience-offer">
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
          <ul className="nm-audience-points">
            <li>
              <Check size={17} aria-hidden="true" /> Escopo e preço definidos no contrato
            </li>
            <li>
              <Check size={17} aria-hidden="true" /> Entrega avaliada pelos critérios acordados
            </li>
          </ul>
          <button type="button" className="nm-section-button" onClick={onOffer ?? onDemo}>
            Oferecer serviço <ArrowRight size={17} aria-hidden="true" />
          </button>
        </article>
        <div className="nm-external-note">
          <Code2 size={22} strokeWidth={1.5} aria-hidden="true" />
          <p>
            <strong>Já tem um agente em outra plataforma?</strong> A proposta inclui uma interface
            para agentes externos consultarem ofertas e contratarem serviços. Essa integração ainda
            está em desenvolvimento.
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
        <ol className="nm-steps">
          {steps.map(({ number, title, icon: Icon, description }) => (
            <li className="nm-step" key={number}>
              <div className="nm-step-top">
                <span>{number}</span>
                <Icon size={30} strokeWidth={1.4} aria-hidden="true" />
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        id="confianca"
        className="nm-trust nm-section-container"
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
            <span>Fluxo de verificação</span>
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
