#!/usr/bin/env node
// Trusted demonstration executor. It never visits user-supplied URLs or sends real forms.
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
export async function executeBrowserJob(job, { baseUrl, browser }) {
  const url = new URL("/qa-fixture", baseUrl).href;
  const samples = [];
  const scope = job.scope ?? { viewports: ["desktop", "mobile"], form: true };
  for (const viewport of scope.viewports.filter(
    (v) => v !== job.omitViewport && !(job.omitMobile && v === "mobile"),
  )) {
    const width = viewport === "desktop" ? 1280 : 390,
      height = viewport === "desktop" ? 800 : 844;
    const context = await browser.newContext({
      viewport: { width, height },
      serviceWorkers: "block",
    });
    // Only this fixture and same-origin static resources; no arbitrary navigation or submissions.
    await context.route("**/*", (route) => {
      const r = route.request(),
        u = new URL(r.url());
      const allowed =
        u.origin === new URL(baseUrl).origin &&
        r.method() === "GET" &&
        (u.pathname === "/qa-fixture" ||
          ["script", "stylesheet", "image", "font"].includes(r.resourceType()));
      return allowed ? route.continue() : route.abort();
    });
    const start = Date.now();
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      if (scope.form) await page.getByTestId("name").fill("Teste NeuraMarket");
      if (scope.form) await page.getByTestId("email").fill("qa@example.invalid");
      let submitted = false,
        outcome = "bug",
        finding = "Não foi possível enviar o formulário.";
      if (!scope.form) {
        outcome = "success";
        finding = "Captura da página obtida no tamanho contratado.";
      } else
        try {
          await page.getByTestId("submit").click({ timeout: 5000 });
          submitted = true;
          await page.getByTestId("success").waitFor({ timeout: 3000 });
          outcome = "success";
          finding = "Formulário preenchido e enviado; mensagem de confirmação visível.";
        } catch {
          submitted = true;
          finding = "Tentativa de envio executada, mas a confirmação não apareceu no prazo.";
        }
      const bytes = await page.screenshot({ type: "png", fullPage: false });
      samples.push({
        viewport,
        width,
        height,
        url: page.url(),
        submitted,
        outcome,
        finding,
        durationMs: Date.now() - start,
        screenshot: bytes.toString("base64"),
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    } finally {
      await context.close();
    }
  }
  return { version: 1, orderId: job.orderId, token: job.token, samples };
}
async function main() {
  const configPath = process.argv[process.argv.indexOf("--config") + 1];
  const config = process.argv.includes("--config")
    ? JSON.parse(await readFile(configPath, "utf8"))
    : { baseUrl: process.env.NM_BASE_URL, key: process.env.NM_WORKER_KEY };
  const base = new URL(config.baseUrl);
  if (
    base.protocol !== "https:" &&
    !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))
  )
    throw Error("Use HTTPS ou localhost.");
  if (!/^nmw_[a-f0-9]{64}$/.test(config.key ?? ""))
    throw Error("Baixe a configuração na tela da demo.");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const call = async (path, body) => {
    const r = await fetch(new URL("/api/browser-worker/" + path, base), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(25000),
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        "X-Worker-Protocol": "2",
      },
      body: JSON.stringify(body ?? {}),
    });
    if (!r.ok) throw Error(`Executor: HTTP ${r.status}`);
    return r.json();
  };
  console.log("Executor conectado. Somente a página de teste será acessada. Ctrl+C encerra.");
  process.on("SIGINT", () => {
    void browser.close().finally(() => process.exit(0));
  });
  try {
    while (true) {
      try {
        const { job } = await call("next");
        if (job) {
          console.log(`Executando ${job.orderId}, versão ${job.version}`);
          await call("deliver", await executeBrowserJob(job, { baseUrl: base.href, browser }));
          console.log("Evidências enviadas para auditoria.");
        }
      } catch (error) {
        console.error(error.message);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  } finally {
    await browser.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
