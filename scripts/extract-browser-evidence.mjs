#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output)
  throw new Error("Use: node scripts/extract-browser-evidence.mjs arquivo.json pasta");

const evidence = JSON.parse(await readFile(resolve(input), "utf8"));
if (!Array.isArray(evidence.samples) || evidence.samples.length === 0) {
  throw new Error("A entrega não contém capturas.");
}

await mkdir(resolve(output), { recursive: true });
for (const sample of evidence.samples) {
  if (!["desktop", "mobile"].includes(sample.viewport)) throw new Error("Viewport inválido.");
  const bytes = Buffer.from(sample.screenshot, "base64");
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== sample.sha256) throw new Error(`Hash inválido em ${sample.viewport}.`);
  await writeFile(resolve(output, `${sample.viewport}.png`), bytes, { flag: "wx" });
}

process.stdout.write(
  `${JSON.stringify({ source: basename(input), files: evidence.samples.map((sample) => `${sample.viewport}.png`) })}\n`,
);
