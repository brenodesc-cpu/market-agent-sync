import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUp,
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
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { isLocalPreview, loginCallbackError, loginReturnUrl, PUBLISHED_STUDIO } from "@/lib/auth-flow";
import {
  CAPABILITY,
  STARTER_DRAFT,
  SAMPLE_ROWS,
  companyDraftSchema,
  createCatalogueCsv,
  parseCatalogueCsv,
} from "@/lib/a2a-contract";
import type { CompanyDraft, AgentOffer } from "@/lib/a2a-contract";
import type { StudioWorkspace, StudioDetails } from "@/lib/studio.types";
import {
  getStudioBootstrap,
  getStudioWorkspace,
  generateCompanyDraft,
  publishCompany,
  previewCatalogue,
  placeStudioOrder,
  executeStudioOrder,
  getStudioOrder,
  cancelStudioOrder,
  createAgentKey,
  revokeAgentKey,
  addReviewClarification,
} from "@/lib/studio.functions";
import { withStudioAccess, StudioAccessError, confirmThenRefresh } from "@/lib/studio-access";
import { ReviewAssistant } from "./review-assistant";
import "@/studio.css";

type View = "builder" | "companies" | "market" | "orders" | "wallet" | "api" | "integrations";
type Bootstrap = Awaited<ReturnType<typeof getStudioBootstrap>>;
type Preview = Awaited<ReturnType<typeof previewCatalogue>>;
const navigation = [
  { id: "builder", label: "Criar empresa", icon: Plus },
  { id: "companies", label: "Minhas empresas", icon: Building2 },
  { id: "market", label: "Marketplace", icon: Store },
  { id: "orders", label: "Pedidos", icon: FileCheck2 },
  { id: "wallet", label: "Carteira", icon: Wallet },
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
  accepted: "Verificado",
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
function download(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CompanyStudio({ initialView = "builder" }: { initialView?: View }) {
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
  const [draft, setDraft] = useState<CompanyDraft>(STARTER_DRAFT);
  const [started, setStarted] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [previewTab, setPreviewTab] = useState<"company" | "service" | "test">("company");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [csv, setCsv] = useState(createCatalogueCsv(SAMPLE_ROWS));
  const [buyer, setBuyer] = useState("");
  const [budget, setBudget] = useState(30);
  const [selectedOffer, setSelectedOffer] = useState("");
  const [testFailure, setTestFailure] = useState(true);
  const [autoCorrect, setAutoCorrect] = useState(false);
  const [order, setOrder] = useState<StudioDetails | null>(null);
  const [note, setNote] = useState("");
  const [credential, setCredential] = useState("");
  const [apiCompany, setApiCompany] = useState("");
  const [origin, setOrigin] = useState("");
  const publishId = useRef("");
  const orderRequestId = useRef("");
  const alive = useRef(true);
  const activeUser = useRef(user);
  activeUser.current = user;

  async function refresh() {
    const requestedBy = activeUser.current;
    const data = await getStudioWorkspace();
    if (!alive.current || requestedBy !== activeUser.current) return;
    setWorkspace(data);
    setBuyer((current) =>
      data.companies.some((c) => c.id === current) ? current : (data.companies[0]?.id ?? ""),
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
      for (const key of ["error", "error_code", "error_description", "state"]) clean.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", clean.pathname + clean.search);
    }
    try {
      const saved = localStorage.getItem("neuramarket:company-draft");
      if (saved) {
        setDraft(companyDraftSchema.parse(JSON.parse(saved)));
        setStarted(true);
      }
      const pending = localStorage.getItem("neuramarket:pending-prompt");
      if (pending) setPrompt(pending);
      const initial = sessionStorage.getItem("neuramarket:initial-prompt");
      if (initial) {
        setPrompt(initial);
        sessionStorage.removeItem("neuramarket:initial-prompt");
      }
    } catch {
      /* An invalid local draft never blocks the editor. */
    }
    void getStudioBootstrap()
      .then((data) => {
        if (alive.current) setBootstrap(data);
      })
      .catch(() => {
        if (alive.current) setError("Não conseguimos verificar a conexão do estúdio. Recarregue a página antes de continuar.");
      })
      .finally(() => { if (alive.current) setConnectionReady(true); });
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) throw sessionError;
      if (alive.current) {
        setUser(data.session?.user.id ?? null);
        setAuthReady(true);
      }
    }).catch(() => {
      if (alive.current) { setAuthReady(true); setError("Não foi possível verificar sua sessão. Entre novamente."); }
    });
    const listener = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user.id ?? null);
      setAuthReady(true);
      if (session) {
        setLogin(false);
        setLoginMessage("");
        setNotice("Você entrou. Envie sua descrição ou publique o rascunho para continuar.");
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
  useEffect(() => {
    if (started) localStorage.setItem("neuramarket:company-draft", JSON.stringify(draft));
  }, [draft, started]);
  useEffect(() => {
    if (authReady) localStorage.setItem("neuramarket:pending-prompt", prompt);
  }, [prompt, authReady]);
  const readiness = { checked: connectionReady && authReady, backendConfigured: bootstrap.backendConfigured, neuralakeConfigured: bootstrap.neuralakeConfigured };
  function navigate(next: View) {
    setView(next);
    setSidebar(false);
    setError("");
    setNotice("");
  }
  function updateDraft(update: Partial<CompanyDraft>) {
    setDraft((current) => ({ ...current, ...update }));
    publishId.current = "";
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
  async function buildCompany() {
    if (!prompt.trim() || busy) return;
    const request = prompt.trim();
    await action("draft", async () => {
      const proposal = await withStudioAccess("draft", readiness, user, () =>
        generateCompanyDraft({ data: { prompt: request, current: draft } }),
      );
      setDraft(proposal);
      setStarted(true);
      setPrompt("");
      publishId.current = "";
      setMessages((current) => [
        ...current,
        { role: "user", text: request },
        { role: "assistant", text: "A NeuraLake preparou este rascunho. Revise o nome, o serviço e o preço. Ao publicar, criaremos no banco o gerente e o especialista em catálogo da empresa." },
      ]);
    });
  }
  async function publish() {
    if (busy) return;
    await action("publish", async () => {
      await withStudioAccess("publish", readiness, user, async () => {
        const checked = companyDraftSchema.parse(draft);
        if (!publishId.current) publishId.current = crypto.randomUUID();
        const { result, refreshFailed } = await confirmThenRefresh(
          () => publishCompany({ data: { requestId: publishId.current, draft: checked } }),
          refresh,
        );
        setBuyer(result.companyId);
        setApiCompany(result.companyId);
        setView("companies");
        setNotice(refreshFailed
          ? "Empresa e agentes publicados. A lista não carregou; use Atualizar empresas. A publicação já foi concluída."
          : "Empresa publicada com seu gerente e seu especialista em catálogo. A oferta já pode receber pedidos e você tem 100 créditos simulados.");
        localStorage.removeItem("neuramarket:company-draft");
      });
    });
  }
  async function testService(fail: boolean) {
    await action("preview", async () => {
      setPreview(
        await previewCatalogue({ data: { rows: parseCatalogueCsv(csv), testFailure: fail } }),
      );
    });
  }
  async function loadOrder(id: string) {
    await action("load-order", async () => {
      setOrder(await getStudioOrder({ data: { orderId: id } }));
      setView("orders");
    });
  }
  async function hire() {
    if (!user) {
      setLogin(true);
      return;
    }
    await action("hire", async () => {
      const rows = parseCatalogueCsv(csv);
      if (!buyer) throw new Error("Publique sua empresa antes de contratar.");
      if (!orderRequestId.current) orderRequestId.current = crypto.randomUUID();
      const created = await placeStudioOrder({
        data: {
          buyerCompanyId: buyer,
          title: "Preparar catálogo para importação",
          budget,
          rows,
          ...(selectedOffer ? { offerVersionId: selectedOffer } : {}),
          testFailure,
          autoCorrect,
          requestId: orderRequestId.current,
        },
      });
      setOrder(await getStudioOrder({ data: { orderId: created.orderId } }));
      setView("orders");
      await refresh();
      setBusy("execute");
      setOrder(await executeStudioOrder({ data: { orderId: created.orderId } }));
      orderRequestId.current = "";
      await refresh();
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
  const buyerAccount = workspace.accounts.find((account) => account.company_id === buyer);
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
            <strong>Meu espaço</strong>
            <small>
              {user ? `${workspace.companies.length} empresas` : "Crie sua primeira empresa"}
            </small>
          </div>
        </div>
        <nav>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
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
        <div className="studio-sidebar-bottom">
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
            <span>Meu espaço</span>
            <ChevronRight size={14} />
            <strong>{navigation.find((item) => item.id === view)?.label}</strong>
          </div>
          <div className="studio-header-actions">
            {view === "builder" && started && (
              <span className="studio-draft-label">Rascunho salvo neste navegador</span>
            )}
            {view === "builder" ? (
              <button
                className="studio-primary"
                disabled={!started || Boolean(busy) || !readiness.checked}
                onClick={() => void publish()}
              >
                {busy === "publish" ? (
                  <LoaderCircle className="animate-spin" size={16} />
                ) : (
                  <Globe size={16} />
                )}
                {user ? "Publicar empresa" : "Entrar para publicar"}
              </button>
            ) : (
              <button
                className="studio-secondary"
                onClick={() => {
                  localStorage.removeItem("neuramarket:company-draft");
                  setStarted(false);
                  setDraft(STARTER_DRAFT);
                  setMessages([]);
                  setPreview(null);
                  publishId.current = "";
                  navigate("builder");
                }}
              >
                {" "}
                <Plus size={16} />
                Nova empresa
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
            <strong>{!bootstrap.backendConfigured ? "Este endereço permite apenas editar e testar rascunhos" : "A criação com IA está indisponível neste ambiente"}</strong>
            <p>{!bootstrap.backendConfigured
              ? "A criação dos agentes e a publicação precisam do servidor conectado. Seu rascunho permanece neste navegador."
              : "Você pode editar e publicar manualmente. Sua descrição será preservada até a conexão com a NeuraLake estar disponível."}</p>
            {origin && new URL(origin).hostname !== "market-agent-sync.lovable.app" && (
              <a className="studio-secondary" href="https://market-agent-sync.lovable.app/studio">Abrir versão online <ArrowRight size={15} /></a>
            )}
          </div>
        )}

        {view === "builder" && !started && (
          <div className="studio-welcome">
            <div className="studio-orbit">
              <Bot size={26} />
            </div>
            <span className="studio-eyebrow">DA IDEIA À PRIMEIRA CONTRATAÇÃO</span>
            <h1>Qual empresa vamos criar?</h1>
            <p>
              Descreva o que você quer oferecer.
              <br />
              Revise a configuração e publique para criar seus agentes.
              O serviço disponível nesta versão é a organização de catálogos em CSV.
            </p>
            <form
              className="studio-composer welcome-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void buildCompany();
              }}
            >
              <textarea
                aria-label="Descreva sua empresa"
                placeholder="Uma empresa que prepara catálogos para lojas online..."
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                maxLength={3000}
              />
              <div>
                <span>
                  <Sparkles size={14} />{" "}
                  {user && bootstrap.neuralakeConfigured
                    ? "NeuraLake"
                    : !bootstrap.neuralakeConfigured ? "IA indisponível neste ambiente" : "Entre para criar com IA"}
                </span>
                <button aria-label="Criar configuração da empresa" disabled={!prompt.trim() || Boolean(busy) || !readiness.checked}>
                  <ArrowUp size={20} />
                </button>
              </div>
            </form>
            <div className="studio-suggestions">
              {[
                "Uma operação de e-commerce",
                "Um estúdio de dados",
                "Minha primeira empresa de agentes",
              ].map((text) => (
                <button key={text} onClick={() => setPrompt(text)}>
                  <Plus size={14} />
                  {text}
                </button>
              ))}
            </div>
            <button
              className="studio-text-button"
              onClick={() => {
                setStarted(true);
                setMessages([
                  {
                    role: "assistant",
                    text: "Configure o nome, a oferta e o preço ao lado. Você pode testar o catálogo antes de publicar.",
                  },
                ]);
              }}
            >
              Prefiro configurar manualmente <ArrowRight size={15} />
            </button>
            <div className="studio-welcome-foot">
              <ShieldCheck size={15} /> Seu primeiro serviço já vem com uma verificação de entrega.
            </div>
          </div>
        )}

        {view === "builder" && started && (
          <div className="studio-builder">
            <section className="studio-chat">
              <div className="studio-chat-heading">
                <span className="studio-agent-icon">
                  <Sparkles size={17} />
                </span>
                <div>
                  <strong>Vamos montar sua empresa</strong>
                  <small>
                    {user && bootstrap.neuralakeConfigured
                      ? "Assistente NeuraLake"
                      : "Editor da empresa"}
                  </small>
                </div>
              </div>
              <div className="studio-chat-messages">
                {messages.length === 0 && (
                  <div className="studio-chat-message assistant">
                    Seu rascunho foi restaurado. Os agentes serão criados quando você publicar a empresa.
                  </div>
                )}
                {messages.map((message, i) => (
                  <div key={i} className={`studio-chat-message ${message.role}`}>
                    {message.role === "assistant" && <Sparkles size={14} />}
                    <p>{message.text}</p>
                  </div>
                ))}
                {busy === "draft" && (
                  <div className="studio-chat-message assistant">
                    <LoaderCircle className="animate-spin" size={16} />
                    Preparando sua configuração...
                  </div>
                )}
                <div className="studio-chat-plan">
                  <span>Depois da publicação</span>
                  <p>
                    <Check size={15} /> Receber pedidos de outros agentes
                  </p>
                  <p>
                    <Check size={15} /> Entregar catálogos em CSV
                  </p>
                  <p>
                    <Check size={15} /> Contratar especialistas da rede
                  </p>
                  <p>
                    <ShieldCheck size={15} /> Receber após a verificação
                  </p>
                </div>
              </div>
              <form
                className="studio-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void buildCompany();
                }}
              >
                <textarea
                  aria-label="Ajustar a configuração"
                  placeholder={
                    user ? "Peça um ajuste na empresa..." : "Descreva melhor sua ideia..."
                  }
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  maxLength={3000}
                />
                <div>
                  <span>
                    <MessageSquare size={14} />A configuração fica ao lado
                  </span>
                  <button disabled={Boolean(busy) || !prompt.trim()} aria-label="Enviar ajuste">
                    <ArrowUp size={18} />
                  </button>
                </div>
              </form>
            </section>
            <section className="studio-preview">
              <div className="studio-preview-toolbar">
                <div>
                  {(["company", "service", "test"] as const).map((tab) => (
                    <button
                      key={tab}
                      className={previewTab === tab ? "active" : ""}
                      onClick={() => setPreviewTab(tab)}
                    >
                      {tab === "company" ? "Empresa" : tab === "service" ? "Serviço" : "Testar"}
                    </button>
                  ))}
                </div>
                <span>
                  <Globe size={13} />
                  Prévia
                </span>
              </div>
              <div className="studio-preview-canvas">
                {previewTab === "company" && (
                  <>
                    <div className="studio-company-banner">
                      <span className="studio-company-mark">
                        {draft.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="studio-tag light">Empresa de agentes</span>
                      <h2>{draft.name}</h2>
                      <p>{draft.description}</p>
                    </div>
                    <div className="studio-config-card">
                      <h3>Sua empresa</h3>
                      <label>
                        Nome
                        <input
                          value={draft.name}
                          onChange={(e) => updateDraft({ name: e.target.value })}
                          maxLength={70}
                        />
                      </label>
                      <label>
                        O que ela faz
                        <textarea
                          value={draft.description}
                          onChange={(e) => updateDraft({ description: e.target.value })}
                          maxLength={1000}
                        />
                      </label>
                      <p className="studio-help">
                        A empresa pode contratar serviços e oferecer a capacidade executável abaixo.
                      </p>
                    </div>
                    <div className="studio-agent-grid">
                      <div>
                        <Bot />
                        <strong>Gerente (ao publicar)</strong>
                        <p>Escolhe fornecedores dentro do orçamento.</p>
                      </div>
                      <div>
                        <FileCheck2 />
                        <strong>Especialista (ao publicar)</strong>
                        <p>Prepara o catálogo contratado.</p>
                      </div>
                      <div>
                        <ShieldCheck />
                        <strong>Verificação da plataforma</strong>
                        <p>Confere a entrega antes do pagamento.</p>
                      </div>
                    </div>
                  </>
                )}
                {previewTab === "service" && (
                  <div className="studio-config-card">
                    <span className="studio-tag">Executor disponível</span>
                    <h2>Uma oferta que pode ser executada</h2>
                    <label>
                      Nome do serviço
                      <input
                        value={draft.serviceTitle}
                        onChange={(e) => updateDraft({ serviceTitle: e.target.value })}
                        maxLength={100}
                      />
                    </label>
                    <label>
                      Preço em créditos simulados
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={draft.price}
                        onChange={(e) => updateDraft({ price: Number(e.target.value) })}
                      />
                    </label>
                    <div className="studio-service-explainer">
                      <strong>Catálogo pronto para importar</strong>
                      <p>
                        Recebe SKU, tamanho e preço. Entrega um CSV com as colunas padronizadas e os
                        produtos organizados.
                      </p>
                    </div>
                    <h3>Critérios do contrato</h3>
                    {[
                      "Arquivo CSV legível",
                      "Todos os produtos preservados",
                      "Preços iguais aos dados originais",
                      "SKU e tamanho sem duplicatas",
                    ].map((text) => (
                      <p className="studio-check-line" key={text}>
                        <ShieldCheck size={16} />
                        {text}
                      </p>
                    ))}
                    <p className="studio-help">
                      Inclui uma correção. Comissão da plataforma: 10% sobre a contratação
                      concluída, arredondada em créditos inteiros.
                    </p>
                    <button className="studio-secondary" onClick={() => setPreviewTab("test")}>
                      Testar o serviço <ArrowRight size={16} />
                    </button>
                  </div>
                )}
                {previewTab === "test" && (
                  <div className="studio-config-card">
                    <span className="studio-tag">Prévia sem contratação</span>
                    <h2>Veja a verificação funcionando</h2>
                    <p>Edite os produtos e gere uma entrega. Esse teste não movimenta créditos.</p>
                    <label>
                      Dados de origem
                      <textarea
                        className="studio-code-input"
                        aria-label="CSV para testar"
                        value={csv}
                        onChange={(e) => {
                          setCsv(e.target.value);
                          setPreview(null);
                        }}
                      />
                    </label>
                    <div className="studio-button-row">
                      <button
                        className="studio-primary"
                        disabled={Boolean(busy)}
                        onClick={() => void testService(false)}
                      >
                        Gerar e verificar
                      </button>
                      <button
                        className="studio-secondary"
                        disabled={Boolean(busy)}
                        onClick={() => void testService(true)}
                      >
                        Testar preço incorreto
                      </button>
                    </div>
                    {preview && (
                      <div className="studio-preview-result">
                        <span className={`studio-status ${preview.decision}`}>
                          {preview.decision === "approved"
                            ? "Entrega aprovada"
                            : "Entrega reprovada"}
                        </span>
                        <p>
                          {preview.decision === "rejected"
                            ? "A entrega falhou neste teste. Em uma contratação, o pagamento ficaria bloqueado."
                            : preview.summary}
                        </p>
                        {preview.checks.map((check) => (
                          <div className="studio-evidence" key={check.criterion}>
                            <span>
                              {check.status === "passed" ? <Check size={16} /> : <X size={16} />}
                            </span>
                            <div>
                              <strong>{check.criterion}</strong>
                              <small>{check.evidence}</small>
                            </div>
                          </div>
                        ))}
                        <button
                          className="studio-text-button"
                          onClick={() => download(preview.content, "catalogo-preview.csv")}
                        >
                          <Download size={15} />
                          Baixar o arquivo gerado
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {view === "companies" && (
          <div className="studio-page">
            <PageTitle
              eyebrow="SEU ESPAÇO"
              title="Suas empresas"
              description="Veja as empresas publicadas e os agentes registrados no banco."
            />
            {user && <button className="studio-secondary" disabled={Boolean(busy)} onClick={() => void action("refresh", refresh)}>Atualizar empresas</button>}
            {!user ? (
              <Empty
                title="Entre para publicar sua primeira empresa"
                text="Seu rascunho continua salvo neste navegador."
                action="Entrar"
                onClick={() => setLogin(true)}
              />
            ) : workspace.companies.length === 0 ? (
              <Empty
                title="Sua primeira empresa começa com uma ideia"
                text="Descreva o serviço, revise a oferta e publique no marketplace."
                action="Criar empresa"
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
                        <span className="studio-tag">Publicada</span>
                      </div>
                      <h2>{company.name}</h2>
                      <p>{company.description}</p>
                      <div className="studio-registered-agents">
                        <strong>Agentes criados</strong>
                        {workspace.agents.filter((agent) => agent.company_id === company.id).map((agent) => (
                          <details key={agent.id}>
                            <summary>{agent.name} · {agent.active ? "Ativo" : "Inativo"}</summary>
                            <p>{agent.instructions}</p>
                            <small>{agent.model === "deterministic" ? "Executor de catálogo" : "NeuraLake · " + agent.model}</small>
                          </details>
                        ))}
                        {!workspace.agents.some((agent) => agent.company_id === company.id) && <p>Nenhum agente registrado para esta empresa.</p>}
                      </div>
                      <div className="studio-card-balance">
                        <strong>
                          {balance?.available_units ?? 0} <small>créditos</small>
                        </strong>
                        <span>{balance?.reserved_units ?? 0} reservados</span>
                      </div>
                      <button
                        className="studio-primary"
                        onClick={() => {
                          setBuyer(company.id);
                          navigate("market");
                        }}
                      >
                        Contratar um serviço <ArrowRight size={16} />
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {view === "market" && (
          <div className="studio-page">
            <PageTitle
              eyebrow="EMPRESAS QUE TRABALHAM JUNTAS"
              title="Contrate um especialista"
              description="Seu gerente encontra uma oferta, reserva o valor e acompanha a entrega."
            />
            <div className="studio-market-layout">
              <section className="studio-order-form">
                <h3>O que sua empresa precisa?</h3>
                <p>Preparar um catálogo de produtos para importação.</p>
                <label>
                  Empresa compradora
                  <select
                    value={buyer}
                    onChange={(e) => {
                      setBuyer(e.target.value);
                      orderRequestId.current = "";
                    }}
                  >
                    <option value="">Selecione sua empresa</option>
                    {workspace.companies.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Fornecedor
                  <select
                    value={selectedOffer}
                    onChange={(e) => {
                      setSelectedOffer(e.target.value);
                      orderRequestId.current = "";
                    }}
                  >
                    <option value="">Meu agente escolhe</option>
                    {offers
                      .filter((o) => o.companyId !== buyer)
                      .map((o) => (
                        <option value={o.id} key={o.id}>
                          {o.companyName} · {o.price} créditos
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Catálogo de origem
                  <textarea
                    className="studio-code-input"
                    value={csv}
                    onChange={(e) => {
                      setCsv(e.target.value);
                      orderRequestId.current = "";
                    }}
                  />
                </label>
                <div className="studio-file-row">
                  <label className="studio-text-button">
                    Carregar CSV
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && file.size > 128000) {
                          setError("Use um CSV de até 128 KB.");
                          return;
                        }
                        if (file)
                          void file.text().then((text) => {
                            setCsv(text);
                            orderRequestId.current = "";
                          });
                      }}
                    />
                  </label>
                  <span>Preço em centavos · até 500 produtos</span>
                </div>
                <label>
                  Orçamento máximo
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={budget}
                    onChange={(e) => {
                      setBudget(Number(e.target.value));
                      orderRequestId.current = "";
                    }}
                  />
                </label>
                <p className="studio-help">
                  Saldo disponível: {buyerAccount?.available_units ?? 0} créditos simulados. O valor
                  é reservado antes da execução.
                </p>
                <details className="studio-demo-options">
                  <summary>Opções da demonstração</summary>
                  <label>
                    <input
                      type="checkbox"
                      checked={testFailure}
                      onChange={(e) => {
                        setTestFailure(e.target.checked);
                        orderRequestId.current = "";
                      }}
                    />
                    Introduzir um erro de preço na primeira entrega
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={autoCorrect}
                      onChange={(e) => {
                        setAutoCorrect(e.target.checked);
                        orderRequestId.current = "";
                      }}
                    />
                    Pedir a correção automaticamente
                  </label>
                </details>
                <button
                  className="studio-primary wide"
                  disabled={Boolean(busy) || (Boolean(user) && !buyer) || offers.length === 0}
                  onClick={() => void hire()}
                >
                  {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
                  Delegar ao meu agente
                </button>
                {user && !buyer && (
                  <button className="studio-text-button" onClick={() => navigate("builder")}>
                    Publique uma empresa para contratar <ArrowRight size={14} />
                  </button>
                )}
              </section>
              <section className="studio-provider-list">
                <h3>
                  Ofertas da rede <span>{offers.length}</span>
                </h3>
                {offers.length === 0 && (
                  <Empty
                    title="O catálogo está sendo preparado"
                    text={
                      bootstrap.setupMessage ??
                      "Ative a migração do estúdio no Lovable para disponibilizar os fornecedores."
                    }
                    action="Ver integrações"
                    onClick={() => navigate("integrations")}
                  />
                )}
                {offers.map((offer) => (
                  <article
                    key={offer.id}
                    className={`studio-provider-card ${selectedOffer === offer.id ? "selected" : ""}`}
                  >
                    <div>
                      <span className="studio-provider-avatar">
                        {offer.companyName.slice(0, 1)}
                      </span>
                      <span className="studio-tag">Verificação incluída</span>
                    </div>
                    <h3>{offer.companyName}</h3>
                    <strong>{offer.title}</strong>
                    <p>{offer.description}</p>
                    <footer>
                      <b>
                        {offer.price}
                        <small> créditos</small>
                      </b>
                      <button
                        className="studio-secondary"
                        disabled={offer.companyId === buyer}
                        onClick={() => {
                          setSelectedOffer(offer.id);
                          orderRequestId.current = "";
                        }}
                      >
                        {offer.companyId === buyer ? "Sua empresa" : "Selecionar"}
                      </button>
                    </footer>
                  </article>
                ))}
              </section>
            </div>
          </div>
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
                              <p>CSV gerado pela empresa fornecedora</p>
                            </div>
                            <button
                              className="studio-secondary"
                              onClick={() =>
                                download(
                                  currentDelivery.artifact_content ?? "",
                                  currentDelivery.file_name,
                                )
                              }
                              disabled={!currentDelivery.artifact_content}
                            >
                              <Download size={16} />
                              Baixar
                            </button>
                          </div>
                          <code className="studio-file-hash">SHA-256 {currentDelivery.sha256}</code>
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
                          {!["cancelled", "expired"].includes(order.order.status) && (
                            <button
                              className="studio-primary wide"
                              disabled={Boolean(busy)}
                              onClick={() => void execute()}
                            >
                              {order.order.status === "revision_requested"
                                ? "Solicitar correção"
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
                          !["settled", "cancelled", "expired"].includes(order.order.status) && (
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
              <pre>{`POST ${origin}/api/a2a/orders\nAuthorization: Bearer $NM_AGENT_KEY\nContent-Type: application/json\n\n${JSON.stringify({ title: "Preparar catálogo", budget: 30, rows: SAMPLE_ROWS, testFailure: false, autoCorrect: true, requestId: "UUID único por contratação" }, null, 2)}`}</pre>
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
              <span className="studio-agent-icon"><Building2 /></span>
              <div><h3>Servidor de publicação</h3><p>Cria a empresa e os agentes, salva a oferta e administra os pedidos.</p></div>
              <span className="studio-tag">{bootstrap.backendConfigured ? "Credenciais configuradas" : "Indisponível neste ambiente"}</span>
            </div>
            <div className="studio-integration-card">
              <span className="studio-agent-icon">
                <FileCheck2 />
              </span>
              <div>
                <h3>Executor de catálogo</h3>
                <p>Gera arquivos CSV e verifica produtos, preços e identificadores.</p>
              </div>
              <span className="studio-tag">Disponível</span>
            </div>
            <div className="studio-integration-card">
              <span className="studio-agent-icon">
                <Sparkles />
              </span>
              <div>
                <h3>NeuraLake</h3>
                <p>Configuração da empresa, escolha de fornecedores e explicação das evidências.</p>
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
                Aplicar a migração <code>0004_company_studio_and_a2a.sql</code> pelo Lovable. Ela
                cria o cadastro transacional, os fornecedores de catálogo e as operações A2A.
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
            <h2 id="studio-login-title">Sua empresa começa aqui</h2>
            <p>Entre para publicar, contratar e guardar seu histórico. Seu rascunho está salvo.</p>
            {origin && isLocalPreview(origin) && (
              <p role="status">
                O login desta prévia local ainda não está autorizado. {" "}
                <a href={PUBLISHED_STUDIO} target="_blank" rel="noopener noreferrer">Abrir a versão online</a>.
                {" "}Seu rascunho fica salvo neste endereço e não é transferido para a versão online.
              </p>
            )}
            <button
              className="studio-secondary wide"
              disabled={Boolean(busy)}
              onClick={() =>
                void action("login", async () => {
                  localStorage.setItem("neuramarket:company-draft", JSON.stringify(draft));
                  const result = await lovable.auth.signInWithOAuth("google");
                  if (result.error) throw result.error;
                })
              }
            >
              {busy === "login" ? "Aguardando o login…" : "Continuar com Google"}
            </button>
            <div className="studio-login-divider">ou use seu e-mail</div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void action("login", async () => {
                  const redirectTo = loginReturnUrl(window.location.href);
                  localStorage.setItem("neuramarket:company-draft", JSON.stringify(draft));
                  const result = await supabase.auth.signInWithOtp({
                    email: email.trim(),
                    options: { emailRedirectTo: redirectTo },
                  });
                  if (result.error) throw result.error;
                  setLoginMessage("Solicitamos seu link de acesso. Confira a caixa de entrada e o spam e abra o link neste navegador.");
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
