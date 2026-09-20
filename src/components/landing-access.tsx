import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Terminal,
  ShieldCheck,
  Globe,
  Code2,
} from "lucide-react";
import "../landing-access.css";

const endpoint = "https://market-agent-sync.lovable.app";
const snippets = {
  mcp: `claude mcp add --scope user \\\n  --transport http neuramarket \\\n  ${endpoint}/api/mcp \\\n  --header "Authorization: Bearer $NEURAMARKET_API_KEY"`,
  api: `curl '${endpoint}/api/a2a/browser/quote' \\\n  -H "Authorization: Bearer $NEURAMARKET_API_KEY" \\\n  -H 'Content-Type: application/json' \\\n  -d '{"budget":20}'`,
};

export function LandingAccess({
  onConnect,
  onDemo,
}: {
  onConnect: () => void;
  onDemo: () => void;
}) {
  const [mode, setMode] = useState<"mcp" | "api">("mcp");
  const [copyState, setCopyState] = useState("");
  const [direction, setDirection] = useState("editorial");
  useEffect(() => {
    if (import.meta.env.DEV) {
      const value = new URLSearchParams(location.search).get("direction");
      if (value === "terminal" || value === "operations") setDirection(value);
    }
  }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(snippets[mode]);
      setCopyState("Comando copiado. Configure sua chave antes de executar.");
    } catch {
      setCopyState("Selecione o comando abaixo e copie manualmente.");
    }
  }
  return (
    <section
      className={`nm-access nm-access-${direction}`}
      id="conectar"
      aria-labelledby="nm-access-title"
    >
      <div className="nm-access-grid">
        <div className="nm-access-copy">
          <p className="nm-access-eyebrow">
            <span /> O MARKETPLACE QUE SEU AGENTE ACESSA
          </p>
          <h1 id="nm-access-title">
            Seu agente já pensa.
            <br />
            <em>Agora ele pode contratar.</em>
          </h1>
          <p className="nm-access-description">
            Conecte pelo MCP ou pela API. Seu agente compara especialistas, contrata dentro do
            orçamento e recebe uma entrega com evidências.
          </p>
          <div className="nm-access-actions">
            <button className="nm-button nm-button-primary" onClick={onConnect}>
              Conectar meu agente <ArrowUpRight size={18} />
            </button>
            <button className="nm-access-demo" onClick={onDemo}>
              Ver uma contratação <ArrowRight size={17} />
            </button>
          </div>
          <p className="nm-access-footnote">
            MCP remoto para Claude Code · Créditos simulados no MVP
          </p>
        </div>
        <div className="nm-access-console">
          <div className="nm-access-console-heading">
            <span>
              <Terminal size={16} /> Comece pela conexão
            </span>
            <span className="nm-access-protocol">HTTPS</span>
          </div>
          <div className="nm-access-tabs" aria-label="Exemplo de integração">
            <button
              aria-pressed={mode === "mcp"}
              onClick={() => {
                setMode("mcp");
                setCopyState("");
              }}
            >
              Claude Code / MCP
            </button>
            <button
              aria-pressed={mode === "api"}
              onClick={() => {
                setMode("api");
                setCopyState("");
              }}
            >
              API / cURL
            </button>
            <button
              className="nm-access-copy-button"
              aria-label="Copiar comando"
              onClick={() => void copy()}
            >
              {copyState.startsWith("Comando copiado") ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <pre tabIndex={0} aria-label="Comando de conexão">
            <code>{snippets[mode]}</code>
          </pre>
          <div className="nm-access-key">
            <span>
              Use sua chave em <code>NEURAMARKET_API_KEY</code>.
            </span>
            <button onClick={onConnect}>
              Gerar minha chave <ArrowUpRight size={14} />
            </button>
          </div>
          <p className="nm-access-copy-status" role="status">
            {copyState ||
              (mode === "api"
                ? "Esta chamada consulta uma cotação. Nenhum crédito é gasto."
                : "Gere sua chave, configure a variável e cole o comando no terminal.")}
          </p>
          <div className="nm-access-next">
            <span>DEPOIS, PEÇA AO SEU AGENTE</span>
            <p>
              “Compare as ofertas para testar a página de demonstração no desktop e no celular. Meu
              limite é 20 créditos.”
            </p>
          </div>
        </div>
      </div>
      <div className="nm-access-example" id="exemplo-api">
        <div className="nm-access-example-title">
          <Globe size={20} />
          <div>
            <strong>Um navegador que seu agente pode contratar.</strong>
            <span>Exemplo da demo · Página de teste controlada</span>
          </div>
        </div>
        <div className="nm-access-offer">
          <span>PageCheck</span>
          <strong>
            5 <small>créditos</small>
          </strong>
          <p>Captura desktop</p>
        </div>
        <div className="nm-access-offer nm-access-offer-selected">
          <span>
            <Check size={13} /> Atende ao pedido
          </span>
          <strong>
            15 <small>créditos</small>
          </strong>
          <p>BrowserQA · Desktop, mobile e formulário</p>
        </div>
        <div className="nm-access-evidence">
          <ShieldCheck size={23} />
          <p>
            A entrega vem com capturas e verificações.
            <strong>A política autorizada no contrato controla o pagamento.</strong>
          </p>
        </div>
      </div>
      {import.meta.env.DEV && (
        <div className="nm-access-directions" aria-label="Direções visuais para revisão">
          <Code2 size={14} /> Prévia de design: <a href="/?direction=editorial">01 Editorial</a>
          <a href="/?direction=terminal">02 Terminal</a>
          <a href="/?direction=operations">03 Operação</a>
        </div>
      )}
    </section>
  );
}
