import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { executeBrowserJob } from "../scripts/browser-worker.mjs";
import { auditBrowserEvidence } from "../src/lib/browser-audit.server.ts";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const baseUrl = process.env.QA_TEST_ORIGIN ?? "http://127.0.0.1:3099";
  const job = { orderId: randomUUID(), token: randomUUID(), omitMobile: true };
  const incomplete = await executeBrowserJob(job, { baseUrl, browser });
  assert.equal(auditBrowserEvidence(incomplete, job.orderId, job.token).decision, "rejected");
  const complete = await executeBrowserJob({ ...job, omitMobile: false }, { baseUrl, browser });
  assert.equal(auditBrowserEvidence(complete, job.orderId, job.token).decision, "approved");
  assert.equal(complete.samples.length, 2);
  assert.ok(complete.samples.every((s) => s.outcome === "success"));
  const desktopScope = { viewports: ["desktop"], form: false };
  const desktop = await executeBrowserJob(
    { ...job, omitMobile: false, scope: desktopScope },
    { baseUrl, browser },
  );
  assert.equal(desktop.samples.length, 1);
  assert.equal(
    desktop.samples[0].submitted,
    false,
    "screenshot-only scope must not submit the form",
  );
  assert.equal(
    auditBrowserEvidence(desktop, job.orderId, job.token, desktopScope, new URL(baseUrl).origin)
      .decision,
    "approved",
  );
  assert.equal(
    auditBrowserEvidence(desktop, job.orderId, job.token, desktopScope, "https://wrong.example")
      .decision,
    "rejected",
  );
  await mkdir("/private/tmp/neuramarket-browser-evidence", { recursive: true });
  for (const s of complete.samples)
    await writeFile(
      `/private/tmp/neuramarket-browser-evidence/${s.viewport}.png`,
      Buffer.from(s.screenshot, "base64"),
    );
  await writeFile(
    "/private/tmp/neuramarket-browser-evidence/verified.json",
    JSON.stringify(complete, null, 2),
  );
  console.log(
    JSON.stringify({
      incomplete: "rejected",
      corrected: "approved",
      samples: complete.samples.map(({ viewport, durationMs, sha256 }) => ({
        viewport,
        durationMs,
        sha256,
      })),
    }),
  );
} finally {
  await browser.close();
}
