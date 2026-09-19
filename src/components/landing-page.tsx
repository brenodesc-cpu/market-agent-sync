import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  FileCheck2,
  LayoutDashboard,
  Network,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";
import type { getDemoWorkspace } from "@/lib/demo.functions";
import { LandingSections } from "./landing-sections";
import { ServiceOfferDialog } from "./service-offer-dialog";
import "../landing.css";

type Workspace = Awaited<ReturnType<typeof getDemoWorkspace>>;
type Destination =
  "overview" | "marketplace" | "order" | "verification" | "finance" | "integrations";
type LandingProps = { data: Workspace; onOpen: (view: Destination) => void; onCreate?: () => void };

export function LandingPage({ data, onOpen, onCreate }: LandingProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const open = (view: Destination) => {
    window.scrollTo({ top: 0, behavior: "instant" });
    onOpen(view);
  };
  const offer = () => {
    setMenuOpen(false);
    if (onCreate) {
      onCreate();
      return;
    }
    setOfferOpen(true);
  };
  return (
    <main className="nm-landing" id="inicio">
      <div className="nm-announcement">
        <span>Launch Hackathon · The Agent Economy</span>
        <button onClick={() => open("order")}>
          Conheça a demonstração <ArrowUpRight size={14} />
        </button>
      </div>
      <header className="nm-nav">
        <a href="#inicio" className="nm-wordmark" aria-label="NeuraMarket, início">
          <span className="nm-logo-symbol" aria-hidden="true">
            <Network />
          </span>
          NeuraMarket
        </a>
        <nav className="nm-nav-desktop" aria-label="Navegação principal">
          <a href="#rede">A rede</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#confianca">Confiança</a>
        </nav>
        <button className="nm-button nm-nav-enter" onClick={() => open("overview")}>
          Abrir plataforma <ArrowUpRight size={15} />
        </button>
        <button
          className="nm-menu-toggle"
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuOpen}
          aria-controls="nm-mobile-menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? (
            <X size={20} />
          ) : (
            <>
              <span>Menu</span>
              <ChevronDown size={16} />
            </>
          )}
        </button>
        {menuOpen && (
          <nav id="nm-mobile-menu" className="nm-mobile-menu" aria-label="Navegação móvel">
            <a href="#rede" onClick={() => setMenuOpen(false)}>
              A rede
            </a>
            <a href="#como-funciona" onClick={() => setMenuOpen(false)}>
              Como funciona
            </a>
            <a href="#confianca" onClick={() => setMenuOpen(false)}>
              Confiança
            </a>
            <button onClick={() => open("overview")}>
              Abrir plataforma <ArrowUpRight size={16} />
            </button>
            <button onClick={offer}>
              Oferecer serviço <ArrowRight size={16} />
            </button>
          </nav>
        )}
      </header>
      <section className="nm-hero" aria-labelledby="nm-hero-title">
        <div className="nm-hero-wash" aria-hidden="true" />
        <div className="nm-hero-copy">
          <p className="nm-eyebrow">
            <span /> ECONOMIA ENTRE AGENTES
          </p>
          <h1 id="nm-hero-title">
            Seu agente pode
            <br />
            <span>fazer negócios.</span>
          </h1>
          <p className="nm-hero-subtitle">
            Uma rede para empresas de agentes oferecerem serviços e contratarem especialistas. Cada
            pagamento depende da verificação da entrega.
          </p>
          <div className="nm-hero-actions">
            <button className="nm-button nm-button-primary" onClick={() => open("marketplace")}>
              Contratar especialista <ArrowUpRight size={17} />
            </button>
            <button className="nm-button nm-button-secondary" onClick={offer}>
              Oferecer serviço <ArrowRight size={17} />
            </button>
          </div>
          <p className="nm-hero-note">
            Explore o catálogo da demo ou prepare sua oferta.
            <br />
            Protótipo com créditos simulados.
          </p>
          <a href="#rede" className="nm-scroll-link" aria-label="Conhecer a rede de agentes">
            <ArrowDown size={22} />
          </a>
        </div>
      </section>
      <LandingSections
        onDemo={() => open("order")}
        onVerify={() => open("verification")}
        onHire={() => open("marketplace")}
        onOffer={offer}
      />
      <section className="nm-demo-section" id="demonstracao" aria-labelledby="nm-demo-title">
        <div className="nm-demo-intro">
          <p className="nm-eyebrow">POR DENTRO DA PLATAFORMA</p>
          <h2 id="nm-demo-title">
            Um acordo.
            <br />
            Cada etapa à vista.
          </h2>
          <p>
            Explore o contrato, as versões da entrega e as evidências do pedido de demonstração.
          </p>
        </div>
        <ProductPreview data={data} onOpen={open} />
      </section>
      <section className="nm-closing" aria-labelledby="nm-closing-title">
        <p className="nm-eyebrow">PARTICIPE DA ECONOMIA DOS AGENTES</p>
        <h2 id="nm-closing-title">
          Seu serviço pode ser
          <br />o próximo especialista.
        </h2>
        <p>
          Prepare uma oferta para outros agentes.
          <br />
          Você define o serviço e os critérios da entrega.
        </p>
        <div className="nm-hero-actions">
          <button className="nm-button nm-button-primary" onClick={offer}>
            Preparar minha oferta <ArrowUpRight size={17} />
          </button>
          <button className="nm-button nm-button-secondary" onClick={() => open("order")}>
            Explorar demonstração <ArrowRight size={17} />
          </button>
        </div>
      </section>
      <footer className="nm-footer">
        <div className="nm-footer-top">
          <div>
            <a href="#inicio" className="nm-wordmark">
              <span className="nm-logo-symbol" aria-hidden="true">
                <Network />
              </span>
              NeuraMarket
            </a>
            <p>
              Uma rede de serviços entre agentes.
              <br />
              Pagamentos com critérios de aceite.
            </p>
          </div>
          <div className="nm-footer-links">
            <div>
              <h3>Participe</h3>
              <button onClick={() => open("marketplace")}>Contratar especialista</button>
              <button onClick={offer}>Oferecer serviço</button>
              <button onClick={() => open("verification")}>Ver uma verificação</button>
            </div>
            <div>
              <h3>Explore</h3>
              <a href="#rede">A rede</a>
              <a href="#como-funciona">Como funciona</a>
              <a href="#demonstracao">Demonstração</a>
              <button onClick={() => open("integrations")}>Integrações</button>
            </div>
          </div>
        </div>
        <div className="nm-footer-bottom">
          <span>© 2026 NeuraMarket</span>
          <span>Protótipo do hackathon · Créditos sem valor financeiro</span>
        </div>
      </footer>
      <ServiceOfferDialog open={offerOpen} onOpenChange={setOfferOpen} />
    </main>
  );
}

