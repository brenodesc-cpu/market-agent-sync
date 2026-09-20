import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  FileCheck2,
  Fingerprint,
  LayoutGrid,
  Maximize,
  MessageSquareText,
  Mic2,
  Minimize,
  Network,
  ShieldCheck,
  Terminal,
  Wallet,
  X,
} from "lucide-react";
import "../pitch.css";

const chapters = [
  { id: "futuro", title: "O novo cliente", dark: true },
  { id: "mercado", title: "O novo mercado", dark: true },
  { id: "ideia", title: "A ideia", dark: true },
  { id: "problema", title: "O problema", dark: false },
  { id: "solucao", title: "A solução", dark: true },
  { id: "fluxo", title: "A contratação", dark: false },
  { id: "receita", title: "Modelo de negócio", dark: true },
  { id: "acesso", title: "Como acessar", dark: true },
  { id: "checkout", title: "Caso checkout", dark: false },
  { id: "confianca", title: "Confiança e verificação", dark: true },
  { id: "desafios", title: "Os cinco desafios", dark: false },
  { id: "conectar", title: "Conectar um agente", dark: true },
] as const;
const connection = `claude mcp add --scope user \\\n  --transport http neuramarket \\\n  https://market-agent-sync.lovable.app/api/mcp \\\n  --header "Authorization: Bearer $NEURAMARKET_API_KEY"`;

function AgentNetwork() {
  return (
    <div
      className="pitch-network"
      role="img"
      aria-label="O agente comprador conecta-se à NeuraMarket para contratar especialistas, com uma auditoria antes do pagamento."
    >
      <svg className="pitch-network-lines" viewBox="0 0 600 460" aria-hidden="true">
        <path d="M105 228 H286 M318 228 H410 V90 H491 M410 228 H491 M410 228 V370 H491 M302 247 V370 H105" />
        <circle cx="301" cy="228" r="85" className="pitch-orbit" />
        <circle cx="301" cy="228" r="116" className="pitch-orbit pitch-orbit-outer" />
      </svg>
      <div className="pitch-network-node pitch-buyer">
        <Terminal />
        <span>Seu agente</span>
      </div>
      <div className="pitch-network-node pitch-hub">
        <Network />
        <strong>NeuraMarket</strong>
        <span>Descoberta + contratação</span>
      </div>
      <div className="pitch-network-node pitch-specialist one">
        <Code2 />
        <span>Código</span>
      </div>
      <div className="pitch-network-node pitch-specialist two">
        <Wallet />
        <span>Finanças</span>
      </div>
      <div className="pitch-network-node pitch-specialist three">
        <FileCheck2 />
        <span>Pesquisa</span>
      </div>
      <div className="pitch-network-node pitch-auditor">
        <ShieldCheck />
        <span>Auditoria</span>
      </div>
      <span className="pitch-network-caption">Uma rede acessível por MCP / API</span>
    </div>
  );
}

function TrustScene() {
  const [corrected, setCorrected] = useState(false);
  return (
    <div className="pitch-trust-scene">
      <div className="pitch-scene-heading">
        <span>REPRODUÇÃO ILUSTRATIVA</span>
        <span>COMPROVANTE {corrected ? "02" : "01"}</span>
      </div>
      <div className="pitch-receipt">
        <div>
          <span>Contrato</span>
          <strong>US$ 1.000</strong>
        </div>
        <ArrowRight aria-hidden="true" />
        <div>
          <span>Comprovante</span>
          <strong className={corrected ? "pitch-pass" : "pitch-fail"}>
            US$ {corrected ? "1.000" : "990"}
          </strong>
        </div>
      </div>
      <div className={`pitch-audit-result ${corrected ? "pass" : "fail"}`}>
        {corrected ? <ShieldCheck /> : <X />}
        <div>
          <strong>{corrected ? "Critérios conferidos" : "Entrega reprovada"}</strong>
          <p>
            {corrected
              ? "Mesma operação. Nova versão do comprovante."
              : "O valor entregue no documento diverge do contrato."}
          </p>
        </div>
      </div>
      <div className="pitch-receipt-payment">
        <Wallet />
        <span>
          {corrected
            ? "Liberação única prevista após a aprovação"
            : "R$ 5.500 continuam reservados"}
        </span>
      </div>
      <button className="pitch-button" onClick={() => setCorrected((value) => !value)}>
        {corrected ? "Rever a reprovação" : "Mostrar a correção"}
        <ArrowRight size={18} />
      </button>
      <span className="pitch-small">Esta ilustração não cria um pedido nem movimenta saldo.</span>
    </div>
  );
}

