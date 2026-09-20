import { useState } from "react";
import { Download, Code2, Monitor, Smartphone } from "lucide-react";
import { agentResultSchema, type AgentResult } from "@/lib/agent-definition";
import { browserEvidenceSchema } from "@/lib/browser-qa";

export function downloadAgentFile(content: string, filename: string, mediaType = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type: mediaType + ";charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function AgentOutput({ value }: { value: AgentResult | string }) {
  const [source, setSource] = useState(false);
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return <pre className="agent-text">{value}</pre>;
    }
  }
  const browserEvidence = browserEvidenceSchema.safeParse(parsed);
  if (browserEvidence.success) {
    return (
      <div className="browser-evidence-output">
        {browserEvidence.data.samples.map((sample) => (
          <article key={sample.viewport}>
            <h3>
              {sample.viewport === "desktop" ? <Monitor size={17} /> : <Smartphone size={17} />}
              {sample.viewport === "desktop" ? "Computador" : "Celular"}
            </h3>
            <img
              src={`data:image/png;base64,${sample.screenshot}`}
              alt={`Captura do teste em ${sample.viewport}`}
            />
            <p>{sample.finding}</p>
            <small>
              {(sample.durationMs / 1000).toFixed(1)}s · SHA-256 {sample.sha256.slice(0, 12)}…
            </small>
          </article>
        ))}
      </div>
    );
  }
  const checked = agentResultSchema.safeParse(parsed);
  if (!checked.success)
    return <p>A entrega não tem um formato reconhecido. Baixe o arquivo para conferir.</p>;
  const result = checked.data;
  return (
    <div className="agent-output">
      <h2>{result.title}</h2>
      {result.sections.map((s) => (
        <section key={s.heading}>
          <h3>{s.heading}</h3>
          <div className="agent-text">{s.content}</div>
        </section>
      ))}
      {result.artifacts.map((a) => (
        <section className="agent-file" key={a.name}>
          <header>
            <strong>{a.name}</strong>
            <div>
              {a.mediaType === "text/html" && (
                <button className="studio-secondary" onClick={() => setSource(!source)}>
                  {source ? <Monitor size={15} /> : <Code2 size={15} />}
                  {source ? "Prévia" : "Código"}
                </button>
              )}
              <button
                className="studio-secondary"
                onClick={() => downloadAgentFile(a.content, a.name, a.mediaType)}
              >
                <Download size={15} />
                Baixar
              </button>
            </div>
          </header>
          {a.mediaType === "text/html" && !source ? (
            <iframe
              title={`Prévia de ${a.name}`}
              sandbox=""
              referrerPolicy="no-referrer"
              srcDoc={
                "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:;\">" +
                a.content
              }
            />
          ) : (
            <pre className="agent-text agent-code">{a.content}</pre>
          )}
        </section>
      ))}
    </div>
  );
}
