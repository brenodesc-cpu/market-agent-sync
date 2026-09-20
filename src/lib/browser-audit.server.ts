import { createHash } from "node:crypto";
import { browserEvidenceSchema } from "./browser-qa.ts";
export function auditBrowserEvidence(raw: unknown, orderId: string, token: string) {
  const parsed = browserEvidenceSchema.safeParse(raw);
  const data = parsed.success ? parsed.data : null;
  const identity = data?.orderId === orderId && data?.token === token;
  const integrity = Boolean(
    identity &&
    data?.samples.length &&
    data.samples.every((s) => {
      const bytes = Buffer.from(s.screenshot, "base64");
      return (
        bytes.length > 100 &&
        bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
        bytes.readUInt32BE(16) === s.width &&
        bytes.readUInt32BE(20) === s.height &&
        createHash("sha256").update(bytes).digest("hex") === s.sha256 &&
        new URL(s.url).pathname === "/qa-fixture" &&
        !new URL(s.url).search &&
        s.submitted &&
        (s.outcome === "success" || s.finding.length >= 10)
      );
    }) &&
    new Set(data?.samples.map((s) => s.viewport)).size === data?.samples.length,
  );
  const checks = ["desktop", "mobile", "evidence_integrity"].map((criterion) => {
    const sample = data?.samples.find((s) => s.viewport === criterion);
    const pass =
      criterion === "evidence_integrity"
        ? integrity
        : Boolean(
            integrity &&
            sample &&
            sample.width === (criterion === "desktop" ? 1280 : 390) &&
            sample.height === (criterion === "desktop" ? 800 : 844),
          );
    return {
      criterion,
      expected: true,
      observed: pass,
      status: pass ? "passed" : "failed",
      evidence:
        criterion === "evidence_integrity"
          ? "Identidade da execução, PNG, dimensões e SHA-256."
          : (sample?.finding ?? `Falta a evidência ${criterion}.`),
    };
  });
  const approved = checks.every((c) => c.status === "passed");
  return {
    decision: approved ? "approved" : "rejected",
    checks,
    summary: approved
      ? "Cobertura contratada comprovada. Confira os resultados e autorize o pagamento."
      : "Cobertura incompleta ou evidência inválida. Pagamento bloqueado.",
  };
}