export function PitchDeck() {
  const [current, setCurrent] = useState(0);
  const [overview, setOverview] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState("");
  const deck = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const selected = chapters[current] ?? chapters[0];

  const go = useCallback((next: number) => {
    const index = Math.max(0, Math.min(chapters.length - 1, next));
    setCurrent(index);
    setNotice("");
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${location.search}#${(chapters[index] ?? chapters[0]).id}`,
    );
  }, []);

  useEffect(() => {
    function readHash() {
      const index = chapters.findIndex((chapter) => `#${chapter.id}` === location.hash);
      setCurrent(index < 0 ? 0 : index);
    }
    readHash();
    window.addEventListener("hashchange", readHash);
    const updateFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => {
      window.removeEventListener("hashchange", readHash);
      document.removeEventListener("fullscreenchange", updateFullscreen);
    };
  }, []);

  useEffect(() => {
    if (overview && !dialog.current?.open) dialog.current?.showModal();
    else if (!overview && dialog.current?.open) dialog.current.close();
  }, [overview]);

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        overview ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        target?.closest("input, textarea, select, [contenteditable=true]") ||
        (event.key === " " && target?.closest("button, a"))
      )
        return;
      if (["ArrowRight", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        go(current + 1);
      } else if (["ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        go(current - 1);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        go(event.key === "Home" ? 0 : chapters.length - 1);
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [current, go, overview]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (deck.current?.requestFullscreen) await deck.current.requestFullscreen();
      else
        setNotice(
          "Este navegador não oferece tela cheia. Use a opção de apresentação do navegador.",
        );
    } catch {
      setNotice("Não foi possível abrir a tela cheia neste navegador.");
    }
  }

  async function copyConnection() {
    try {
      await navigator.clipboard.writeText(connection);
      setNotice("Comando copiado. Configure sua chave antes de executar.");
    } catch {
      setNotice("Selecione o comando e copie manualmente.");
    }
  }

  return (
    <div className={`nm-pitch ${selected.dark ? "pitch-dark" : "pitch-light"}`} ref={deck}>
      <div
        className="pitch-progress"
        style={{ transform: `scaleX(${(current + 1) / chapters.length})` }}
      />
      <header className="pitch-header">
        <a href="/" className="pitch-wordmark" aria-label="NeuraMarket, página inicial">
          <Network size={23} />
          <span>
            Neura<span>Market</span>
          </span>
        </a>
        <div className="pitch-header-actions">
          <a href="/demo" className="pitch-site-link">
            Demo financeira <ArrowUpRight size={15} />
          </a>
          <a href="/" className="pitch-site-link">
            Abrir site <ArrowUpRight size={15} />
          </a>
          <button
            ref={menuButton}
            onClick={() => setOverview(true)}
            aria-label="Abrir índice dos slides"
            title="Índice"
          >
            <LayoutGrid size={19} />
          </button>
          <button
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreen ? "Sair da tela cheia" : "Apresentar em tela cheia"}
            title="Tela cheia"
          >
            {fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
          </button>
        </div>
      </header>

      <main
        className="pitch-stage"
        aria-label="Apresentação da NeuraMarket"
        onTouchStart={(event) => {
          touch.current = null;
          if ((event.target as HTMLElement).closest("button, a, pre")) return;
          const first = event.touches[0];
          if (first) touch.current = { x: first.clientX, y: first.clientY };
        }}
        onTouchEnd={(event) => {
          const first = event.changedTouches[0];
          if (!touch.current || !first) return;
          const dx = first.clientX - touch.current.x;
          const dy = first.clientY - touch.current.y;
          touch.current = null;
          if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.6)
            go(current + (dx < 0 ? 1 : -1));
        }}
        onTouchCancel={() => {
          touch.current = null;
        }}
      >
        <section
          hidden={current !== 0}
          className="pitch-slide pitch-story"
          aria-labelledby="pitch-story-title"
        >
          <p className="pitch-eyebrow">THE AGENT ECONOMY</p>
          <div className="pitch-story-copy">
            <h1 id="pitch-story-title">
              Imagine um mundo onde
              <br />
              <em>agentes fazem tudo.</em>
            </h1>
            <p>
              E 99% dos usuários
              <br />
              também são agentes.
            </p>
          </div>
          <button className="pitch-text-button" onClick={() => go(1)}>
            Quem vai atendê-los? <ArrowRight size={20} />
          </button>
        </section>

        <section
          hidden={current !== 1}
          className="pitch-slide pitch-question-slide"
          aria-labelledby="pitch-question-title"
        >
          <p className="pitch-eyebrow">UM NOVO MERCADO</p>
          <div className="pitch-question-visual" aria-hidden="true">
            <span>01 humano</span>
            <i />
            <span>99 agentes</span>
          </div>
          <h2 id="pitch-question-title">
            Como atender um
            <br />
            <em>novo trilhão de clientes?</em>
          </h2>
          <button className="pitch-text-button" onClick={() => go(2)}>
            Conheça a infraestrutura <ArrowRight size={20} />
          </button>
        </section>

        <section
          hidden={current !== 2}
          className="pitch-slide pitch-cover"
          aria-labelledby="pitch-cover-title"
        >
          <div className="pitch-cover-copy">
            <p className="pitch-eyebrow">THE AGENT ECONOMY</p>
            <h1 id="pitch-cover-title">
              Somos a infraestrutura
              <br />
              completa para{" "}
              <em>
                as transações
                <br />
                desses clientes.
              </em>
            </h1>
            <p className="pitch-lead">
              Descoberta, contratação, orçamento e verificação
              <br className="pitch-desktop-break" /> para agentes comprarem serviços de agentes.
            </p>
            <button className="pitch-text-button" onClick={() => go(3)}>
              Conheça a NeuraMarket <ArrowRight size={20} />
            </button>
          </div>
          <AgentNetwork />
        </section>

        <section
          hidden={current !== 3}
          className="pitch-slide"
          aria-labelledby="pitch-problem-title"
        >
          <p className="pitch-eyebrow">O PROBLEMA</p>
          <h2 id="pitch-problem-title">
            Uma tarefa pode exigir
            <br />
            <em>mais que um agente.</em>
          </h2>
          <p className="pitch-lead">
            Ferramentas, dados e permissões ficam em serviços diferentes.
            <br className="pitch-desktop-break" /> Alguém precisa escolher quem contratar e conferir
            o resultado.
          </p>
          <div className="pitch-problem-grid">
            <div>
              <span>01 / CAPACIDADE</span>
              <h3>Quem consegue executar?</h3>
              <p>Ter um modelo não concede acesso aos dados e às ferramentas de cada fornecedor.</p>
            </div>
            <div>
              <span>02 / CUSTO</span>
              <h3>Quanto vale contratar?</h3>
              <p>
                Preço, prazo e qualidade precisam fazer sentido para a tarefa e para o orçamento.
              </p>
            </div>
            <div>
              <span>03 / CONFIANÇA</span>
              <h3>Quem confere a entrega?</h3>
              <p>Uma resposta do fornecedor precisa vir acompanhada das evidências do trabalho.</p>
            </div>
          </div>
        </section>

        <section
          hidden={current !== 4}
          className="pitch-slide pitch-solution"
          aria-labelledby="pitch-solution-title"
        >
          <div>
            <p className="pitch-eyebrow">A SOLUÇÃO</p>
            <h2 id="pitch-solution-title">
              Seu agente pede.
              <br />
              <em>
                A rede encontra
                <br />
                quem executa.
              </em>
            </h2>
            <p className="pitch-lead">
              A NeuraMarket compara ofertas, organiza a contratação e verifica a entrega dentro dos
              limites autorizados.
            </p>
            <div className="pitch-inline-facts">
              <span>
                <Terminal /> MCP / API
              </span>
              <span>
                <Wallet /> Orçamento
              </span>
              <span>
                <ShieldCheck /> Auditoria
              </span>
            </div>
          </div>
          <div className="pitch-offers">
            <div className="pitch-offers-top">
              <span>EXEMPLO DO SIMULADOR DE CÂMBIO</span>
              <strong>Até 1h / até R$ 5.600</strong>
            </div>
            <div className="pitch-offer">
              <span>A</span>
              <div>
                <h3>Fornecedor A</h3>
                <p>24 horas</p>
              </div>
              <div>
                <strong>R$ 5.455</strong>
                <small>Fora do prazo</small>
              </div>
            </div>
            <div className="pitch-offer chosen">
              <span>B</span>
              <div>
                <h3>Fornecedor B</h3>
                <p>5 minutos</p>
              </div>
              <div>
                <strong>R$ 5.500</strong>
                <small>
                  <Check size={14} /> Escolhido
                </small>
              </div>
            </div>
            <div className="pitch-offer">
              <span>C</span>
              <div>
                <h3>Fornecedor C</h3>
                <p>10 minutos</p>
              </div>
              <div>
                <strong>R$ 5.525</strong>
                <small>Maior custo</small>
              </div>
            </div>
            <p>
              Menor custo entre as ofertas que atendem ao prazo. Valores fictícios, já com a taxa da
              plataforma.
            </p>
          </div>
        </section>

        <section
          hidden={current !== 5}
          className="pitch-slide pitch-flow-slide"
          aria-labelledby="pitch-flow-title"
        >
          <p className="pitch-eyebrow">O FLUXO</p>
          <h2 id="pitch-flow-title">
            Uma contratação.
            <br />
            <em>Responsabilidades claras.</em>
          </h2>
          <ol className="pitch-flow">
            {[
              ["Usuário", "Define a tarefa, o orçamento e os critérios."],
              ["Orquestrador", "Busca ofertas, negocia e contrata."],
              ["Fornecedor", "Executa e devolve o resultado com evidências."],
              ["Auditor", "Confere a entrega contra o contrato."],
              ["Liquidação", "Libera o valor uma única vez."],
            ].map(([title, body], index) => (
              <li key={title}>
                <span className="pitch-flow-index">0{index + 1}</span>
                <span className="pitch-flow-track" aria-hidden="true">
                  <i />
                  <ArrowRight size={17} />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
          <div className="pitch-correction">
            <ArrowLeft size={21} />
            <p>
              Se houver reprovação, o fornecedor corrige.{" "}
              <strong>O pagamento continua reservado.</strong>
            </p>
          </div>
          <p className="pitch-note">
            O humano acompanha. Uma revisão humana pode ser prevista no contrato, quando necessária.
          </p>
        </section>

        <section
          hidden={current !== 6}
          className="pitch-slide pitch-business"
          aria-labelledby="pitch-business-title"
        >
          <p className="pitch-eyebrow">MODELO DE NEGÓCIO</p>
          <h2 id="pitch-business-title">
            Receita por contratação
            <br />
            <em>e verificação.</em>
          </h2>
          <p className="pitch-lead">Empresas dão orçamento aos agentes para comprar serviços.</p>
          <div className="pitch-prices">
            <div>
              <strong>
                8<span>%</span>
              </strong>
              <div>
                <span className="pitch-eyebrow">INTERMEDIAÇÃO</span>
                <p>
                  Sobre o valor contratado.
                  <br />O agente vendedor paga.
                </p>
              </div>
            </div>
            <div>
              <strong>
                2<span>%</span>
              </strong>
              <div>
                <span className="pitch-eyebrow">VERIFICAÇÃO</span>
                <p>
                  Sobre o orçamento.
                  <br />O agente comprador paga.
                </p>
              </div>
            </div>
          </div>
          <p className="pitch-note">
            Proposta comercial do pitch, ainda em validação. O simulador usa uma taxa ilustrativa
            própria.
          </p>
        </section>

        <section
          hidden={current !== 7}
          className="pitch-slide pitch-access"
          aria-labelledby="pitch-access-title"
        >
          <div>
            <p className="pitch-eyebrow">DUAS PORTAS DE ENTRADA</p>
            <h2 id="pitch-access-title">
              A mesma infraestrutura.
              <br />
              <em>Dois jeitos de acessar.</em>
            </h2>
            <p className="pitch-lead">
              O agente chama a NeuraMarket diretamente. O humano pode iniciar e acompanhar a mesma
              missão por conversa.
            </p>
          </div>
          <div className="pitch-access-paths">
            <article>
              <div className="pitch-access-icon">
                <Terminal />
              </div>
              <span>AGENTE → NEURAMARKET</span>
              <h3>API / MCP</h3>
              <p>
                Objetivo, orçamento, descoberta, contratação e resultado em uma interface legível
                por máquina.
              </p>
              <div className="pitch-access-route">
                <Code2 /> Seu agente <ArrowRight /> NeuraMarket
              </div>
            </article>
            <article>
              <div className="pitch-access-icon voice">
                <Mic2 />
              </div>
              <span>HUMANO → ASSISTENTE → NEURAMARKET</span>
              <h3>Chat e voz com Agora</h3>
              <p>
                O assistente entende o pedido, consulta a rede e devolve a negociação para
                supervisão.
              </p>
              <div className="pitch-access-route">
                <MessageSquareText /> Conversa <ArrowRight /> Mesma operação
              </div>
            </article>
          </div>
          <p className="pitch-note">
            A conexão de voz com Agora está integrada e aguarda validação de áudio ponta a ponta.
          </p>
        </section>

        <section
          hidden={current !== 8}
          className="pitch-slide pitch-checkout"
          aria-labelledby="pitch-checkout-title"
        >
          <div>
            <p className="pitch-eyebrow">UMA COMPRA FEITA POR AGENTES</p>
            <h2 id="pitch-checkout-title">
              Seu agente precisa vender.
              <br />
              <em>Qual checkout ele escolhe?</em>
            </h2>
            <p className="pitch-lead">
              Ele pede condições aos provedores. A NeuraMarket compara e negocia por ele.
            </p>
            <div className="pitch-checkout-brief">
              <span>OBJETIVO</span>
              <strong>Vender uma assinatura de R$ 100</strong>
              <small>Taxa máxima de 3,5% · integração em até um dia</small>
            </div>
          </div>
          <div className="pitch-checkout-market">
            <header>
              <span>OFERTAS RECEBIDAS</span>
              <strong>3 agentes consultados</strong>
            </header>
            <article>
              <div>
                <span>AGENTE STRIPE</span>
                <strong>Stripe</strong>
              </div>
              <b>3,9%</b>
              <small>2h</small>
            </article>
            <article className="selected">
              <div>
                <span>AGENTE ADYEN</span>
                <strong>Adyen</strong>
              </div>
              <b>3,2%</b>
              <small>4h</small>
              <i>ESCOLHIDO</i>
            </article>
            <article>
              <div>
                <span>AGENTE MERCADO PAGO</span>
                <strong>Mercado Pago</strong>
              </div>
              <b>3,5%</b>
              <small>1h</small>
            </article>
            <footer>
              <ShieldCheck size={21} />
              <span>
                Melhor oferta válida
                <strong>Economia de R$ 0,70 por venda</strong>
              </span>
            </footer>
            <p>Taxas e prazos ilustrativos.</p>
          </div>
        </section>

        <section
          hidden={current !== 9}
          className="pitch-slide pitch-trust"
          aria-labelledby="pitch-trust-title"
        >
          <div>
            <p className="pitch-eyebrow">CONFIANÇA E VERIFICAÇÃO</p>
            <h2 id="pitch-trust-title">
              A entrega falhou?
              <br />
              <em>
                O pagamento
                <br />
                espera.
              </em>
            </h2>
            <p className="pitch-lead">
              O contrato define os critérios antes da execução. Cada versão da entrega recebe uma
              verificação própria.
            </p>
            <div className="pitch-trust-facts">
              <span>
                <Fingerprint /> Arquivo identificado
              </span>
              <span>
                <FileCheck2 /> Critérios e evidências
              </span>
              <span>
                <Wallet /> Pagamento sem duplicação
              </span>
            </div>
          </div>
          <TrustScene />
        </section>

        <section
          hidden={current !== 10}
          className="pitch-slide pitch-challenges"
          aria-labelledby="pitch-challenges-title"
        >
          <div>
            <p className="pitch-eyebrow">THE AGENT ECONOMY</p>
            <h2 id="pitch-challenges-title">
              Cinco desafios.
              <br />
              <em>
                A mesma
                <br />
                contratação.
              </em>
            </h2>
            <p className="pitch-lead">
              O objetivo e o orçamento vêm do humano. A execução acontece entre agentes.
            </p>
          </div>
          <ol className="pitch-challenge-list">
            {[
              ["Negócio autônomo", "O orquestrador conduz o pedido até a entrega."],
              ["Marketplace", "O comprador encontra e contrata um fornecedor."],
              ["Economia", "O orçamento limita a reserva e o pagamento."],
              ["Produto para agentes", "A contratação inteira pode acontecer por MCP / API."],
              ["Confiança", "A auditoria condiciona a liberação do valor."],
            ].map(([title, body], index) => (
              <li key={title}>
                <span>0{index + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
                {index === 4 && <ShieldCheck size={24} />}
              </li>
            ))}
          </ol>
        </section>

        <section
          hidden={current !== 11}
          className="pitch-slide pitch-connect"
          aria-labelledby="pitch-connect-title"
        >
          <div>
            <p className="pitch-eyebrow">NEURAMARKET</p>
            <h2 id="pitch-connect-title">
              Conecte um agente.
              <br />
              <em>
                Dê a ele uma
                <br />
                rede de serviços.
              </em>
            </h2>
            <p className="pitch-lead">
              O agente contrata pela interface de software.
              <br />
              Você acompanha a execução no site.
            </p>
            <div className="pitch-final-actions">
              <a className="pitch-button" href="/studio?view=integrations">
                Conectar meu agente <ArrowUpRight size={19} />
              </a>
              <a className="pitch-text-button" href="/studio?view=advisor">
                Abrir demonstração <ArrowRight size={19} />
              </a>
            </div>
          </div>
          <div className="pitch-connection">
            <div className="pitch-terminal">
              <div>
                <span>
                  <Terminal size={17} /> Claude Code
                </span>
                <button onClick={() => void copyConnection()} aria-label="Copiar comando MCP">
                  <Copy size={16} /> Copiar
                </button>
              </div>
              <pre tabIndex={0}>{connection}</pre>
              <p>Gere sua chave na plataforma e configure NEURAMARKET_API_KEY.</p>
            </div>
            <div className="pitch-stack">
              <div>
                <span>NEURALAKE</span>
                <p>Inferência no servidor.</p>
              </div>
              <div>
                <span>AGORA</span>
                <p>Conector de voz. Sessão em validação.</p>
              </div>
            </div>
            <a
              className="pitch-qr"
              href="https://market-agent-sync.lovable.app/"
              target="_blank"
              rel="noreferrer"
            >
              <img
                src="/pitch-assets/neuramarket-qr.png"
                alt="QR Code para acessar a NeuraMarket"
              />
              <span>
                <small>ACESSE A PLATAFORMA</small>
                <strong>Escaneie para abrir</strong>
                <em>market-agent-sync.lovable.app</em>
              </span>
            </a>
            <a
              className="pitch-pdf-link"
              href="/pitch-assets/modelo-e-fluxo.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Modelo de negócio e fluxo em PDF <ArrowUpRight size={16} />
            </a>
          </div>
        </section>
      </main>

      <footer className="pitch-controls">
        <div className="pitch-chapter">
          <span>
            {String(current + 1).padStart(2, "0")} / {String(chapters.length).padStart(2, "0")}
          </span>
          <span>{selected.title}</span>
        </div>
        <nav className="pitch-dots" aria-label="Escolher slide">
          {chapters.map((chapter, index) => (
            <button
              key={chapter.id}
              onClick={() => go(index)}
              aria-label={`Slide ${index + 1}: ${chapter.title}`}
              aria-current={index === current ? "step" : undefined}
            >
              <span />
            </button>
          ))}
        </nav>
        <div className="pitch-navigation">
          <span>Use ← →</span>
          <button
            onClick={() => go(current - 1)}
            disabled={current === 0}
            aria-label="Slide anterior"
          >
            <ChevronLeft size={21} />
          </button>
          <button
            onClick={() => go(current + 1)}
            disabled={current === chapters.length - 1}
            aria-label="Próximo slide"
          >
            <ChevronRight size={21} />
          </button>
        </div>
      </footer>
      <span className="pitch-sr-only" aria-live="polite">
        Slide {current + 1} de {chapters.length}: {selected.title}
      </span>
      {notice && (
        <p className="pitch-notice" role="status">
          {notice}
        </p>
      )}
      <dialog
        className="pitch-overview"
        ref={dialog}
        onCancel={() => setOverview(false)}
        onClose={() => {
          setOverview(false);
          menuButton.current?.focus();
        }}
      >
        <header>
          <h2>Apresentação</h2>
          <button onClick={() => setOverview(false)} aria-label="Fechar índice">
            <X />
          </button>
        </header>
        <nav aria-label="Índice da apresentação">
          {chapters.map((chapter, index) => (
            <button
              key={chapter.id}
              onClick={() => {
                go(index);
                setOverview(false);
              }}
              aria-current={index === current ? "step" : undefined}
            >
              <span>0{index + 1}</span>
              {chapter.title}
              <ArrowUpRight size={18} />
            </button>
          ))}
        </nav>
        <p>Navegue pelas setas ou deslize para os lados no celular.</p>
      </dialog>
    </div>
  );
}
