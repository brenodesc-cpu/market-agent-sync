import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  KeyRound,
  PlugZap,
  ShieldCheck,
  Terminal,
  Code2,
} from "lucide-react";
import { createAgentKey, revokeAgentKey } from "@/lib/studio.functions";
import { getBrowserSetup } from "@/lib/browser.functions";
import type { StudioWorkspace } from "@/lib/studio.types";
import "@/agent-connection.css";

export function AgentConnection({
  workspace,
  signedIn,
  onLogin,
  onRefresh,
  onMonitor,
}: {
  workspace: StudioWorkspace;
  signedIn: boolean;
  onLogin: () => void;
  onRefresh: () => Promise<void>;
  onMonitor: () => void;
}) {
  const [company, setCompany] = useState("");
  const [token, setToken] = useState("");
  const [keyId, setKeyId] = useState("");
  const [origin, setOrigin] = useState("");
  const [mode, setMode] = useState<"mcp" | "api">("mcp");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    setOrigin(location.origin);
  }, []);
  useEffect(() => {
    if (!signedIn) {
      setToken("");
      setKeyId("");
      setVerified(false);
      setCompany("");
    }
  }, [signedIn]);
  const account = workspace.accounts.find((a) => a.company_id === company);
  const currentToken = token || "SUA_CREDENCIAL";
  const config = JSON.stringify(
    {
      mcpServers: {
        neuramarket: {
          type: "http",
          url: `${origin}/api/mcp`,
          headers: { Authorization: `Bearer ${currentToken}` },
        },
      },
    },
    null,
    2,
  );
  const claudeCommand = `claude mcp add --scope user --transport http neuramarket ${origin}/api/mcp --header "Authorization: Bearer $NEURAMARKET_API_KEY"`;
  const maskedConfig = config.replaceAll(currentToken, "SUA_CREDENCIAL");
  const curl = `curl '${origin}/api/a2a/browser/quote' \\\n  -H "Authorization: Bearer $NM_AGENT_KEY" \\\n  -H 'Content-Type: application/json' \\\n  -d '{"budget":20}'`;
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string, success: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(success);
      setError("");
    } catch {
      setError("O navegador não permitiu copiar. Selecione o endereço ou baixe a configuração.");
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([config], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "neuramarket-remote-mcp.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Configuração baixada. Ela contém a sua credencial privada.");
  }
  async function test() {
    setVerified(false);
    const response = await fetch("/api/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
        "MCP-Protocol-Version": "2025-03-26",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "connection_status", arguments: {} },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? "Credencial inválida ou revogada. Gere uma nova."
          : "O MCP remoto ainda não respondeu. Tente novamente.",
      );
    const raw = await response.text();
    const result = response.headers.get("content-type")?.includes("text/event-stream")
      ? raw
          .split("\n")
          .filter((line) => line.startsWith("data: "))
          .map((line) => JSON.parse(line.slice(6)))
          .find((item) => item.id === 1)
      : JSON.parse(raw);
    const content = result?.result;
    if (!content || content.isError)
      throw new Error("Não foi possível confirmar a conexão autenticada.");
    const status = content.structuredContent ?? JSON.parse(content.content?.[0]?.text ?? "{}");
    if (!status.connected || status.companyId !== company)
      throw new Error("A conexão não corresponde à empresa selecionada.");
    setVerified(true);
    setMessage(
      "Conexão MCP verificada. Nenhum crédito foi gasto. Agora cole a configuração no seu cliente.",
    );
  }
  return (
    <div className="agent-connection">
      <div className="connect-heading">
        <span className="connect-eyebrow">ACESSO PARA AGENTES</span>
        <h1>
          Uma conexão.
          <br />
          <span>Novas capacidades.</span>
        </h1>
        <p>Seu agente encontra fornecedores e contrata pela rede. Você acompanha cada decisão.</p>
      </div>
      <div className="connect-layout">
        <section className="connect-main">
          <div className="connect-tabs" role="tablist" aria-label="Forma de conexão">
            <button role="tab" aria-selected={mode === "mcp"} onClick={() => setMode("mcp")}>
              <PlugZap size={17} />
              MCP · Claude Code
            </button>
            <button role="tab" aria-selected={mode === "api"} onClick={() => setMode("api")}>
              <Code2 size={17} />
              API
            </button>
          </div>
          <div className="connect-step">
            <span className="connect-step-number">1</span>
            <div>
              <h2>Escolha quem pode contratar</h2>
              <p>A credencial usa o saldo desta empresa. O aceite final continua com você.</p>
              {signedIn ? (
                <select
                  aria-label="Empresa do agente conectado"
                  value={company}
                  onChange={(e) => {
                    setCompany(e.target.value);
                    setToken("");
                    setKeyId("");
                    setVerified(false);
                    setMessage("");
                  }}
                >
                  <option value="">Meu agente comprador da demonstração</option>
                  {workspace.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <button className="connect-primary" onClick={onLogin}>
                  Entrar para conectar <ArrowRight size={15} />
                </button>
              )}
              {signedIn && (
                <button
                  className="connect-primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const id = company || (await getBrowserSetup()).companyId;
                      const result = await createAgentKey({ data: { companyId: id } });
                      setCompany(id);
                      setToken(result.token);
                      setKeyId(result.id);
                      setVerified(false);
                      setMessage(
                        "Credencial criada. Copie a configuração antes de sair desta tela.",
                      );
                      await onRefresh();
                    })
                  }
                >
                  <KeyRound size={15} />
                  {busy ? "Aguarde…" : token ? "Gerar outra credencial" : "Gerar credencial"}
                </button>
              )}
            </div>
          </div>
          <div className="connect-step">
            <span className="connect-step-number">2</span>
            <div>
              <h2>{mode === "mcp" ? "Adicione ao seu cliente" : "Faça a primeira consulta"}</h2>
              <p>
                {mode === "mcp"
                  ? "O Claude Code acessa o servidor da NeuraMarket pela URL abaixo. Copie a credencial, defina NEURAMARKET_API_KEY no terminal e execute o comando."
                  : "Use a credencial na variável NM_AGENT_KEY. Esta consulta compara ofertas sem contratar."}
              </p>
              <div className="connect-endpoint">
                <code>
                  {origin}
                  {mode === "mcp" ? "/api/mcp" : "/api/a2a"}
                </code>
                <button
                  aria-label="Copiar endereço"
                  onClick={() =>
                    void copy(
                      `${origin}${mode === "mcp" ? "/api/mcp" : "/api/a2a"}`,
                      "Endereço copiado.",
                    )
                  }
                >
                  <Copy size={15} />
                </button>
              </div>
              <div className="connect-code">
                <div>
                  <Terminal size={13} />
                  <span>
                    {mode === "mcp"
                      ? "Configuração MCP · Authorization: Bearer"
                      : "Terminal · cotação sem custo"}
                  </span>
                </div>
                <pre>{mode === "mcp" ? claudeCommand : curl}</pre>
                {mode === "mcp" && (
                  <details>
                    <summary>Configuração JSON equivalente</summary>
                    <pre>{maskedConfig}</pre>
                  </details>
                )}
              </div>
              <div className="connect-buttons">
                {mode === "mcp" ? (
                  <>
                    <button
                      className="connect-primary"
                      onClick={() =>
                        void copy(
                          claudeCommand,
                          "Comando copiado. Defina NEURAMARKET_API_KEY antes de executar.",
                        )
                      }
                    >
                      Copiar comando Claude Code
                    </button>
                    <button
                      className="connect-secondary"
                      disabled={!token}
                      onClick={() =>
                        void copy(
                          token,
                          "Credencial copiada. Guarde na variável NEURAMARKET_API_KEY do terminal.",
                        )
                      }
                    >
                      Copiar credencial
                    </button>
                    <button
                      className="connect-secondary"
                      disabled={!token}
                      onClick={() =>
                        void copy(
                          config,
                          "Configuração copiada com a credencial. Cole apenas no seu cliente MCP.",
                        )
                      }
                    >
                      <Copy size={15} />
                      Copiar configuração
                    </button>
                    <button className="connect-secondary" disabled={!token} onClick={download}>
                      Baixar JSON
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="connect-primary"
                      onClick={() => void copy(curl, "Exemplo copiado.")}
                    >
                      <Copy size={15} />
                      Copiar exemplo
                    </button>
                    <button
                      className="connect-secondary"
                      disabled={!token}
                      onClick={() => void copy(token, "Credencial copiada.")}
                    >
                      Copiar credencial
                    </button>
                  </>
                )}
              </div>
              <p className="connect-fine">
                A chave fica oculta na tela e entra na configuração copiada. Clientes que exigem
                OAuth ainda não são compatíveis.
              </p>
            </div>
          </div>
          <div className="connect-step">
            <span className="connect-step-number">3</span>
            <div>
              <h2>Confira antes de contratar</h2>
              <p>
                O teste verifica a conexão com o servidor. No Claude Code, use /mcp para conferir a
                conexão do seu cliente.
              </p>
              <button
                className={verified ? "connect-verified" : "connect-secondary"}
                disabled={!token || busy}
                onClick={() => void run(test)}
              >
                {verified ? <Check size={16} /> : <PlugZap size={16} />}{" "}
                {verified ? "Conexão verificada" : "Testar conexão sem gastar"}
              </button>
            </div>
          </div>
          {message && (
            <p className="connect-message" role="status">
              {message}
            </p>
          )}
          {error && (
            <p className="connect-error" role="alert">
              {error}
            </p>
          )}
        </section>
        <aside className="connect-side">
          <div>
            <ShieldCheck size={24} />
            <h2>Você define os limites.</h2>
            <p>
              {account
                ? `${account.available_units} créditos disponíveis nesta empresa.`
                : "Cada compra respeita o saldo da empresa e o orçamento informado no pedido."}
            </p>
            <ul>
              <li>Acesso limitado à empresa escolhida.</li>
              <li>Contratação e acompanhamento por agente.</li>
              <li>Pagamento após verificação e aceite humano.</li>
              <li>Créditos simulados, sem cobrança real.</li>
            </ul>
            <button className="connect-secondary" onClick={onMonitor}>
              Abrir painel ao vivo <ArrowRight size={15} />
            </button>
          </div>
          <div>
            <h3>Primeiro pedido ao seu agente</h3>
            <p className="connect-prompt">
              “Use a NeuraMarket para comparar testes de navegador com orçamento de 20 créditos.
              Mostre a cotação antes de contratar.”
            </p>
            <small>
              Demo limitada ao formulário de teste da plataforma. O executor precisa estar
              conectado.
            </small>
          </div>
          {signedIn && (
            <div>
              <h3>Credenciais da empresa</h3>
              {workspace.credentials.filter((c) => c.company_id === company).length === 0 && (
                <p>Nenhuma credencial criada nesta empresa.</p>
              )}
              {workspace.credentials
                .filter((c) => c.company_id === company)
                .map((c) => (
                  <div className="connect-key" key={c.id}>
                    <code>{c.prefix}…</code>
                    {c.revoked_at ? (
                      <span>Revogada</span>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await revokeAgentKey({ data: { credentialId: c.id } });
                            if (c.id === keyId) {
                              setToken("");
                              setVerified(false);
                            }
                            await onRefresh();
                            setMessage("Credencial revogada.");
                          })
                        }
                      >
                        Revogar
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
