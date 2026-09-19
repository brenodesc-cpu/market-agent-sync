import { useEffect, useRef, useState } from "react";
import { compareEconomics } from "@/lib/economics";
import { createCatalogueCsv, SAMPLE_ROWS, parseCatalogueCsv } from "@/lib/a2a-contract";
import {
  executePrivateService,
  placeStudioOrder,
  executeStudioOrder,
  setCompanyCommercial,
} from "@/lib/studio.functions";
import type { StudioWorkspace, StudioDetails } from "@/lib/studio.types";

export function MissionPanel({
  workspace,
  onOrder,
  onRefresh,
  onCreate,
  onLogin,
  signedIn,
}: {
  workspace: StudioWorkspace;
  onOrder: (order: StudioDetails) => void;
  onRefresh: () => Promise<void>;
  onCreate: () => void;
  onLogin: () => void;
  signedIn: boolean;
}) {
  const [company, setCompany] = useState(workspace.companies[0]?.id ?? "");
  const [goal, setGoal] = useState("Preparar meu catálogo para importar na loja");
  const [csv, setCsv] = useState(createCatalogueCsv(SAMPLE_ROWS));
  const [budget, setBudget] = useState(30),
    [uses, setUses] = useState(1),
    [setup, setSetup] = useState(20),
    [ownCost, setOwnCost] = useState(2);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [result, setResult] = useState<{
    artifact_content: string;
    sha256: string;
    report: { summary: string; decision: string };
  } | null>(null);
  const request = useRef("");
  useEffect(() => {
    if (!company && workspace.companies[0]) setCompany(workspace.companies[0].id);
  }, [workspace.companies, company]);
  const selected = workspace.companies.find((c) => c.id === company);
  const comparison = compareEconomics(
    {
      uses: Math.max(1, uses || 1),
      setupCredits: Math.max(0, setup || 0),
      ownRunCredits: Math.max(0, ownCost || 0),
      setupMinutes: 15,
      ownRunMinutes: 1,
      hasOwnAgent: Boolean(selected),
    },
    workspace.offers.filter((o) => o.companyId !== company && o.price <= budget),
  );
  async function perform(kind: "execute" | "hire") {
    if (!signedIn) {
      onLogin();
      return;
    }
    if (!company) {
      onCreate();
      return;
    }
    setBusy(kind);
    setError("");
    try {
      const rows = parseCatalogueCsv(csv);
      if (!request.current) request.current = crypto.randomUUID();
      if (kind === "execute") {
        const r = await executePrivateService({
          data: { companyId: company, requestId: request.current, rows },
        });
        setResult(r);
        await onRefresh();
      } else {
        const o = await placeStudioOrder({
          data: {
            buyerCompanyId: company,
            title: goal,
            budget,
            rows,
            requestId: request.current,
            testFailure: false,
            autoCorrect: true,
            humanReview: true,
          },
        });
        const complete = await executeStudioOrder({ data: { orderId: o.orderId } });
        onOrder(complete);
        await onRefresh();
      }
      request.current = "";
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível concluir. Consulte o histórico antes de repetir.",
      );
    } finally {
      setBusy("");
    }
  }
  async function commercialize() {
    setBusy("commercial");
    setError("");
    try {
      await setCompanyCommercial({ data: { companyId: company, enabled: true } });
      await onRefresh();
      setResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível publicar a oferta.");
    } finally {
      setBusy("");
    }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.artifact_content], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalogo-privado.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="studio-page">
      <div className="studio-page-title">
        <span className="studio-eyebrow">SEU AGENTE PESSOAL</span>
        <h1>O que você quer resolver?</h1>
        <p>
          Informe a meta e compare as opções. O serviço disponível organiza catálogos de produtos e
          confere cada preço.
        </p>
      </div>
      <div className="studio-market-layout">
        <section className="studio-order-form">
          <label>
            Sua empresa
            <select
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                request.current = "";
                setResult(null);
              }}
            >
              <option value="">Criar uma empresa</option>
              {workspace.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Meta
            <input
              value={goal}
              maxLength={120}
              onChange={(e) => {
                setGoal(e.target.value);
                request.current = "";
              }}
            />
          </label>
          <label>
            Catálogo de origem
            <textarea
              className="studio-code-input"
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                request.current = "";
                setResult(null);
              }}
            />
          </label>
          <label>
            Orçamento por contratação
            <input
              type="number"
              min={1}
              max={10000}
              value={budget}
              onChange={(e) => {
                setBudget(Math.min(10000, Math.max(1, Number(e.target.value))));
                request.current = "";
              }}
            />
          </label>
          <details>
            <summary>Premissas da comparação</summary>
            <p className="studio-help">
              Estimativas editáveis em créditos simulados. Ajuste para o seu caso. Uma comparação
              não movimenta o saldo.
            </p>
            <label>
              Usos previstos
              <input
                type="number"
                min={1}
                max={10000}
                value={uses}
                onChange={(e) => setUses(Math.min(10000, Math.max(1, Number(e.target.value))))}
              />
            </label>
            <label>
              Preparar e testar um especialista
              <input
                type="number"
                min={0}
                max={100000}
                value={setup}
                onChange={(e) => setSetup(Math.min(100000, Math.max(0, Number(e.target.value))))}
              />
            </label>
            <label>
              Executar com meu especialista, por uso
              <input
                type="number"
                min={0}
                max={10000}
                value={ownCost}
                onChange={(e) => setOwnCost(Math.min(10000, Math.max(0, Number(e.target.value))))}
              />
            </label>
          </details>
        </section>
        <section className="studio-provider-list">
          <h2>Como cumprir sua meta</h2>
          <article className="studio-provider-card">
            <h3>{selected ? "Usar meu agente" : "Criar um especialista"}</h3>
            <strong>
              {comparison.ownTotal} créditos estimados em {uses} uso(s)
            </strong>
            <p>
              {selected
                ? "Sua empresa já tem um executor de catálogo. A execução permanece privada e não transfere créditos para outra empresa."
                : "Crie uma empresa privada com um executor de catálogo e teste antes de oferecer o serviço."}
            </p>
            <p className="studio-help">
              Estimativa de tempo: {comparison.ownMinutes} minutos. O tempo real será registrado.
            </p>
            <button
              className="studio-secondary"
              disabled={!!busy}
              onClick={() => (selected ? void perform("execute") : onCreate())}
            >
              {selected ? "Executar em privado" : "Criar meu especialista"}
            </button>
          </article>
          <article className="studio-provider-card">
            <h3>Contratar na rede</h3>
            <strong>
              {comparison.hireTotal === null
                ? "Sem oferta neste orçamento"
                : `A partir de ${comparison.hireTotal} créditos em ${uses} uso(s)`}
            </strong>
            <p>
              O gerente compara os fornecedores, reserva o valor de uma contratação e acompanha a
              entrega. O pagamento aguarda sua aprovação.
            </p>
            <p className="studio-help">
              Prazo máximo da oferta de menor preço:{" "}
              {comparison.supplierDeadlineMinutes ?? "indisponível"} minutos.
            </p>
            <button
              className="studio-primary"
              disabled={!!busy || comparison.hireTotal === null}
              onClick={() => void perform("hire")}
            >
              {busy === "hire" ? "Seu agente está trabalhando…" : "Delegar uma contratação"}
            </button>
          </article>
          <p className="studio-help">
            Pelas premissas, o menor custo é{" "}
            {comparison.recommended === "hire"
              ? "contratar"
              : comparison.recommended === "execute"
                ? "usar seu agente"
                : "criar"}
            . {comparison.basis}
          </p>
          {selected && (
            <p className="studio-help">
              O custo de preparar o especialista já existente não é cobrado de novo. Na execução
              interna atual, o programa de catálogo não usa tokens de IA.
            </p>
          )}
        </section>
      </div>
      {busy && <p role="status">Aguardando o servidor…</p>}
      {error && (
        <p role="alert" className="studio-error">
          {error}
        </p>
      )}
      {result && (
        <section className="studio-section-card">
          <h2>Execução privada concluída</h2>
          <p>{result.report.summary}</p>
          <code className="studio-file-hash">SHA-256 {result.sha256}</code>
          <button className="studio-secondary" onClick={download}>
            Baixar catálogo
          </button>
          {selected?.visibility === "private" && result.report.decision === "approved" && (
            <>
              <h3>Sua capacidade pode virar um serviço</h3>
              <p>
                Ela passou nos mesmos testes exigidos no marketplace. Ao publicar, outras empresas
                verão a oferta e poderão contratar. As entradas e os resultados dos seus trabalhos
                privados continuam visíveis apenas para você.
              </p>
              <p className="studio-help">
                Essa sugestão demonstra que a capacidade funciona. Ainda será preciso conseguir
                compradores.
              </p>
              <button
                className="studio-primary"
                disabled={!!busy}
                onClick={() => void commercialize()}
              >
                Autorizar oferta no marketplace
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