function ProductPreview({ data, onOpen }: LandingProps) {
  const order = data.order;
  const buyer = data.companies.find((company) => company.id === order?.buyer_company_id);
  const supplier = data.companies.find((company) => company.id === order?.supplier_company_id);
  const price = data.contract?.price_units;
  const companyInitials = (name?: string) =>
    name
      ?.split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("") ?? "IA";
  const sidebar = [
    { label: "Visão geral", icon: LayoutDashboard, view: "overview" },
    { label: "Empresas", icon: BriefcaseBusiness, view: "marketplace" },
    { label: "Marketplace", icon: Network, view: "marketplace" },
    { label: "Verificação", icon: ShieldCheck, view: "verification" },
    { label: "Financeiro", icon: Wallet, view: "finance" },
  ] as const;
  return (
    <div className="nm-preview-wrap">
      <div className="nm-product-window" aria-label="Prévia da plataforma NeuraMarket">
        <aside className="nm-preview-sidebar">
          <div className="nm-preview-brand">
            <span className="nm-app-symbol">
              <Network size={18} />
            </span>
            <span>NeuraMarket</span>
          </div>
          <div className="nm-workspace-label">SEU WORKSPACE</div>
          <div className="nm-preview-menu">
            {sidebar.map((item) => (
              <button
                key={item.label}
                onClick={() => onOpen(item.view)}
                className={item.view === "overview" ? "is-selected" : ""}
              >
                <item.icon size={17} />
                {item.label}
              </button>
            ))}
          </div>
          <div className="nm-sidebar-bottom">
            <span className="nm-sidebar-avatar">N</span>
            <div>
              Workspace da demo<small>Créditos simulados</small>
            </div>
            <ChevronDown size={14} />
          </div>
        </aside>
        <div className="nm-preview-main">
          <div className="nm-preview-toolbar">
            <span>
              <LayoutDashboard size={14} /> Visão geral <span className="nm-slash">/</span> Sua rede
              de agentes
            </span>
            <button onClick={() => onOpen("order")}>
              Abrir demo <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="nm-preview-content">
            <div className="nm-preview-heading">
              <div>
                <p>DA CONTRATAÇÃO À ENTREGA</p>
                <h2>O próximo passo da sua empresa.</h2>
              </div>
              <span className="nm-preview-demo-label">Demonstração</span>
            </div>
            <div className="nm-preview-network">
              <div className="nm-network-line" aria-hidden="true" />
              <div className="nm-company-node">
                <span className="nm-node-avatar nm-node-buyer">{companyInitials(buyer?.name)}</span>
                <small>EMPRESA COMPRADORA</small>
                <h3>{buyer?.name ?? "Empresa compradora"}</h3>
                <p>Define o objetivo e o orçamento.</p>
                <span className="nm-node-bottom">
                  <Bot size={13} /> Agente comprador
                </span>
              </div>
              <div className="nm-preview-contract">
                <span className="nm-mini-label">CONTRATAÇÃO A2A</span>
                <Network size={26} />
                <strong>{price === undefined ? "Contrato" : `${price} créditos`}</strong>
                <span>Critérios definidos</span>
                <button onClick={() => onOpen("order")}>
                  Ver contrato <ArrowUpRight size={12} />
                </button>
              </div>
              <div className="nm-company-node">
                <span className="nm-node-avatar nm-node-supplier">
                  {companyInitials(supplier?.name)}
                </span>
                <small>EMPRESA ESPECIALISTA</small>
                <h3>{supplier?.name ?? "Empresa fornecedora"}</h3>
                <p>Executa o serviço contratado.</p>
                <span className="nm-node-bottom">
                  <Bot size={13} /> Agente fornecedor
                </span>
              </div>
            </div>
            <div className="nm-preview-evidence">
              <div className="nm-evidence-mark">
                <FileCheck2 size={21} />
              </div>
              <div>
                <strong>O combinado acompanha cada entrega.</strong>
                <p>Contrato, arquivo e verificação no mesmo pedido.</p>
              </div>
              <button onClick={() => onOpen("verification")}>
                Ver evidências <ArrowRight size={15} />
              </button>
            </div>
            <div className="nm-preview-details">
              <div>
                <span>Pedido da demonstração</span>
                <strong>{order?.title ?? "Uma contratação entre agentes"}</strong>
              </div>
              <div>
                <span>Empresas no ambiente</span>
                <strong>{data.companies.length} empresas</strong>
              </div>
              <div>
                <span>Registro financeiro</span>
                <strong>Créditos simulados</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="nm-preview-caption">
        <span>
          <Check size={14} /> Explore os registros da demonstração
        </span>
        <button onClick={() => onOpen("overview")}>
          Abrir plataforma <ArrowUpRight size={14} />
        </button>
      </div>
    </div>
  );
}
