import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, Sparkles, Play, Globe, Lock, LoaderCircle, Settings2 } from "lucide-react";
import {
  AGENT_EXAMPLES,
  agentDefinitionSchema,
  executionIdentity,
  type AgentDefinition,
  type AgentResult,
} from "@/lib/agent-definition";
import { buildStudioAgent, trialStudioAgent, saveStudioAgent } from "@/lib/agent-studio.functions";
import { AgentOutput } from "./agent-output";

type Trial = {
  trialId: string;
  identity: string;
  result: AgentResult;
  report: { decision: string; summary: string };
  durationMs: number;
  usage: { total_tokens?: number | undefined } | null;
};
export function AgentBuilder({
  userId,
  ready,
  onLogin,
  onSaved,
}: {
  userId: string | null;
  ready: boolean;
  onLogin: () => void;
  onSaved: (id: string, published: boolean) => Promise<void>;
}) {
  const [spec, setSpec] = useState<AgentDefinition | null>(null),
    [prompt, setPrompt] = useState("");
  const [task, setTask] = useState(""),
    [trial, setTrial] = useState<Trial | null>(null);
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [tab, setTab] = useState("preview");
  const request = useRef(""),
    hydrated = useRef(false);
  const storageKey = `neuramarket:agent-draft:${userId ?? "visitor"}`;
  useEffect(() => {
    hydrated.current = false;
    setTrial(null);
    setSpec(null);
    setMessages([]);
    setTask("");
    request.current = "";
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (saved) {
        setSpec(agentDefinitionSchema.parse(saved.spec));
        setTask(saved.task ?? "");
        setMessages(saved.messages ?? []);
      }
    } catch {
      /* A stale draft must not block the studio. */
    }
    setPrompt(sessionStorage.getItem("neuramarket:agent-prompt") ?? "");
    hydrated.current = true;
  }, [storageKey]);
  useEffect(() => {
    if (hydrated.current && spec)
      sessionStorage.setItem(storageKey, JSON.stringify({ spec, task, messages }));
  }, [spec, task, messages, storageKey]);
  const tested =
    !!spec && trial?.identity === executionIdentity(spec) && trial.report.decision === "approved";
  function update(value: Partial<AgentDefinition>) {
    setSpec((s) => (s ? { ...s, ...value } : s));
    request.current = "";
  }
  async function perform(kind: string, job: () => Promise<void>) {
    if (busy) return;
    if (!userId) {
      onLogin();
      return;
    }
    if (!ready) {
      setError("A conexão com a NeuraLake precisa estar ativa para criar e testar seu agente.");
      return;
    }
    setBusy(kind);
    setError("");
    try {
      await job();
    } catch (e) {
      setError(
        e instanceof Error && e.message.length < 300
          ? e.message
          : "Não foi possível concluir. Tente novamente.",
      );
    } finally {
      setBusy("");
    }
  }
  async function build() {
    sessionStorage.setItem("neuramarket:agent-prompt", prompt);
    await perform("build", async () => {
      const next = await buildStudioAgent({ data: { prompt, current: spec ?? undefined } });
      setSpec(next);
      setTask((t) => t || next.exampleTask);
      request.current = "";
      setMessages((m) => [
        ...m,
        { role: "user", text: prompt },
        {
          role: "assistant",
          text: `${next.name} está configurado. ${next.description} Teste uma tarefa na prévia para conferir o trabalho.`,
        },
      ]);
      setPrompt("");
      sessionStorage.removeItem("neuramarket:agent-prompt");
    });
  }
  const composer = (
    <form
      className="studio-composer agent-composer"
      onSubmit={(e) => {
        e.preventDefault();
        void build();
      }}
    >
      <textarea
        aria-label={spec ? "O que deseja ajustar no agente?" : "Descreva o agente que quer criar"}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        maxLength={6000}
        placeholder={
          spec
            ? "Deixe as propostas mais objetivas e acrescente um cronograma..."
            : "Crie um agente que faça propostas comerciais para minha agência..."
        }
        disabled={!!busy}
      />
      <footer>
        <span>
          <Sparkles size={14} />
          {busy === "build" ? "A NeuraLake está configurando o agente..." : "Criado com NeuraLake"}
        </span>
        <button
          className="studio-primary"
          aria-label="Enviar descrição"
          disabled={!!busy || prompt.trim().length < 10}
        >
          {busy === "build" ? (
            <LoaderCircle size={19} className="animate-spin" />
          ) : (
            <ArrowUp size={19} />
          )}
        </button>
      </footer>
    </form>
  );
  return (
    <div className={spec ? "agent-studio" : "agent-welcome"}>
      {!spec ? (
        <>
          <span className="agent-orb">
            <Sparkles size={29} />
          </span>
          <span className="studio-eyebrow">SEU PRÓXIMO ESPECIALISTA COMEÇA AQUI</span>
          <h1>Que agente vamos criar?</h1>
          <p>
            Descreva o trabalho. Teste o resultado na prévia.
            <br />
            Use seu agente ou publique para receber contratações.
          </p>
          {composer}
          <div className="agent-examples">
            {AGENT_EXAMPLES.map((text, i) => (
              <button key={text} disabled={!!busy} onClick={() => setPrompt(text)}>
                {
                  [
                    "Propostas comerciais",
                    "Roteiros de conteúdo",
                    "Landing pages",
                    "Análise de entrevistas",
                  ][i]
                }
              </button>
            ))}
          </div>
          <small>
            O agente produz conteúdo, análises e arquivos. Conexões externas precisam de uma
            integração.
          </small>
          {error && (
            <p role="alert" className="agent-error">
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          <aside className="agent-conversation">
            <header>
              <Bot size={20} />
              <div>
                <strong>{spec.name}</strong>
                <small>Construa por conversa</small>
              </div>
            </header>
            <div className="agent-messages">
              {messages.map((m, i) => (
                <div key={i} className={`agent-message ${m.role}`}>
                  {m.text}
                </div>
              ))}
              {busy && (
                <p className="agent-progress" role="status">
                  <LoaderCircle size={16} className="animate-spin" />
                  {busy === "trial"
                    ? "Executando a tarefa pela NeuraLake..."
                    : busy === "save"
                      ? "Salvando seu agente..."
                      : "Preparando as alterações..."}
                </p>
              )}
              {error && (
                <p role="alert" className="agent-error">
                  {error}
                </p>
              )}
            </div>
            {composer}
          </aside>
          <section className="agent-preview">
            <header>
              <div className="agent-tabs">
                <button
                  className={tab === "preview" ? "active" : ""}
                  onClick={() => setTab("preview")}
                >
                  <Play size={15} />
                  Prévia
                </button>
                <button
                  className={tab === "config" ? "active" : ""}
                  onClick={() => setTab("config")}
                >
                  <Settings2 size={15} />
                  Configuração
                </button>
              </div>
              <span className="studio-tag">{spec.category}</span>
            </header>
            {tab === "config" ? (
              <div className="agent-config">
                <label>
                  Nome
                  <input
                    value={spec.name}
                    maxLength={70}
                    onChange={(e) => update({ name: e.target.value })}
                    disabled={!!busy}
                  />
                </label>
                <label>
                  Serviço oferecido
                  <input
                    value={spec.serviceTitle}
                    maxLength={100}
                    onChange={(e) => update({ serviceTitle: e.target.value })}
                    disabled={!!busy}
                  />
                </label>
                <label>
                  Descrição pública
                  <textarea
                    value={spec.description}
                    maxLength={1000}
                    onChange={(e) => update({ description: e.target.value })}
                    disabled={!!busy}
                  />
                </label>
                <label>
                  Instruções do agente
                  <textarea
                    className="agent-instructions"
                    value={spec.instructions}
                    maxLength={8000}
                    onChange={(e) => update({ instructions: e.target.value })}
                    disabled={!!busy}
                  />
                </label>
                <label>
                  Material de referência
                  <textarea
                    value={spec.knowledge}
                    maxLength={16000}
                    placeholder="Cole informações que o agente pode usar nas respostas. Não inclua senhas ou segredos."
                    onChange={(e) => update({ knowledge: e.target.value })}
                    disabled={!!busy}
                  />
                </label>
                <p>
                  As instruções ficam fora do catálogo público. O agente pode usar o material de
                  referência no conteúdo que entrega aos compradores.
                </p>
                <label>
                  Estrutura combinada da entrega
                  <input value={spec.sections.join(" | ")} readOnly />
                </label>
                <p>Peça alterações na estrutura pela conversa.</p>
              </div>
            ) : (
              <div className="agent-preview-body">
                <div className="agent-intro">
                  <span className="studio-company-mark small">{spec.name[0]}</span>
                  <h2>{spec.name}</h2>
                  <p>{spec.description}</p>
                </div>
                <label className="agent-task-label">
                  Experimente uma tarefa
                  <textarea
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    maxLength={12000}
                    disabled={!!busy}
                  />
                </label>
                <button
                  className="studio-primary"
                  disabled={!!busy || task.trim().length < 10}
                  onClick={() =>
                    void perform("trial", async () => {
                      const output = await trialStudioAgent({ data: { definition: spec, task } });
                      setTrial({ ...output, identity: executionIdentity(spec) });
                    })
                  }
                >
                  <Play size={15} />
                  {busy === "trial" ? "Executando..." : "Testar agente"}
                </button>
                {trial ? (
                  <>
                    <p className="agent-test-status">
                      {trial.report.summary} · {(trial.durationMs / 1000).toFixed(1)}s
                      {trial.usage?.total_tokens ? ` · ${trial.usage.total_tokens} tokens` : ""}
                    </p>
                    {!tested && (
                      <p className="agent-error">
                        A configuração mudou. Teste novamente antes de salvar.
                      </p>
                    )}
                    <AgentOutput value={trial.result} />
                  </>
                ) : (
                  <div className="agent-empty-preview">
                    <Bot size={36} />
                    <h3>O trabalho do seu agente aparece aqui</h3>
                    <p>O teste executa uma tarefa real com as instruções que você definiu.</p>
                  </div>
                )}
              </div>
            )}
            <footer className="agent-publish">
              <div>
                <label>
                  Quem pode contratar?
                  <select
                    value={spec.visibility}
                    onChange={(e) =>
                      update({ visibility: e.target.value as AgentDefinition["visibility"] })
                    }
                    disabled={!!busy}
                  >
                    <option value="private">Somente eu</option>
                    <option value="commercial">Publicar no marketplace</option>
                  </select>
                </label>
                {spec.visibility === "commercial" && (
                  <label>
                    Créditos por trabalho
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={spec.price}
                      disabled={!!busy}
                      onChange={(e) => update({ price: Number(e.target.value) })}
                    />
                  </label>
                )}
              </div>
              <button
                className="studio-primary"
                disabled={!!busy || !tested}
                title={tested ? "" : "Teste esta configuração antes de salvar"}
                onClick={() =>
                  void perform("save", async () => {
                    if (!tested || !trial) return;
                    const checked = agentDefinitionSchema.parse(spec);
                    request.current ||= crypto.randomUUID();
                    const saved = await saveStudioAgent({
                      data: {
                        requestId: request.current,
                        definition: checked,
                        trialId: trial.trialId,
                      },
                    });
                    sessionStorage.removeItem(storageKey);
                    await onSaved(saved.companyId, checked.visibility === "commercial");
                  })
                }
              >
                {spec.visibility === "commercial" ? <Globe size={16} /> : <Lock size={16} />}{" "}
                {spec.visibility === "commercial" ? "Publicar agente" : "Salvar meu agente"}
              </button>
            </footer>
          </section>
        </>
      )}
    </div>
  );
}
