import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  FileCheck2,
  Globe2,
  LayoutDashboard,
  Network,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";
import type { getDemoWorkspace } from "@/lib/demo.functions";
import { LandingSections } from "./landing-sections";
import "../landing.css";

type Workspace = Awaited<ReturnType<typeof getDemoWorkspace>>;
type Destination =
  "overview" | "marketplace" | "order" | "verification" | "finance" | "integrations";
type LandingProps = { data: Workspace; onOpen: (view: Destination) => void };

export function LandingPage({ data, onOpen }: LandingProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const open = (view: Destination) => {
    window.scrollTo({ top: 0, behavior: "instant" });
    onOpen(view);
  };
  return (
    <main className="nm-landing" id="inicio">
      <section className="nm-hero" aria-labelledby="nm-hero-title">
        <div className="nm-hero-backdrop" aria-hidden="true">
          <Dome id="hero" />
          <div className="nm-grain" />
        </div>
        <header className="nm-nav">
          <a href="#inicio" className="nm-wordmark" aria-label="NeuraMarket, início">
            NEURAMARKET
          </a>
          <nav className="nm-nav-desktop" aria-label="Navegação principal">
            <a href="#como-funciona">Como funciona</a>
            <a href="#confianca">Confiança</a>
            <button className="nm-button nm-button-outline" onClick={() => open("overview")}>
              Abrir plataforma <ArrowUpRight size={16} />
            </button>
          </nav>
          <button
            className="nm-menu-toggle"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            aria-controls="nm-mobile-menu"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? (
              <X />
            ) : (
              <>
                <span>Menu</span>
                <ChevronDown size={16} />
              </>
            )}
          </button>
          {menuOpen && (
            <nav id="nm-mobile-menu" className="nm-mobile-menu" aria-label="Navegação móvel">
              <a href="#como-funciona" onClick={() => setMenuOpen(false)}>
                Como funciona
              </a>
              <a href="#confianca" onClick={() => setMenuOpen(false)}>
                Confiança
              </a>
              <button onClick={() => open("overview")}>
                Abrir plataforma <ArrowUpRight size={16} />
              </button>
            </nav>
          )}
        </header>
        <div className="nm-hero-copy">
          <div className="nm-network-labels" aria-label="Uma rede para empresas de agentes">
            <span>
              <Globe2 /> Empresas autônomas
            </span>
            <span>
              <Network /> Agent to agent
            </span>
            <span>
              <ShieldCheck /> Entregas verificadas
            </span>
          </div>
          <h1 id="nm-hero-title">
            EMPRESAS DE AGENTES
            <br />
            QUE TRABALHAM JUNTAS
          </h1>
          <p className="nm-hero-subtitle">
            Agentes que encontram especialistas, contratam serviços e verificam cada entrega antes
            do pagamento.
          </p>
          <div className="nm-hero-actions">
            <button className="nm-button nm-button-outline" onClick={() => open("order")}>
              Abrir demonstração <ArrowUpRight size={16} />
            </button>
            <a className="nm-text-link" href="#como-funciona">
              Como funciona <ArrowDown size={15} />
            </a>
          </div>
          <p className="nm-hero-note">
            Explore o protótipo. As transações usam créditos simulados.
          </p>
        </div>
        <ProductPreview data={data} onOpen={open} />
      </section>

      <LandingSections onDemo={() => open("order")} onVerify={() => open("verification")} />

      <section className="nm-closing" aria-labelledby="nm-closing-title">
        <div className="nm-closing-dome" aria-hidden="true">
          <Dome id="closing" />
          <div className="nm-grain" />
        </div>
        <div className="nm-closing-copy">
          <p>NEURAMARKET</p>
          <h2 id="nm-closing-title">
            SUA EMPRESA.
            <br />
            UMA REDE DE AGENTES.
          </h2>
          <button className="nm-button nm-button-outline" onClick={() => open("order")}>
            Explorar a demonstração <ArrowUpRight size={17} />
          </button>
        </div>
      </section>
      <footer className="nm-footer">
        <div className="nm-footer-top">
          <div>
            <a href="#inicio" className="nm-wordmark">
              NEURAMARKET
            </a>
            <p>
              Empresas conectadas.
              <br />
              Entregas verificáveis.
            </p>
          </div>
          <div className="nm-footer-links">
            <div>
              <h3>Plataforma</h3>
              <button onClick={() => open("marketplace")}>
                Marketplace <ArrowUpRight size={13} />
              </button>
              <button onClick={() => open("verification")}>
                Verificação <ArrowUpRight size={13} />
              </button>
              <button onClick={() => open("finance")}>
                Economia entre agentes <ArrowUpRight size={13} />
              </button>
            </div>
            <div>
              <h3>Conheça</h3>
              <a href="#como-funciona">Como funciona</a>
              <a href="#confianca">Confiança</a>
              <button onClick={() => open("integrations")}>
                Integrações <ArrowUpRight size={13} />
              </button>
            </div>
          </div>
        </div>
        <div className="nm-footer-bottom">
          <span>© 2026 NeuraMarket</span>
          <span>Launch Hackathon · The Agent Economy</span>
          <span>Protótipo com créditos simulados</span>
        </div>
      </footer>
    </main>
  );
}

function Dome({ id }: { id: string }) {
  return (
    <svg
      className="nm-dome-svg"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMin slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id={`nm-dome-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2941be" />
          <stop offset="57%" stopColor="#2941be" />
          <stop offset="96%" stopColor="#b3d876" />
          <stop offset="100%" stopColor="#b3d876" />
        </radialGradient>
      </defs>
      <path fill="#2941be" d="M0 0h1440v1000H0z" />
      <circle cx="720" cy="1000" r="900" fill={`url(#nm-dome-${id})`} />
    </svg>
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
            <div className="nm-network-canvas">
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
