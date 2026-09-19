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
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { getDemoWorkspace } from "@/lib/demo.functions";
import { useCountUp } from "@/hooks/use-count-up";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { LandingSections, NetworkIllustration } from "./landing-sections";
import { ServiceOfferDialog } from "./service-offer-dialog";
import "../landing.css";

type Workspace = Awaited<ReturnType<typeof getDemoWorkspace>>;
type Destination =
  "overview" | "marketplace" | "order" | "verification" | "finance" | "integrations";
type LandingProps = { data: Workspace; onOpen: (view: Destination) => void; onCreate?: () => void };

export function LandingPage({ data, onOpen, onCreate }: LandingProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [condensed, setCondensed] = useState(false);
  const [journey, setJourney] = useState("");
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setCondensed((current) => window.scrollY > (current ? 48 : 120));
    };
    const scroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const hash = () => setJourney(window.location.hash);
    const wide = window.matchMedia("(min-width: 900px)");
    const resize = () => {
      if (wide.matches) setMenuOpen(false);
    };
    update();
    hash();
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("hashchange", hash);
    wide.addEventListener("change", resize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("hashchange", hash);
      wide.removeEventListener("change", resize);
    };
  }, []);
  const open = (view: Destination) => {
    setMenuOpen(false);
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
      <a href="#nm-hero-title" className="nm-skip-link">
        Pular para o conteúdo
      </a>
      <div className="nm-announcement">
        <span>Protótipo do hackathon · Créditos simulados</span>
        <button onClick={() => open("order")}>
          Conheça a demonstração <ArrowUpRight size={14} />
        </button>
      </div>
      <header className={`nm-nav${condensed ? " is-condensed" : ""}`}>
        <a href="#inicio" className="nm-wordmark" aria-label="NeuraMarket, início">
          <span className="nm-logo-symbol" aria-hidden="true">
            <Network />
          </span>
          NeuraMarket
        </a>
        <nav className="nm-nav-desktop" aria-label="Navegação principal">
          <a href="#contratar" aria-current={journey === "#contratar" ? "location" : undefined}>
            Quero contratar
          </a>
          <a href="#oferecer" aria-current={journey === "#oferecer" ? "location" : undefined}>
            Quero oferecer
          </a>
          <a href="#como-funciona">Como funciona</a>
        </nav>
        <button className="nm-button nm-nav-enter" onClick={() => open("overview")}>
          Abrir plataforma <ArrowUpRight size={15} />
        </button>
        <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Dialog.Trigger asChild>
            <button
              className="nm-menu-toggle"
              aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={menuOpen}
              aria-controls="nm-mobile-menu"
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
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="nm-menu-overlay" />
            <Dialog.Content className="nm-mobile-menu nm-enter" id="nm-mobile-menu">
              <Dialog.Title className="nm-mobile-menu-title">Escolha seu percurso</Dialog.Title>
              <Dialog.Description>
                Explore a rede antes de contratar ou oferecer.
              </Dialog.Description>
              <Dialog.Close className="nm-menu-close" aria-label="Fechar menu">
                <X size={20} />
              </Dialog.Close>
              <nav aria-label="Navegação móvel">
                <a
                  href="#contratar"
                  aria-current={journey === "#contratar" ? "location" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  Quero contratar
                </a>
                <a
                  href="#oferecer"
                  aria-current={journey === "#oferecer" ? "location" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  Quero oferecer
                </a>
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
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </header>
      <section className="nm-hero" aria-labelledby="nm-hero-title">
        <div className="nm-hero-wash" aria-hidden="true" />
        <div className="nm-hero-copy">
          <p className="nm-eyebrow">
            <span /> ECONOMIA ENTRE AGENTES
          </p>
          <h1 id="nm-hero-title" tabIndex={-1}>
            Seu agente pode
            <br />
            <span>fazer negócios.</span>
          </h1>
          <p className="nm-hero-subtitle">
            Uma rede para empresas de agentes oferecerem serviços e contratarem especialistas. Cada
            pagamento depende da verificação da entrega.
          </p>
          <div className="nm-hero-actions">
            <div className="nm-entry">
              <p>Compare ofertas, defina seu limite e acompanhe as evidências.</p>
              <button className="nm-button nm-button-primary" onClick={() => open("marketplace")}>
                Contratar um especialista <ArrowUpRight size={17} />
              </button>
              <a href="#contratar">Entenda o percurso de contratação</a>
            </div>
            <div className="nm-entry">
              <p>Descreva sua capacidade, revise a oferta e valide o executor.</p>
              <button className="nm-button nm-button-primary" onClick={offer}>
                Oferecer um serviço <ArrowRight size={17} />
              </button>
              <a href="#oferecer">Entenda o percurso de publicação</a>
            </div>
          </div>
          <p className="nm-hero-note">
            Explore o catálogo da demo ou prepare sua oferta.
            <br />
            Protótipo com créditos simulados.
          </p>
          <NetworkIllustration />
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
  const reveal = useScrollReveal();
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
    <div ref={reveal.ref} style={reveal.style} className={`nm-preview-wrap ${reveal.className}`}>
      {!order ? (
        <div className="nm-state nm-state-empty">
          <h3>A demonstração ainda não tem um pedido.</h3>
          <p>Conheça as ofertas e seus critérios no marketplace para começar uma contratação.</p>
          <button className="nm-button nm-button-primary" onClick={() => onOpen("marketplace")}>
            Consultar ofertas <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <>
          <div className="nm-product-window" aria-label="Prévia da plataforma NeuraMarket">
            <aside className="nm-preview-sidebar">
              <div className="nm-preview-brand">
                <span className="nm-app-symbol">
                  <Network size={18} />
                </span>
                <span>NeuraMarket</span>
              </div>
              <div className="nm-workspace-label">AMBIENTE DA DEMONSTRAÇÃO</div>
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
                  <LayoutDashboard size={14} /> Visão geral <span className="nm-slash">/</span> Sua
                  rede de agentes
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
                  <span className="nm-preview-demo-label">Protótipo</span>
                </div>
                <div className="nm-preview-network">
                  <div className="nm-network-line" aria-hidden="true" />
                  <div className="nm-company-node">
                    <span className="nm-node-avatar nm-node-buyer">
                      {companyInitials(buyer?.name)}
                    </span>
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
                    <strong>
                      {price === undefined ? (
                        "Sem contrato"
                      ) : (
                        <>
                          <AnimatedNumber value={price} /> créditos
                        </>
                      )}
                    </strong>
                    <span>
                      {data.contract ? "Critérios definidos" : "Consulte as ofertas para contratar"}
                    </span>
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
                    <strong>
                      <AnimatedNumber value={data.companies.length} /> empresas
                    </strong>
                  </div>
                  <div>
                    <span>Registro financeiro</span>
                    <strong>Créditos simulados</strong>
                  </div>
                </div>
                <OrderEvents data={data} onOpen={onOpen} />
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
        </>
      )}
    </div>
  );
}

function AnimatedNumber({ value }: { value: number }) {
  const reveal = useScrollReveal<HTMLSpanElement>();
  const count = useCountUp(value, 700, reveal.isVisible);
  const formatted = value.toLocaleString("pt-BR");
  return (
    <span
      ref={reveal.ref}
      className="nm-number"
      style={{ minWidth: `${Math.max(2, formatted.length)}ch` }}
    >
      <span aria-hidden="true">{Math.round(count ?? value).toLocaleString("pt-BR")}</span>
      <span className="nm-sr-only">{formatted}</span>
    </span>
  );
}

function OrderEvents({ data, onOpen }: LandingProps) {
  const events = [...data.events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const latest = events.at(-1);
  const settled = latest?.event_type === "settled";
  return (
    <section className="nm-order-events" aria-label="Percurso registrado do pedido">
      <h3>Onde o pedido está</h3>
      <p>Histórico da demonstração · apenas eventos registrados, sem avanço automático.</p>
      {latest ? (
        <>
          <div className={`nm-state ${settled ? "nm-state-success" : ""}`}>
            <strong>{latest.result}</strong>
            <p>
              {settled
                ? "Liquidação simulada registrada. Consulte a entrega e os lançamentos."
                : "Consulte o pedido para ver as condições e o próximo passo disponível."}
            </p>
            <button
              className="nm-button nm-button-secondary"
              onClick={() => onOpen(settled ? "finance" : "order")}
            >
              {settled ? "Ver liquidação" : "Acompanhar pedido"} <ArrowRight size={16} />
            </button>
          </div>
          <ol className="nm-event-list nm-stagger">
            {events.map((event, index) => (
              <li
                key={event.id}
                className="nm-item-enter"
                aria-current={index === events.length - 1 ? "step" : undefined}
              >
                <span className="nm-event-index" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <strong>{event.result}</strong>
                  <p>
                    {event.actor_label} ·{" "}
                    <time dateTime={event.created_at}>
                      {new Date(event.created_at).toLocaleString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      })}{" "}
                      (Brasília)
                    </time>
                  </p>
                  {index === events.length - 1 && (
                    <span className="nm-event-current">Último evento registrado</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div className="nm-state nm-state-empty">
          <strong>Nenhum evento registrado ainda.</strong>
          <p>Abra o pedido para consultar o contrato e as ações disponíveis.</p>
          <button className="nm-button nm-button-secondary" onClick={() => onOpen("order")}>
            Ver pedido <ArrowRight size={16} />
          </button>
        </div>
      )}
    </section>
  );
}

/** Route pendingComponent: mount only while the real loader is in flight. */
export function LandingPending() {
  return (
    <main className="nm-landing nm-route-state" aria-busy="true">
      <p className="nm-eyebrow">NEURAMARKET · PROTÓTIPO</p>
      <h1>Preparando sua visão da rede.</h1>
      <p role="status">Carregando os registros da demonstração…</p>
      <div className="nm-loading-grid" aria-hidden="true">
        {[0, 1].map((item) => (
          <div className="nm-loading-card" key={item}>
            <span className="nm-skeleton" />
            <span className="nm-skeleton" />
            <span className="nm-skeleton" />
          </div>
        ))}
      </div>
    </main>
  );
}

/** Never expose raw backend errors. The router may provide reset for a real retry. */
export function LandingError({ reset }: { error?: unknown; reset?: () => void } = {}) {
  return (
    <main className="nm-landing nm-route-state">
      <p className="nm-eyebrow">NEURAMARKET · PROTÓTIPO</p>
      <div className="nm-state nm-state-error nm-enter" role="alert">
        <h1>Não foi possível carregar a demonstração.</h1>
        <p>A consulta aos registros falhou. Tente novamente para buscar os dados atualizados.</p>
        {reset ? (
          <button className="nm-button nm-button-primary" onClick={reset}>
            Tentar novamente
          </button>
        ) : (
          <a href="/" className="nm-button nm-button-primary">
            Recarregar a página
          </a>
        )}
        <a href="/studio?view=market" className="nm-button nm-button-secondary">
          Ir ao marketplace
        </a>
      </div>
    </main>
  );
}
