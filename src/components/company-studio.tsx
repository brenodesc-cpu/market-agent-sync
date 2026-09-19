import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Building2,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileCheck2,
  Globe,
  KeyRound,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import {
  isLocalPreview,
  loginCallbackError,
  loginReturnUrl,
  PUBLISHED_STUDIO,
} from "@/lib/auth-flow";
import type { StudioWorkspace, StudioDetails } from "@/lib/studio.types";
import {
  getStudioBootstrap,
  getStudioWorkspace,
  executeStudioOrder,
  getStudioOrder,
  cancelStudioOrder,
  createAgentKey,
  revokeAgentKey,
  addReviewClarification,
  submitHumanReview,
  setCompanyCommercial,
} from "@/lib/studio.functions";
import { StudioAccessError } from "@/lib/studio-access";
import { AgentMarket } from "./agent-market";
import { AgentBuilder } from "./agent-builder";
import { AgentOutput, downloadAgentFile } from "./agent-output";
import { ReviewAssistant } from "./review-assistant";
import "@/studio.css";

type View =
  "mission" | "builder" | "companies" | "market" | "orders" | "wallet" | "api" | "integrations";
type Bootstrap = Awaited<ReturnType<typeof getStudioBootstrap>>;
const navigation = [
  { id: "mission", label: "Executar missão", icon: Sparkles, primary: true },
  { id: "builder", label: "Criar especialista", icon: Plus, primary: false },
  { id: "companies", label: "Minhas empresas", icon: Building2, primary: false },
  { id: "market", label: "Marketplace", icon: Store, primary: false },
  { id: "orders", label: "Entregas", icon: FileCheck2, primary: false },
] as const;
const accountNavigation = [
  { id: "wallet", label: "Créditos", icon: Wallet },
  { id: "api", label: "Conectar agentes", icon: KeyRound },
  { id: "integrations", label: "Integrações", icon: Settings2 },
] as const;
const EMPTY_WORKSPACE: StudioWorkspace = {
  companies: [],
  agents: [],
  accounts: [],
  orders: [],
  offers: [],
  ledger: [],
  credentials: [],
};
const STATUS: Record<string, string> = {
  draft: "Rascunho",
  contracted: "Valor reservado",
  in_progress: "Executando",
  delivered: "Entrega recebida",
  verifying: "Verificando",
  revision_requested: "Correção necessária",
  verification_inconclusive: "Revisão pendente",
  accepted: "Aguardando seu aceite",
  settled: "Pagamento concluído",
  cancelled: "Cancelado",
  expired: "Expirado",
};
function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/insufficient|saldo/.test(message))
    return "O saldo não cobre esta contratação. Reduza o preço ou escolha outra empresa.";
  if (
    /PGRST|schema cache|does not exist|function .*not|Backend indisponível|SUPABASE_SERVICE_ROLE_KEY/.test(
      message,
    )
  )
    return "A estrutura do marketplace ainda precisa ser ativada no Lovable. Confira a aba Integrações.";
  if (/Unauthorized|authentication|JWT/.test(message)) return "Entre na sua conta para continuar.";
  if (/stale_review/.test(message))
    return "A entrega mudou. Abra o pedido novamente e confira a versão atual.";
  if (/objective_checks_required/.test(message))
    return "O arquivo precisa passar em todos os testes antes do seu aceite.";
  if (/review_already_recorded/.test(message))
    return "Esta versão já recebeu uma decisão. Confira o histórico do pedido.";
  if (/human_approval_required/.test(message))
    return "O pagamento aguarda o aceite do responsável pela compra.";
  if (/review_access_denied/.test(message))
    return "Somente o responsável pela empresa compradora pode aceitar a entrega.";
  if (/revision_limit/.test(message))
    return "O contrato já usou a correção permitida. Você pode cancelar e recuperar a reserva.";
  if (/deadline_expired/.test(message))
    return "O prazo terminou. Cancele para recuperar a reserva.";
  if (/idempotency_conflict/.test(message))
    return "Essa solicitação já foi registrada com outros dados. Confira a lista de pedidos antes de repetir.";
  return message && message.length < 220
    ? message
    : "Não foi possível concluir. Seus dados permanecem disponíveis; tente novamente.";
}
export function CompanyStudio({
  initialView = "builder",
  initialCompany,
}: {
  initialView?: View;
  initialCompany?: string;
}) {
  const routeNavigate = useNavigate();
  const [view, setView] = useState<View>(initialView);
  const [sidebar, setSidebar] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [connectionReady, setConnectionReady] = useState(false);
  const [login, setLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [bootstrap, setBootstrap] = useState<Bootstrap>({
    offers: [],
    setupMessage: null,
    backendConfigured: false,
    neuralakeConfigured: false,
    agoraConfigured: false,
  });
  const [workspace, setWorkspace] = useState<StudioWorkspace>(EMPTY_WORKSPACE);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [buyer, setBuyer] = useState(initialCompany ?? "");
  const [order, setOrder] = useState<StudioDetails | null>(null);
  const [note, setNote] = useState("");
  const [credential, setCredential] = useState("");
  const [apiCompany, setApiCompany] = useState("");
  const [origin, setOrigin] = useState("");
  const alive = useRef(true);
  const activeUser = useRef(user);
  activeUser.current = user;

  useEffect(() => {
    setView(initialView);
    if (initialCompany) setBuyer(initialCompany);
  }, [initialView, initialCompany]);

  async function refresh() {
    const requestedBy = activeUser.current;
    const data = await getStudioWorkspace();
    if (!alive.current || requestedBy !== activeUser.current) return;
    setWorkspace(data);
    setBuyer((current) =>
      data.companies.some((c) => c.id === current)
        ? current
        : (data.companies.find((c) => c.kind === "ai-specialist")?.id ??
          data.companies[0]?.id ??
          ""),
    );
    setApiCompany((current) =>
      data.companies.some((c) => c.id === current) ? current : (data.companies[0]?.id ?? ""),
    );
  }
  useEffect(() => {
    alive.current = true;
    setOrigin(window.location.origin);
    const callbackError = loginCallbackError(window.location.href);
    if (callbackError) {
      setError(callbackError);
      setLogin(true);
      const clean = new URL(window.location.href);
      clean.hash = "";
      for (const key of ["error", "error_code", "error_description", "state"])
        clean.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", clean.pathname + clean.search);
    }
    void getStudioBootstrap()
      .then((data) => {
        if (alive.current) setBootstrap(data);
      })
      .catch(() => {
        if (alive.current)
          setError(
            "Não conseguimos verificar a conexão do estúdio. Recarregue a página antes de continuar.",
          );
      })
      .finally(() => {
        if (alive.current) setConnectionReady(true);
      });
    void supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (sessionError) throw sessionError;
        if (alive.current) {
          setUser(data.session?.user.id ?? null);
          setAuthReady(true);
        }
      })
      .catch(() => {
        if (alive.current) {
          setAuthReady(true);
          setError("Não foi possível verificar sua sessão. Entre novamente.");
        }
      });
    const listener = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user.id ?? null);
      setAuthReady(true);
      if (session) {
        setLogin(false);
        setLoginMessage("");
      }
    });
    return () => {
      alive.current = false;
      listener.data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (user) void refresh().catch((e) => setError(friendlyError(e)));
    else {
      setWorkspace(EMPTY_WORKSPACE);
      setCredential("");
      setOrder(null);
    }
  }, [user]);
  const readiness = {
    checked: connectionReady && authReady,
    backendConfigured: bootstrap.backendConfigured,
    neuralakeConfigured: bootstrap.neuralakeConfigured,
  };
  function navigate(next: View, companyId?: string) {
    setView(next);
    if (companyId) setBuyer(companyId);
    void routeNavigate({
      to: "/studio",
      search: {
        view: next,
        company:
          next === "mission" || next === "market" ? companyId || buyer || undefined : undefined,
      },
    });
    setSidebar(false);
    setError("");
    setNotice("");
  }
  async function action(label: string, work: () => Promise<void>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      if (e instanceof StudioAccessError && e.reason === "login") setLogin(true);
      setError(friendlyError(e));
    } finally {
      setBusy("");
    }
  }
  async function loadOrder(id: string) {
    await action("load-order", async () => {
      setOrder(await getStudioOrder({ data: { orderId: id } }));
      navigate("orders");
    });
  }
  async function execute() {
    if (order)
      await action("execute", async () => {
        setOrder(await executeStudioOrder({ data: { orderId: order.order.id } }));
        await refresh();
      });
  }
  async function cancel() {
    if (order)
      await action("cancel", async () => {
        await cancelStudioOrder({ data: { orderId: order.order.id } });
        setOrder(await getStudioOrder({ data: { orderId: order.order.id } }));
        await refresh();
      });
  }
  const offers = user ? workspace.offers : bootstrap.offers;
  const currentDelivery = order?.deliveries.find(
    (delivery) => delivery.version === order.order.current_delivery_version,
  );
  const currentReport = order?.reports.find((report) => report.delivery_id === currentDelivery?.id);
  const buyerOwned = workspace.companies.some(
    (company) => company.id === order?.order.buyer_company_id,
  );

  return (
    <div className="studio-app">
      {sidebar && (
        <button
          className="studio-shade"
          aria-label="Fechar navegação"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`studio-sidebar ${sidebar ? "is-open" : ""}`}>
        <Link to="/" className="studio-brand">
          <span className="studio-brand-icon">n</span>neuramarket
          <span className="studio-beta">beta</span>
        </Link>
        <div className="studio-space">
          <span className="studio-space-avatar">
            {workspace.companies[0]?.name.slice(0, 1) ?? "N"}
          </span>
          <div>
            <strong>Minha operação</strong>
            <small>
              {user
                ? `${workspace.companies.length} ${workspace.companies.length === 1 ? "empresa" : "empresas"}`
                : "Crie sua primeira empresa"}
            </small>
          </div>
        </div>
        <nav aria-label="Navegação principal">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`${item.primary ? "studio-mission-nav" : ""} ${
                view === item.id ? "active" : ""
              }`}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={17} />
              {item.label}
              {item.id === "orders" && workspace.orders.length > 0 && (
                <span>{workspace.orders.length}</span>
              )}
            </button>
          ))}
        </nav>
        {workspace.companies.length > 0 && (
          <div className="studio-recent">
            <span>SUAS EMPRESAS</span>
            {workspace.companies.slice(0, 5).map((company) => (
              <button
                key={company.id}
                className={view === "mission" && buyer === company.id ? "active" : ""}
                onClick={() => navigate("mission", company.id)}
              >
                <span>{company.name[0]}</span>
                <strong>{company.name}</strong>
              </button>
            ))}
          </div>
        )}
        <div className="studio-sidebar-bottom">
          <details
            className="studio-account-settings"
            open={accountNavigation.some((item) => item.id === view) || undefined}
          >
            <summary>
              <Settings2 size={16} /> Configurações
            </summary>
            <nav aria-label="Configurações">
              {accountNavigation.map((item) => (
                <button
                  key={item.id}
                  className={view === item.id ? "active" : ""}
                  onClick={() => navigate(item.id)}
                >
                  <item.icon size={16} />
                  {item.label}
                </button>
              ))}
            </nav>
          </details>
          <div className="studio-credit-note">
            <ShieldCheck size={17} />
            <div>
              Economia em demonstração<small>Todos os créditos são simulados.</small>
            </div>
          </div>
          <button onClick={() => (user ? void supabase.auth.signOut() : setLogin(true))}>
            {user ? <LogOut size={16} /> : <Globe size={16} />}{" "}
            {user ? "Sair da conta" : "Entrar ou criar conta"}
          </button>
        </div>
      </aside>
      <section className="studio-main">
        <header className="studio-topbar">
          <div className="studio-breadcrumb">
            <button
              className="studio-icon-button studio-menu"
              onClick={() => setSidebar(true)}
              aria-label="Abrir navegação"
            >
              <Menu size={20} />
            </button>
            <span>Minha operação</span>
            <ChevronRight size={14} />
            <strong>
              {view === "mission"
                ? "Executar missão"
                : [...navigation, ...accountNavigation].find((item) => item.id === view)?.label}
            </strong>
          </div>
          <div className="studio-header-actions">
            {view === "builder" ? (
              <span className="studio-header-hint">Descreva uma ideia para começar</span>
            ) : (
              <button className="studio-secondary" onClick={() => navigate("builder")}>
                <Plus size={16} />
                Criar especialista
              </button>
            )}
          </div>
        </header>
        {(error || notice) && (
          <div
            role={error ? "alert" : "status"}
            className={`studio-alert ${error ? "error" : "success"}`}
          >
            {error || notice}
            <button
              aria-label="Fechar aviso"
              onClick={() => {
                setError("");
                setNotice("");
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {connectionReady && (!bootstrap.backendConfigured || !bootstrap.neuralakeConfigured) && (
          <div className="studio-connection-notice" role="status">
            <strong>
              {!bootstrap.backendConfigured
                ? "Este ambiente precisa do servidor conectado"
                : "A criação com IA está indisponível neste ambiente"}
            </strong>
            <p>
              {!bootstrap.backendConfigured
                ? "A criação dos agentes e a publicação precisam do servidor conectado. Seu rascunho permanece neste navegador."
                : "A criação e os testes dos agentes precisam da conexão com a NeuraLake. Use a versão online para continuar."}
            </p>
            {origin && new URL(origin).hostname !== "market-agent-sync.lovable.app" && (
              <a className="studio-secondary" href="https://market-agent-sync.lovable.app/studio">
                Abrir versão online <ArrowRight size={15} />
              </a>
            )}
          </div>
        )}

        {view === "builder" && (
          <AgentBuilder
            key={user ?? "visitor"}
            userId={user}
            ready={
              readiness.checked && bootstrap.backendConfigured && bootstrap.neuralakeConfigured
            }
            onLogin={() => setLogin(true)}
            onSaved={async (id, published) => {
              setBuyer(id);
              setApiCompany(id);
              navigate("mission", id);
              setNotice(
                published
                  ? "Agente publicado. Ele já pode receber pedidos no marketplace."
                  : "Agente salvo. Escreva uma tarefa para começar a usar.",
              );
              try {
                await refresh();
              } catch {
                setNotice("Agente salvo. Use Atualizar agentes para carregar a lista.");
              }
            }}
          />
        )}

        {view === "companies" && (
          <div className="studio-page">
            <PageTitle
              eyebrow="SEU ESPAÇO"
              title="Seus agentes"
              description="Use seus especialistas e gerencie os serviços que você oferece na rede."
            />
            {user && (
              <button
                className="studio-secondary"
                disabled={Boolean(busy)}
                onClick={() => void action("refresh", refresh)}
              >
                Atualizar agentes
              </button>
            )}
            {!user ? (
              <Empty
                title="Entre para criar seu primeiro agente"
                text="Seu rascunho continua salvo neste navegador."
                action="Entrar"
                onClick={() => setLogin(true)}
              />
            ) : workspace.companies.length === 0 ? (
              <Empty
                title="Seu primeiro agente começa com uma ideia"
                text="Descreva o serviço, revise a oferta e publique no marketplace."
                action="Criar agente"
                onClick={() => navigate("builder")}
              />
            ) : (
              <div className="studio-cards">
                {workspace.companies.map((company) => {
                  const balance = workspace.accounts.find((a) => a.company_id === company.id);
                  return (
                    <article className="studio-business-card" key={company.id}>
                      <div className="studio-business-top">
                        <span className="studio-company-mark small">
                          {company.name.slice(0, 1)}
                        </span>
                        <span className="studio-tag">
                          {company.visibility === "private" ? "Privada" : "Comercial"}
                        </span>
                      </div>
                      <h2>{company.name}</h2>
                      <p>{company.description}</p>
                      <div className="studio-card-balance">
                        <strong>
                          {balance?.available_units ?? 0} <small>créditos</small>
                        </strong>
                        <span>{balance?.reserved_units ?? 0} reservados</span>
                      </div>
                      <button
                        className="studio-primary"
                        onClick={() => navigate("mission", company.id)}
                      >
                        Executar missão <ArrowRight size={16} />
                      </button>
                      {company.visibility === "commercial" && (
                        <details className="studio-agent-options">
                          <summary>Gerenciar publicação</summary>
                          <button
                            className="studio-text-button"
                            disabled={!!busy}
                            onClick={() =>
                              void action("visibility", async () => {
                                await setCompanyCommercial({
                                  data: { companyId: company.id, enabled: false },
                                });
                                await refresh();
                              })
                            }
                          >
                            Retirar do marketplace
                          </button>
                        </details>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {(view === "mission" || view === "market") && (
          <AgentMarket
            key={`${view}:${user ?? "visitor"}:${buyer}`}
            mode={view}
            initialCompany={buyer}
            workspace={{ ...workspace, offers }}
            signedIn={!!user}
            onLogin={() => setLogin(true)}
            onCreate={() => navigate("builder")}
            onRefresh={refresh}
            onOrder={(detail) => {
              setOrder(detail);
              navigate("orders");
            }}
          />
        )}

        {view === "orders" && (
          <div className="studio-page">
            <PageTitle
              eyebrow="DA CONTRATAÇÃO AO RESULTADO"
              title="Pedidos e entregas"
              description="Acompanhe o que cada agente fez e os critérios usados na verificação."
            />
            {order ? (
              <>
                <button className="studio-text-button" onClick={() => setOrder(null)}>
                  ← Todos os pedidos
                </button>
                <div className="studio-order-heading">
                  <div>
                    <h2>{order.order.title}</h2>
                    <code>{order.order.id.slice(0, 8)}</code>
                  </div>
                  <span className={`studio-status ${order.order.status}`}>
                    {STATUS[order.order.status] ?? order.order.status}
                  </span>
                </div>
                {Boolean(busy) && (
                  <div className="studio-working" role="status">
                    <LoaderCircle size={18} className="animate-spin" />
                    Aguardando a operação do servidor...
                  </div>
                )}
                <div className="studio-order-columns">
                  <section>
                    <div className="studio-section-card">
                      <div className="studio-section-heading">
                        <h3>Entrega atual</h3>
                        {currentDelivery && (
                          <span className="studio-tag">Versão {currentDelivery.version}</span>
                        )}
                      </div>
                      {currentDelivery ? (
                        <>
                          <div className="studio-artifact">
                            <FileCheck2 size={34} />
                            <div>
                              <strong>{currentDelivery.file_name}</strong>
                              <p>Trabalho entregue pelo agente fornecedor</p>
                            </div>
                            <button
                              className="studio-secondary"
                              onClick={() =>
                                downloadAgentFile(
                                  currentDelivery.artifact_content ?? "",
                                  currentDelivery.file_name,
                                  currentDelivery.media_type,
                                )
                              }
                              disabled={!currentDelivery.artifact_content}
                            >
                              <Download size={16} />
                              Baixar
                            </button>
                          </div>
                          <code className="studio-file-hash">SHA-256 {currentDelivery.sha256}</code>
                          {currentDelivery.artifact_content && (
                            <AgentOutput value={currentDelivery.artifact_content} />
                          )}
                          {currentDelivery.test_upload && (
                            <p className="studio-help">
                              Cenário de teste identificado. A primeira entrega recebeu um erro
                              proposital de preço.
                            </p>
                          )}
                          {currentReport && (
                            <>
                              <p className="studio-verdict">{currentReport.summary}</p>
                              {currentReport.checks.map((check) => (
                                <div
                                  className={`studio-evidence ${check.status}`}
                                  key={check.criterion}
                                >
                                  <span>
                                    {check.status === "passed" ? (
                                      <Check size={16} />
                                    ) : (
                                      <X size={16} />
                                    )}
                                  </span>
                                  <div>
                                    <strong>{check.criterion}</strong>
                                    <small>{check.evidence}</small>
                                  </div>
                                  <b>{check.status === "passed" ? "Passou" : "Falhou"}</b>
                                </div>
                              ))}
                            </>
                          )}
                        </>
                      ) : (
                        <p className="studio-muted">
                          O valor está reservado. O fornecedor ainda não enviou uma entrega.
                        </p>
                      )}
                    </div>
                    {order.contract.requires_human_review && currentDelivery && currentReport && (
                      <div className="studio-section-card">
                        <h3>Seu aceite libera o pagamento</h3>
                        <p>
                          Confira o arquivo e as evidências.{" "}
                          {bootstrap?.agoraConfigured
                            ? "Você pode conversar por voz antes de decidir."
                            : "O assistente de texto pode explicar as evidências."}{" "}
                          O aceite vale apenas para esta versão.
                        </p>
                        {order.humanReviews
                          ?.filter((r) => r.delivery_id === currentDelivery.id)
                          .map((r) => (
                            <p key={r.id}>
                              <strong>
                                {r.decision === "approved"
                                  ? "Aprovado pelo responsável"
                                  : "Correção solicitada pelo responsável"}
                              </strong>
                              : {r.note}
                            </p>
                          ))}
                        {buyerOwned &&
                          !["settled", "cancelled", "expired"].includes(order.order.status) &&
                          !order.humanReviews?.some(
                            (r) => r.delivery_id === currentDelivery.id,
                          ) && (
                            <>
                              <label>
                                Motivo da decisão
                                <textarea
                                  value={note}
                                  onChange={(e) => setNote(e.target.value)}
                                  maxLength={1500}
                                  placeholder="O que você conferiu ou o que precisa ser corrigido?"
                                />
                              </label>
                              <div className="studio-order-actions">
                                <button
                                  className="studio-primary"
                                  disabled={
                                    !!busy ||
                                    note.trim().length < 3 ||
                                    currentReport.decision !== "approved"
                                  }
                                  onClick={() =>
                                    void action("human-review", async () => {
                                      const updated = await submitHumanReview({
                                        data: {
                                          orderId: order.order.id,
                                          deliveryId: currentDelivery.id,
                                          reportId: currentReport.id,
                                          sha256: currentDelivery.sha256,
                                          decision: "approved",
                                          note,
                                        },
                                      });
                                      setOrder(updated);
                                      setNote("");
                                      await refresh();
                                    })
                                  }
                                >
                                  Aprovar e liberar {order.contract.price_units} créditos
                                </button>
                                <button
                                  className="studio-secondary"
                                  disabled={!!busy || note.trim().length < 3}
                                  onClick={() =>
                                    void action("human-review", async () => {
                                      setOrder(
                                        await submitHumanReview({
                                          data: {
                                            orderId: order.order.id,
                                            deliveryId: currentDelivery.id,
                                            reportId: currentReport.id,
                                            sha256: currentDelivery.sha256,
                                            decision: "rejected",
                                            note,
                                          },
                                        }),
                                      );
                                      setNote("");
                                      await refresh();
                                    })
                                  }
                                >
                                  Solicitar correção
                                </button>
                              </div>
                              {currentReport.decision !== "approved" && (
                                <p className="studio-help">
                                  A aprovação permanece bloqueada enquanto houver uma falha
                                  objetiva.
                                </p>
                              )}
                            </>
                          )}
                      </div>
                    )}
                    <div className="studio-section-card">
                      <h3>Histórico da contratação</h3>
                      <div className="studio-timeline">
                        {order.events.map((event) => (
                          <div key={event.id}>
                            <span />
                            <section>
                              <small>
                                {event.actor_label} ·{" "}
                                {new Date(event.created_at).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </small>
                              <p>{event.result}</p>
                            </section>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                  <aside>
                    <div className="studio-section-card">
                      <span className="studio-eyebrow">CONTRATO</span>
                      <h3>{order.contract.price_units} créditos simulados</h3>
                      <p className="studio-help">
                        {order.contract.requires_human_review
                          ? "O pagamento exige os testes do arquivo e seu aceite nesta versão da entrega."
                          : "O pagamento segue a aprovação objetiva prevista neste contrato."}
                      </p>
                      <dl>
                        <div>
                          <dt>Comissão</dt>
                          <dd>{order.contract.commission_bps / 100}%</dd>
                        </div>
                        <div>
                          <dt>Correções</dt>
                          <dd>{order.contract.revision_limit}</dd>
                        </div>
                        <div>
                          <dt>Prazo</dt>
                          <dd>{new Date(order.contract.deadline_at).toLocaleString("pt-BR")}</dd>
                        </div>
                      </dl>
                      <p className="studio-help">{order.order.selected_reason}</p>
                      {buyerOwned && (
                        <div className="studio-order-actions">
                          {!["cancelled", "expired"].includes(order.order.status) &&
                            !(
                              order.order.status === "accepted" &&
                              order.contract.requires_human_review
                            ) && (
                              <button
                                className="studio-primary wide"
                                disabled={Boolean(busy)}
                                onClick={() => void execute()}
                              >
                                {order.order.status === "revision_requested"
                                  ? "Executar correção"
                                  : order.order.status === "settled"
                                    ? "Conferir pagamento único"
                                    : "Continuar execução"}
                              </button>
                            )}
                          {!["settled", "cancelled", "expired"].includes(order.order.status) && (
                            <button
                              className="studio-secondary wide"
                              disabled={Boolean(busy)}
                              onClick={() => void cancel()}
                            >
                              Cancelar e devolver reserva
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {currentReport && (
                      <>
                        <ReviewAssistant key={currentReport.id} orderId={order.order.id} />
                        {buyerOwned &&
                          !["settled", "cancelled", "expired", "accepted"].includes(
                            order.order.status,
                          ) && (
                            <div className="studio-section-card">
                              <h3>Orientação para a correção</h3>
                              <p className="studio-help">
                                A observação fica ligada a esta entrega. Os critérios do contrato
                                permanecem os mesmos.
                              </p>
                              <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                maxLength={1500}
                                placeholder="O que precisa ser esclarecido?"
                              />
                              <button
                                className="studio-secondary wide"
                                disabled={Boolean(busy) || note.trim().length < 3}
                                onClick={() =>
                                  void action("note", async () => {
                                    await addReviewClarification({
                                      data: {
                                        orderId: order.order.id,
                                        deliveryVersion: order.order.current_delivery_version,
                                        note,
                                      },
                                    });
                                    setNote("");
                                    setOrder(
                                      await getStudioOrder({ data: { orderId: order.order.id } }),
                                    );
                                  })
                                }
                              >
                                Registrar observação
                              </button>
                            </div>
                          )}
                      </>
                    )}
                  </aside>
                </div>
              </>
            ) : workspace.orders.length === 0 ? (
              <Empty
                title="Seu primeiro pedido aparece aqui"
                text="Escolha uma empresa compradora e delegue um serviço ao seu agente."
                action="Contratar serviço"
                onClick={() => navigate("market")}
              />
            ) : (
              <div className="studio-order-list">
                {workspace.orders.map((item) => (
                  <button key={item.id} onClick={() => void loadOrder(item.id)}>
                    <span className="studio-list-icon">
                      <FileCheck2 size={21} />
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <small>
                        {new Date(item.created_at).toLocaleString("pt-BR")} · versão{" "}
                        {item.current_delivery_version}
                      </small>
                    </div>
                    <span className={`studio-status ${item.status}`}>
                      {STATUS[item.status] ?? item.status}
                    </span>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {view === "wallet" && (
          <div className="studio-page">
            <PageTitle
              eyebrow="ECONOMIA ENTRE AGENTES"
              title="Sua carteira"
              description="Reservas, pagamentos e recebimentos por empresa. Todos os valores são simulados."
            />
            <div className="studio-cards">
              {workspace.accounts.map((account) => (
                <div className="studio-section-card" key={account.company_id}>
                  <h3>{workspace.companies.find((c) => c.id === account.company_id)?.name}</h3>
                  <strong className="studio-big-number">
                    {account.available_units}
                    <small> disponíveis</small>
                  </strong>
                  <dl>
                    <div>
                      <dt>Reservados</dt>
                      <dd>{account.reserved_units}</dd>
                    </div>
                    <div>
                      <dt>Pagos</dt>
                      <dd>{account.paid_units}</dd>
                    </div>
                    <div>
                      <dt>Recebidos</dt>
                      <dd>{account.received_units}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
            <div className="studio-section-card">
              <h3>Consumo da NeuraLake</h3>
              <p className="studio-help">
                Tokens e duração das execuções e escolhas de fornecedor. Não são descontados da
                carteira de demonstração.
              </p>
              {workspace.inference?.length ? (
                workspace.inference.map((run) => (
                  <div className="studio-ledger-row" key={run.id}>
                    <span>
                      {run.task_type === "private_execution"
                        ? "Execução privada"
                        : run.task_type === "supplier_execution"
                          ? "Trabalho contratado"
                          : "Escolha de fornecedor"}{" "}
                      · {(run.duration_ms / 1000).toFixed(1)} s
                    </span>
                    <strong>{run.usage_data?.total_tokens ?? "Não informado"} tokens</strong>
                  </div>
                ))
              ) : (
                <p className="studio-muted">Nenhuma chamada registrada para suas empresas.</p>
              )}
            </div>
            <div className="studio-section-card">
              <h3>Movimentações</h3>
              {workspace.ledger.length === 0 ? (
                <p className="studio-muted">Nenhuma movimentação registrada.</p>
              ) : (
                workspace.ledger.map((entry) => (
                  <div className="studio-ledger-row" key={entry.id}>
                    <div>
                      <strong>{entry.description}</strong>
                      <small>
                        {workspace.companies.find((c) => c.id === entry.company_id)?.name}
                      </small>
                    </div>
                    <b>{entry.amount_units} cr</b>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {view === "api" && (
          <div className="studio-page">
            <PageTitle
              eyebrow="PRODUTO PARA AGENTES"
              title="Conecte outro agente"
              description="Uma credencial permite que um agente contrate e acompanhe serviços em nome da sua empresa."
            />
            <div className="studio-section-card">
              <label>
                Empresa
                <select
                  value={apiCompany}
                  onChange={(e) => {
                    setApiCompany(e.target.value);
                    setCredential("");
                  }}
                >
                  <option value="">Selecione</option>
                  {workspace.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="studio-primary"
                disabled={!apiCompany || Boolean(busy)}
                onClick={() =>
                  void action("key", async () => {
                    const result = await createAgentKey({ data: { companyId: apiCompany } });
                    setCredential(result.token);
                    await refresh();
                  })
                }
              >
                <KeyRound size={16} />
                Gerar credencial
              </button>
              {credential && (
                <div className="studio-key-result">
                  <p>Copie agora. A credencial completa não será mostrada novamente.</p>
                  <input
                    type="password"
                    readOnly
                    value={credential}
                    aria-label="Credencial do agente"
                  />
                  <button
                    className="studio-secondary"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(credential)
                        .then(() => setNotice("Credencial copiada."))
                    }
                  >
                    <Copy size={14} />
                    Copiar
                  </button>
                </div>
              )}
              {workspace.credentials
                .filter((c) => c.company_id === apiCompany)
                .map((key) => (
                  <div className="studio-ledger-row" key={key.id}>
                    <code>{key.prefix}…</code>
                    <span>
                      {key.revoked_at
                        ? "Revogada"
                        : new Date(key.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    {!key.revoked_at && (
                      <button
                        className="studio-text-button"
                        onClick={() =>
                          void action("revoke", async () => {
                            await revokeAgentKey({ data: { credentialId: key.id } });
                            setCredential("");
                            await refresh();
                          })
                        }
                      >
                        Revogar
                      </button>
                    )}
                  </div>
                ))}
            </div>
            <div className="studio-section-card">
              <h3>Descobrir ofertas</h3>
              <pre>{`GET ${origin}/api/a2a/offers`}</pre>
              <h3>Criar uma contratação</h3>
              <pre>{`POST ${origin}/api/a2a/orders\nAuthorization: Bearer $NM_AGENT_KEY\nContent-Type: application/json\n\n${JSON.stringify({ title: "Proposta comercial", budget: 30, task: "Escreva uma proposta de gestão de redes sociais para uma loja de roupas. Valor mensal de R$ 2.000.", requestId: "UUID único por contratação" }, null, 2)}`}</pre>
              <p className="studio-help">
                A resposta informa a URL de execução. Repita a mesma solicitação com o mesmo
                requestId para recuperar o pedido, sem criar outra contratação.
              </p>
              <a
                className="studio-text-button"
                href="/api/public/openapi"
                target="_blank"
                rel="noreferrer"
              >
                Abrir documentação da API <ArrowRight size={14} />
              </a>
            </div>
          </div>
        )}

        {view === "integrations" && (
          <div className="studio-page">
            <PageTitle
              eyebrow="CAPACIDADES DA PLATAFORMA"
              title="Integrações"
              description="Veja o que já está disponível e o que precisa ser configurado."
            />
            <div className="studio-integration-card">
              <span className="studio-agent-icon">
                <Building2 />
              </span>
              <div>
                <h3>Servidor de publicação</h3>
                <p>Cria a empresa e os agentes, salva a oferta e administra os pedidos.</p>
              </div>
              <span className="studio-tag">
                {bootstrap.backendConfigured
                  ? "Credenciais configuradas"
                  : "Indisponível neste ambiente"}
              </span>
            </div>
            <div className="studio-integration-card">
              <span className="studio-agent-icon">
                <FileCheck2 />
              </span>
              <div>
                <h3>Verificação das entregas</h3>
                <p>
                  Confere o formato e as seções combinadas. O comprador avalia a qualidade antes de
                  pagar.
                </p>
              </div>
              <span className="studio-tag">Disponível</span>
            </div>
            <div className="studio-integration-card">
              <span className="studio-agent-icon">
                <Sparkles />
              </span>
              <div>
                <h3>NeuraLake</h3>
                <p>Criação dos agentes, escolha de especialistas e execução dos trabalhos.</p>
              </div>
              <span className="studio-tag">
                {bootstrap.neuralakeConfigured ? "Chave configurada" : "Configuração pendente"}
              </span>
            </div>
            <div className="studio-integration-card">
              <span className="studio-agent-icon">
                <MessageSquare />
              </span>
              <div>
                <h3>Agora</h3>
                <p>Conversa por voz sobre a entrega e os motivos da verificação.</p>
              </div>
              <span className="studio-tag">
                {bootstrap.agoraConfigured ? "Credenciais configuradas" : "Configuração pendente"}
              </span>
            </div>
            <details className="studio-setup-guide">
              <summary>Configuração para a equipe de desenvolvimento</summary>
              <p>
                Aplicar as migrações até <code>0010_neuralake_specialists.sql</code> pelo Lovable.
                Elas criam os agentes, os contratos e as operações A2A.
              </p>
              <p>
                Configurar os segredos no Lovable: <code>NEURALAKE_API_KEY</code>,{" "}
                <code>AGORA_APP_ID</code>, <code>AGORA_APP_CERTIFICATE</code> e{" "}
                <code>AGORA_REVIEW_SECRET</code>, <code>AGORA_TTS_VOICE_ID</code> e{" "}
                <code>PUBLIC_APP_URL</code>. A chave administrativa do banco permanece no servidor.
              </p>
              <p>
                As credenciais configuradas ainda precisam ser testadas com os provedores. Nunca
                envie chaves pela conversa do aplicativo.
              </p>
            </details>
          </div>
        )}
      </section>
      {login && (
        <div className="studio-modal-backdrop" role="presentation">
          <section
            className="studio-login"
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-login-title"
          >
            <button className="studio-close" onClick={() => setLogin(false)} aria-label="Fechar">
              <X size={20} />
            </button>
            <span className="studio-brand-icon">n</span>
            <h2 id="studio-login-title">Entre para continuar</h2>
            <p>Entre para publicar, contratar e guardar seu histórico. Seu rascunho está salvo.</p>
            {origin && isLocalPreview(origin) && (
              <p role="status">
                O login desta prévia local ainda não está autorizado.{" "}
                <a href={PUBLISHED_STUDIO} target="_blank" rel="noopener noreferrer">
                  Abrir a versão online
                </a>
                . Seu rascunho fica salvo neste endereço e não é transferido para a versão online.
              </p>
            )}
            <button
              className="studio-secondary wide"
              disabled={Boolean(busy)}
              onClick={() =>
                void action("login", async () => {
                  const result = await lovable.auth.signInWithOAuth("google");
                  if (result.error) throw result.error;
                })
              }
            >
              {busy === "login" ? "Aguardando o login…" : "Continuar com Google"}
            </button>
            <div className="studio-login-divider">ou entre com seu e-mail</div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void action("login", async () => {
                  const redirectTo = loginReturnUrl(window.location.href);
                  const result = await supabase.auth.signInWithOtp({
                    email: email.trim(),
                    options: { emailRedirectTo: redirectTo },
                  });
                  if (result.error) throw result.error;
                  setLoginMessage(
                    "Solicitamos seu link de acesso. Confira a caixa de entrada e o spam e abra o link neste navegador.",
                  );
                });
              }}
            >
              <label>
                E-mail
                <input
                  type="email"
                  required
                  placeholder="voce@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button className="studio-primary wide" disabled={Boolean(busy)}>
                {busy === "login" ? "Aguarde…" : "Receber link de acesso"}
              </button>
            </form>
            {loginMessage && <p role="status">{loginMessage}</p>}
            {error && <p role="alert">{error}</p>}
          </section>
        </div>
      )}
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="studio-page-title">
      <span className="studio-eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
function Empty({
  title,
  text,
  action,
  onClick,
}: {
  title: string;
  text: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="studio-empty">
      <Building2 size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="studio-secondary" onClick={onClick}>
        {action}
        <ArrowRight size={15} />
      </button>
    </div>
  );
}
