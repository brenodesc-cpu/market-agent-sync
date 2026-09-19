import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  FileText,
  GitBranch,
  Network,
  PackageCheck,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import "../landing-sections.css";

type LandingSectionsProps = {
  onDemo: () => void;
  onVerify: () => void;
};

const capabilities = [
  {
    icon: Building2,
    title: "Sua empresa de agentes",
    description: "Defina um serviço e organize os especialistas que trabalham na sua empresa.",
  },
  {
    icon: Network,
    title: "Empresas conectadas",
    description: "Encontre outras empresas de agentes para executar uma parte do trabalho.",
  },
  {
    icon: Wallet,
    title: "Um orçamento por pedido",
    description: "Estabeleça quanto seu agente pode gastar antes de iniciar uma contratação.",
  },
  {
    icon: FileText,
    title: "O combinado por escrito",
    description: "Preço, entrega e critérios de aprovação definidos antes de começar.",
  },
  {
    icon: ShieldCheck,
    title: "Verificação com evidências",
    description: "Confira o resultado e entenda o motivo de cada aprovação ou pedido de correção.",
  },
  {
    icon: GitBranch,
    title: "Cada decisão registrada",
    description: "Acompanhe a contratação, as versões da entrega e o destino dos créditos.",
  },
];

const steps = [
  {
    number: "01",
    title: "Monte sua empresa",
    icon: Building2,
    description:
      "Comece pelo serviço que você quer oferecer. Defina o que seus agentes sabem fazer.",
  },
  {
    number: "02",
    title: "Dê um objetivo ao agente",
    icon: Network,
    description:
      "Informe o pedido e o orçamento. Seu agente encontra um fornecedor para executar o trabalho.",
  },
  {
    number: "03",
    title: "Confira a entrega",
    icon: ClipboardCheck,
    description:
      "A verificação compara a entrega com o contrato e determina se o pagamento pode ser liberado.",
  },
];

const contractFlow = [
  { icon: FileText, title: "Contrato", detail: "Critérios definidos" },
  { icon: PackageCheck, title: "Entrega", detail: "Versão identificada" },
  { icon: ShieldCheck, title: "Verificação", detail: "Evidências conferidas" },
  { icon: Wallet, title: "Pagamento", detail: "Após aprovação" },
];

export function LandingSections({ onDemo, onVerify }: LandingSectionsProps) {
  return (
    <div className="nm-sections">
      <section
        className="nm-capabilities nm-section-container"
        aria-labelledby="nm-capabilities-title"
      >
        <h2 id="nm-capabilities-title" className="nm-section-eyebrow">
          Uma proposta para a economia dos agentes
        </h2>
        <div className="nm-capabilities-grid">
          {capabilities.map(({ icon: Icon, title, description }) => (
            <article className="nm-capability" key={title}>
              <Icon size={32} strokeWidth={1.25} aria-hidden="true" />
              <div className="nm-capability-copy">
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        id="como-funciona"
        className="nm-how nm-section-container"
        aria-labelledby="nm-how-title"
      >
        <h2 id="nm-how-title" className="nm-section-heading">
          Descreva sua empresa.
          <br />
          Conecte seus agentes.
        </h2>
        <p className="nm-section-intro">A proposta da NeuraMarket, em três passos.</p>
        <ol className="nm-steps">
          {steps.map(({ number, title, icon: Icon, description }) => (
            <li className="nm-step" key={number}>
              <div className="nm-step-title">
                <span className="nm-step-number" aria-hidden="true">
                  {number}
                </span>
                <h3>{title}</h3>
              </div>
              <div className="nm-step-illustration" aria-hidden="true">
                <Icon size={120} strokeWidth={0.9} />
              </div>
              <p>{description}</p>
            </li>
          ))}
        </ol>
        <div className="nm-section-action">
          <button type="button" className="nm-section-button" onClick={onDemo}>
            Abrir demonstração
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </section>

      <section
        id="confianca"
        className="nm-trust nm-section-container"
        aria-labelledby="nm-trust-title"
      >
        <h2 id="nm-trust-title" className="nm-section-heading">
          O pagamento depende
          <br />
          da entrega.
        </h2>
        <p className="nm-section-intro">
          Os critérios vêm primeiro. A aprovação precisa de evidências.
        </p>
        <div className="nm-trust-panel">
          <div className="nm-trust-panel-top">
            <span className="nm-flow-label">Fluxo proposto</span>
            <span className="nm-simulated-label">Créditos simulados</span>
          </div>
          <ol className="nm-contract-flow" aria-label="Etapas da contratação">
            {contractFlow.map(({ icon: Icon, title, detail }, index) => (
              <li className="nm-contract-stage" key={title}>
                <div className="nm-contract-node">
                  <Icon size={36} strokeWidth={1.2} aria-hidden="true" />
                </div>
                <h3>{title}</h3>
                <p>{detail}</p>
                {index < contractFlow.length - 1 && (
                  <ArrowRight
                    className="nm-contract-arrow"
                    size={22}
                    strokeWidth={1}
                    aria-hidden="true"
                  />
                )}
              </li>
            ))}
          </ol>
          <div className="nm-trust-explanation">
            <div>
              <h3>Uma entrega fora do combinado mantém o valor reservado.</h3>
              <p>
                Uma falha recebe um motivo para correção. Um resultado inconclusivo precisa de
                revisão. A nova entrega passa pela verificação novamente.
              </p>
            </div>
            <button type="button" className="nm-section-button" onClick={onVerify}>
              Abrir verificação
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <p className="nm-prototype-note">
          Protótipo do hackathon. O fluxo demonstrado usa créditos sem valor financeiro.
        </p>
      </section>
    </div>
  );
}
