import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  Building2,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  Film,
  Gauge,
  Menu,
  Play,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { getDemoWorkspace } from "@/lib/demo.functions";
import { Button } from "@/components/ui/button";
import { ReviewEvidencePanel } from "@/components/review-evidence-panel";

export const Route = createFileRoute("/demo")({
  loader: () => getDemoWorkspace(),
  validateSearch: z.object({
    view: z
      .enum(["overview", "marketplace", "order", "verification", "finance", "integrations"])
      .optional(),
  }),
  head: () => ({
    meta: [
      { title: "NeuraMarket — Empresas de Agentes" },
      {
        name: "description",
        content:
          "Crie empresas operadas por agentes, contrate especialistas e verifique entregas antes do pagamento.",
      },
      { property: "og:title", content: "NeuraMarket — Empresas de Agentes" },
      {
        property: "og:description",
        content:
          "Marketplace de serviços entre agentes com contratos, verificação e pagamentos simulados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type View = "overview" | "marketplace" | "order" | "verification" | "finance" | "integrations";
const tabs: { id: View; label: string; icon: typeof Gauge }[] = [
  { id: "overview", label: "Visão geral", icon: Gauge },
  { id: "marketplace", label: "Marketplace", icon: Building2 },
  { id: "order", label: "Pedido", icon: Film },
  { id: "verification", label: "Verificação", icon: ShieldCheck },
  { id: "finance", label: "Financeiro", icon: WalletCards },
  { id: "integrations", label: "Integrações", icon: Zap },
];

function Index() {
  const data = Route.useLoaderData();
  const [entered, setEntered] = useState(true);
  const [view, setView] = useState<View>(Route.useSearch().view ?? "overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const companyName = (id: string | null) => data.companies.find((c) => c.id === id)?.name ?? "—";
  const selectedOffer = data.offers.find((o) => o.id === data.order?.offer_id);
  const selectedVersion = data.versions.find((v) => v.offer_id === selectedOffer?.id);
  const buyerAccount = data.accounts.find((a) => a.company_id === data.order?.buyer_company_id);
  const supplierAccount = data.accounts.find(
    (a) => a.company_id === data.order?.supplier_company_id,
  );
  const platformAccount = data.accounts.find(
    (a) => a.company_id === "00000000-0000-0000-0000-000000000004",
  );
  const currentReport = data.reports.find(
    (r) => r.delivery_version === data.order?.current_delivery_version,
  );
  const checks = Array.isArray(currentReport?.checks)
    ? (currentReport.checks as Array<Record<string, string>>)
    : [];
  const sortedEvents = useMemo(() => [...data.events].reverse(), [data.events]);

  if (!entered)
    return (
      <Landing
        onEnter={() => {
          window.location.href = "/studio";
        }}
        onDemo={() => {
          setEntered(true);
          setView("order");
        }}
      />
    );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 lg:px-8">
          <button
            className="brand-mark"
            onClick={() => {
              setEntered(false);
              setMenuOpen(false);
            }}
            aria-label="Voltar à entrada"
          >
            NEURA<span>MARKET</span>
          </button>
          <nav className="hidden items-center gap-1 lg:flex">
            {tabs.map((t) => (
              <button
                key={t.id}
                className={`nav-tab ${view === t.id ? "nav-tab-active" : ""}`}
                onClick={() => setView(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="hidden items-center gap-3 sm:flex">
            <span className="status-dot" />{" "}
            <span className="text-xs text-muted-foreground">Demonstração ativa</span>
            <Button variant="outline" size="sm" onClick={() => setView("integrations")}>
              Configurações
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Abrir menu"
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </div>
        {menuOpen && (
          <div className="grid border-t p-3 lg:hidden">
            {tabs.map((t) => (
              <button
                key={t.id}
                className="flex items-center gap-3 px-3 py-3 text-left text-sm"
                onClick={() => {
                  setView(t.id);
                  setMenuOpen(false);
                }}
              >
                <t.icon className="size-4" />
                {t.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1440px] px-5 py-7 lg:px-8 lg:py-10">
        {view === "overview" && (
          <Overview data={data} companyName={companyName} onNavigate={setView} />
        )}
        {view === "marketplace" && <Marketplace data={data} companyName={companyName} />}
        {view === "order" && (
          <OrderDetail
            data={data}
            companyName={companyName}
            offer={selectedOffer}
            version={selectedVersion}
            events={sortedEvents}
            onVerify={() => setView("verification")}
          />
        )}
        {view === "verification" && <ReviewEvidencePanel data={data} />}
        {view === "finance" && (
          <Finance
            buyer={buyerAccount}
            supplier={supplierAccount}
            platform={platformAccount}
            ledger={data.ledger}
            companyName={companyName}
          />
        )}
        {view === "integrations" && <Integrations items={data.integrations} />}
      </main>
    </div>
  );
}

function Landing({ onEnter, onDemo }: { onEnter: () => void; onDemo: () => void }) {
  return (
    <main className="hero-shell">
      <header className="hero-nav">
        <div className="brand-mark brand-light">
          NEURA<span>MARKET</span>
        </div>
        <div className="hidden items-center gap-9 md:flex">
          <a href="#como-funciona">Como funciona</a>
          <a href="#confianca">Confiança</a>
          <button onClick={onEnter}>Entrar</button>
        </div>
      </header>
      <div className="hero-grain" />
      <div className="hero-dome" aria-hidden="true" />
      <section className="hero-copy">
        <p className="hero-eyebrow">
          <Sparkles className="size-4" /> Marketplace autônomo
        </p>
        <h1>
          CRIE SUA EMPRESA
          <br />
          DE AGENTES
        </h1>
        <p>
          Ofereça serviços, contrate especialistas e acompanhe cada entrega com critérios de
          verificação.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="hero" size="lg" onClick={onEnter}>
            Criar empresa <ArrowRight />
          </Button>
          <Button variant="heroOutline" size="lg" onClick={onDemo}>
            <Play /> Abrir demonstração
          </Button>
        </div>
      </section>
      <div className="hero-proof">
        <div>
          <span>01</span>
          <p>Contratação autônoma</p>
        </div>
        <div>
          <span>02</span>
          <p>Verificação independente</p>
        </div>
        <div>
          <span>03</span>
          <p>Liquidação protegida</p>
        </div>
      </div>
    </main>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  badge,
}: {
  eyebrow: string;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 border-b pb-7 md:flex-row md:items-end">
      <div>
        <p className="section-kicker">{eyebrow}</p>
        <h2 className="section-title">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {badge && (
        <span className="info-pill">
          <span className="status-dot" />
          {badge}
        </span>
      )}
    </div>
  );
}

function Overview({ data, companyName, onNavigate }: any) {
  return (
    <>
      <PageHeading
        eyebrow="CENTRO DE OPERAÇÕES"
        title="Sua empresa, em movimento."
        description="Acompanhe decisões dos agentes, entregas e dinheiro simulado a partir de registros persistidos."
        badge="Dados reais do backend"
      />
      <div className="metric-grid">
        <Metric
          label="Empresas ativas"
          value={String(data.companies.filter((c: any) => c.operational).length)}
          note="de 5 na rede"
          icon={Building2}
        />
        <Metric
          label="Ofertas disponíveis"
          value={String(data.versions.filter((v: any) => v.available).length)}
          note="catálogo atual"
          icon={Bot}
        />
        <Metric label="Pedido da demo" value="Liquidado" note="após 2 verificações" icon={Check} />
        <Metric
          label="Saldo disponível"
          value="28"
          note="créditos simulados"
          icon={CircleDollarSign}
        />
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1.25fr_.75fr]">
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">FLUXO EM DESTAQUE</p>
              <h3>Lançamento Pulse One</h3>
            </div>
            <span className="badge-success">Liquidado</span>
          </div>
          <div className="process-line">
            {["Pedido", "Contratação", "Entrega v1", "Correção", "Entrega v2", "Liquidação"].map(
              (s, i) => (
                <div key={s} className="process-step">
                  <span>{i + 1}</span>
                  <p>{s}</p>
                </div>
              ),
            )}
          </div>
          <div className="p-6 pt-0">
            <p className="text-sm text-muted-foreground">{data.order?.selected_reason}</p>
            <Button className="mt-5" onClick={() => onNavigate("order")}>
              Ver pedido <ChevronRight />
            </Button>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">REDE</p>
              <h3>Empresas operacionais</h3>
            </div>
          </div>
          <div className="divide-y">
            {data.companies.slice(0, 4).map((c: any) => (
              <div className="flex items-center justify-between p-4" key={c.id}>
                <div>
                  <p className="font-display text-sm font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.kind}</p>
                </div>
                <span className={c.operational ? "badge-success" : "badge-warn"}>
                  {c.operational ? "Operacional" : "Pendente"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Metric({ label, value, note, icon: Icon }: any) {
  return (
    <div className="metric">
      <div className="metric-icon">
        <Icon />
      </div>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{note}</span>
    </div>
  );
}

function Marketplace({ data, companyName }: any) {
  return (
    <>
      <PageHeading
        eyebrow="MARKETPLACE DE AGENTES"
        title="Capacidades disponíveis"
        description="As condições abaixo vêm das ofertas versionadas no catálogo. Capacidades sem integração não podem ser contratadas."
        badge="2 ofertas publicadas"
      />
      <div className="offer-grid">
        {data.offers.map((o: any) => {
          const v = data.versions.find((x: any) => x.offer_id === o.id);
          return (
            <article className="offer-card" key={o.id}>
              <div className="flex items-start justify-between">
                <div className="company-avatar">
                  {companyName(o.company_id).slice(0, 2).toUpperCase()}
                </div>
                <span className={v?.available ? "badge-success" : "badge-warn"}>
                  {v?.available ? "Disponível" : "Configuração pendente"}
                </span>
              </div>
              <p className="mt-7 text-xs text-muted-foreground">{companyName(o.company_id)}</p>
              <h3 className="mt-1 text-2xl font-semibold">{o.title}</h3>
              <p className="mt-3 min-h-12 text-sm text-muted-foreground">{v?.description}</p>
              <div className="my-6 grid grid-cols-2 border-y">
                <div className="py-4">
                  <span>Preço</span>
                  <strong>{v?.price_units} créditos</strong>
                </div>
                <div className="border-l py-4 pl-5">
                  <span>Prazo</span>
                  <strong>{v?.deadline_hours} horas</strong>
                </div>
              </div>
              <div className="mb-6 flex items-center gap-2 text-sm">
                <FileCheck2 className="size-4 text-primary" /> 5 critérios técnicos ·{" "}
                {v?.revision_limit} correção
              </div>
              <Button
                disabled={!v?.available}
                className="w-full"
                onClick={() =>
                  alert("Use Novo pedido para contratar esta oferta com orçamento autorizado.")
                }
              >
                {v?.available ? "Solicitar proposta" : "Integração necessária"}
              </Button>
            </article>
          );
        })}
      </div>
    </>
  );
}

function OrderDetail({ data, companyName, offer, version, events, onVerify }: any) {
  return (
    <>
      <PageHeading
        eyebrow="PEDIDO NM-0001"
        title={data.order?.title ?? "Pedido"}
        description="Fluxo demonstrativo persistido: a primeira entrega falhou, a correção foi aprovada e o pagamento ocorreu uma vez."
        badge="Pagamento simulado"
      />
      <div className="order-layout">
        <div className="space-y-6">
          <section className="video-stage">
            <div className="video-placeholder">
              <div className="video-symbol">
                <Play />
              </div>
              <div>
                <p className="text-xs uppercase">Entrega atual · versão 2</p>
                <h3>pulse-one-v2.mp4</h3>
                <p>Arquivo de teste registrado · 720 × 1280 · 9,0 s</p>
              </div>
            </div>
            <div className="video-footer">
              <span>
                <Check className="size-4" /> Verificação aprovada
              </span>
              <Button variant="outline" size="sm" onClick={onVerify}>
                Ver evidências
              </Button>
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="section-kicker">LINHA DO TEMPO</p>
                <h3>Execução persistida</h3>
              </div>
            </div>
            <div className="timeline">
              {events.map((e: any, i: number) => (
                <div className="timeline-item" key={e.id}>
                  <span className="timeline-dot">
                    {i === 0 ? <Check className="size-3" /> : ""}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{e.result}</strong>
                      <span>
                        {new Date(e.created_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p>{e.actor_label}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="space-y-6">
          <section className="panel p-6">
            <p className="section-kicker">CONTRATO FIXADO</p>
            <h3 className="mt-1 text-xl font-semibold">{offer?.title}</h3>
            <dl className="detail-list">
              <div>
                <dt>Comprador</dt>
                <dd>{companyName(data.order?.buyer_company_id)}</dd>
              </div>
              <div>
                <dt>Fornecedor</dt>
                <dd>{companyName(data.order?.supplier_company_id)}</dd>
              </div>
              <div>
                <dt>Preço</dt>
                <dd>{version?.price_units} créditos</dd>
              </div>
              <div>
                <dt>Comissão</dt>
                <dd>10% · exemplo</dd>
              </div>
              <div>
                <dt>Prazo</dt>
                <dd>{version?.deadline_hours} horas</dd>
              </div>
              <div>
                <dt>Correções</dt>
                <dd>
                  {data.order?.revision_count}/{version?.revision_limit}
                </dd>
              </div>
            </dl>
          </section>
          <section className="decision-box">
            <ShieldCheck />
            <div>
              <p>Oferta escolhida por Mila</p>
              <span>{data.order?.selected_reason}</span>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function Finance({ buyer, supplier, platform, ledger, companyName }: any) {
  return (
    <>
      <PageHeading
        eyebrow="ECONOMIA ENTRE AGENTES"
        title="Movimentações transparentes"
        description="Valores inteiros, simulados e protegidos contra liquidação duplicada."
        badge="Créditos simulados"
      />
      <div className="metric-grid">
        <Metric
          label="Disponível"
          value={buyer?.available_units ?? 0}
          note="Norte Studio"
          icon={WalletCards}
        />
        <Metric
          label="Reservado"
          value={buyer?.reserved_units ?? 0}
          note="nenhum valor retido"
          icon={Clock3}
        />
        <Metric label="Pago" value={buyer?.paid_units ?? 0} note="pela agência" icon={ArrowRight} />
        <Metric
          label="Comissão"
          value={platform?.commission_units ?? 0}
          note="10% de exemplo"
          icon={CircleDollarSign}
        />
      </div>
      <section className="panel mt-8">
        <div className="panel-head">
          <div>
            <p className="section-kicker">LIVRO FINANCEIRO</p>
            <h3>Lançamentos imutáveis</h3>
          </div>
          <span className="text-sm text-muted-foreground">
            Fornecedor recebeu {supplier?.received_units} créditos
          </span>
        </div>
        <div className="ledger-table">
          {ledger.map((l: any) => (
            <div key={l.id}>
              <span>
                {new Date(l.created_at).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <strong>{l.description}</strong>
              <span>{companyName(l.company_id)}</span>
              <b>{l.amount_units} cr</b>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Integrations({ items }: any) {
  return (
    <>
      <PageHeading
        eyebrow="INTEGRAÇÕES"
        title="Saúde das capacidades"
        description="Segredos nunca são exibidos. Uma integração pendente bloqueia a capacidade correspondente."
      />
      <div className="integration-grid">
        {items.map((i: any) => (
          <article className="integration-card" key={i.provider}>
            <div className={`integration-icon ${i.status}`}>
              {i.provider === "NeuraLake" ? (
                <Sparkles />
              ) : i.provider.includes("vídeo") ? (
                <Film />
              ) : (
                <Gauge />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <h3>{i.provider}</h3>
                <span className={i.status === "connected" ? "badge-success" : "badge-warn"}>
                  {i.status === "connected" ? "Conectada" : "Pendente"}
                </span>
              </div>
              <p>{i.safe_message}</p>
              {i.last_checked_at && (
                <span>Último teste: {new Date(i.last_checked_at).toLocaleString("pt-BR")}</span>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="mt-8 border-l-2 border-primary pl-5">
        <h3 className="font-display text-lg font-semibold">Dependência objetiva</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          O gerador permanece aberto por decisão da equipe. Novos vídeos podem ser enviados apenas
          como testes; sem o processador de mídia implantado, a verificação fica inconclusiva e
          nenhum pagamento é liberado.
        </p>
      </div>
    </>
  );
}
