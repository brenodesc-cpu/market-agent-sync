import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReviewEvidence } from "../src/lib/review-evidence.ts";
import type { ReviewEvidenceInput } from "../src/lib/review-evidence.ts";

function fixture(): ReviewEvidenceInput {
  return {
    order: { id: "order-1", status: "verifying", current_delivery_version: 2 },
    delivery: {
      id: "delivery-2",
      order_id: "order-1",
      version: 2,
      sha256: "a".repeat(64),
      file_name: "catalogue.csv",
      test_upload: true,
    },
    contract: {
      id: "contract-1",
      order_id: "order-1",
      price_units: 20,
      acceptance_criteria: [{ criterion: "colunas", expected: ["id", "preco"] }],
    },
    report: {
      id: "report-2",
      order_id: "order-1",
      delivery_id: "delivery-2",
      delivery_version: 2,
      rules_version: "catalogue-v1",
      tool_name: "csv-validator",
      decision: "approved",
      summary: "Colunas conferidas.",
      checks: [
        {
          criterion: "colunas",
          expected: ["id", "preco"],
          observed: ["id", "preco"],
          status: "passed",
        },
      ],
    },
  };
}

test("approves only coherent current evidence, without authorizing payment", () => {
  const input = fixture();
  const before = structuredClone(input);
  const result = buildReviewEvidence(input);
  assert.equal(result.status, "approved");
  assert.equal(result.can_authorize_payment, false);
  assert.deepEqual(result.issues, []);
  assert.equal(result.delivery?.id, "delivery-2");
  assert.equal(result.delivery?.test_upload, true);
  assert.deepEqual(input, before);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("an approval from an older delivery is inconclusive", () => {
  const input = fixture();
  input.report!.delivery_version = 1;
  assert.equal(buildReviewEvidence(input).status, "inconclusive");
});

test("a delivery from a different order is inconclusive", () => {
  const input = fixture();
  input.delivery!.order_id = "other-order";
  assert.equal(buildReviewEvidence(input).status, "inconclusive");
});

test("a report for a different delivery is inconclusive even at the same version", () => {
  const input = fixture();
  input.report!.delivery_id = "other-delivery";
  assert.equal(buildReviewEvidence(input).status, "inconclusive");
});

test("a report or contract from a different order is inconclusive", () => {
  for (const key of ["report", "contract"] as const) {
    const input = fixture();
    input[key]!.order_id = "other-order";
    assert.equal(buildReviewEvidence(input).status, "inconclusive");
  }
});

test("an approved label cannot compensate for empty checks", () => {
  const input = fixture();
  input.report!.checks = [];
  assert.equal(buildReviewEvidence(input).status, "inconclusive");
});

test("a failed objective check overrides an approved report label", () => {
  const input = fixture();
  input.report!.checks = [
    { criterion: "colunas", expected: ["id", "preco"], observed: ["id"], status: "failed" },
  ];
  const result = buildReviewEvidence(input);
  assert.equal(result.status, "rejected");
  assert.equal(result.checks[0].status, "failed");
});

test("inconclusive and legacy checks cannot imply an approval", () => {
  for (const status of ["inconclusive", undefined, "pass", true]) {
    const input = fixture();
    input.report!.checks = [
      { criterion: "colunas", expected: ["id", "preco"], observed: ["id", "preco"], status },
    ];
    assert.equal(buildReviewEvidence(input).status, "inconclusive");
  }
});

test("missing persisted records leave the evidence inconclusive", () => {
  for (const key of ["order", "delivery", "contract", "report"] as const) {
    const input = fixture();
    input[key] = null;
    assert.equal(buildReviewEvidence(input).status, "inconclusive");
  }
});

test("checks must use the complete contracted criteria and expected values", () => {
  for (const checks of [
    [{ criterion: "colunas", expected: ["id"], status: "passed" }],
    [{ criterion: "outro", expected: ["id", "preco"], status: "passed" }],
    [
      { criterion: "colunas", expected: ["id", "preco"], status: "passed" },
      { criterion: "extra", expected: true, status: "passed" },
    ],
    [
      { criterion: "colunas", expected: ["id", "preco"], status: "passed" },
      { criterion: "colunas", expected: ["id", "preco"], status: "passed" },
    ],
  ]) {
    const input = fixture();
    input.report!.checks = checks;
    assert.equal(buildReviewEvidence(input).status, "inconclusive");
  }
});

test("missing, malformed or duplicate criteria are inconclusive", () => {
  for (const criteria of [
    null,
    {},
    [],
    [{ criterion: "colunas", expected: null }],
    [
      { criterion: "colunas", expected: ["id", "preco"] },
      { criterion: "colunas", expected: ["id", "preco"] },
    ],
  ]) {
    const input = fixture();
    input.contract!.acceptance_criteria = criteria;
    assert.equal(buildReviewEvidence(input).status, "inconclusive");
  }
});

test("expected JSON objects match independently of their key order", () => {
  const input = fixture();
  input.contract!.acceptance_criteria = [
    { criterion: "schema", expected: { columns: ["id", "preco"], version: 1 } },
  ];
  input.report!.checks = [
    { criterion: "schema", expected: { version: 1, columns: ["id", "preco"] }, status: "passed" },
  ];
  assert.equal(buildReviewEvidence(input).status, "approved");
});

test("an error decision cannot become approved from positive checks", () => {
  const input = fixture();
  input.report!.decision = "error";
  assert.equal(buildReviewEvidence(input).status, "inconclusive");
});

function legacyFixture(): ReviewEvidenceInput {
  const input = fixture();
  input.delivery!.file_name = "video-v2.mp4";
  input.report!.rules_version = "video-v1";
  input.contract!.acceptance_criteria = [
    { key: "container", expected: "MP4" },
    { key: "aspect", expected: "9:16" },
    { key: "resolution", expected: "mínimo 720 × 1280" },
    { key: "duration", expected: "8–10 s" },
    { key: "decode", expected: "sem erro" },
  ];
  input.report!.checks = [
    {
      criterion: "Contêiner",
      expected: "MP4",
      observed: "MP4",
      result: "pass",
      evidence: "ffprobe: format_name=mov,mp4",
    },
    {
      criterion: "Proporção",
      expected: "9:16",
      observed: "9:16",
      result: "pass",
      evidence: "720/1280",
    },
    {
      criterion: "Resolução",
      expected: "mínimo 720 × 1280",
      observed: "720 × 1280",
      result: "pass",
      evidence: "ffprobe: width=720 height=1280",
    },
    {
      criterion: "Duração",
      expected: "8–10 s",
      observed: "9,0 s",
      result: "pass",
      evidence: "ffprobe: duration=9",
    },
    {
      criterion: "Decodificação",
      expected: "sem erro",
      observed: "sem erro",
      result: "pass",
      evidence: "ffmpeg exit=0",
    },
  ];
  return input;
}

test("legacy demo v2 maps the five explicit passing results", () => {
  const result = buildReviewEvidence(legacyFixture());
  assert.equal(result.status, "approved");
  assert.equal(result.can_authorize_payment, false);
  assert.equal(result.checks.length, 5);
  assert.ok(result.checks.every((check) => check.status === "passed"));
  assert.equal(result.checks[0].evidence, "ffprobe: format_name=mov,mp4");
  assert.deepEqual(result.issues, []);
});

test("legacy demo v1 preserves the failed aspect check and blocks missing resolution", () => {
  const input = legacyFixture();
  input.order!.current_delivery_version = 1;
  input.delivery!.version = 1;
  input.report!.delivery_version = 1;
  input.report!.decision = "rejected";
  input.report!.checks = (input.report!.checks as Record<string, unknown>[])
    .filter((check) => check.criterion !== "Resolução")
    .map((check) =>
      check.criterion === "Proporção" ? { ...check, result: "fail", observed: "16:9" } : check,
    );
  const result = buildReviewEvidence(input);
  assert.equal(result.status, "inconclusive");
  assert.equal(result.checks.find((check) => check.criterion === "Proporção")?.status, "failed");
  assert.ok(result.issues.some((issue) => issue.includes("todos os critérios")));
});

test("legacy results have no default approval and cannot conflict with status", () => {
  for (const patch of [
    { result: undefined },
    { result: "unknown" },
    { result: "pass", status: "failed" },
    { result: "fail", status: "passed" },
    { result: "pass", status: "inconclusive" },
  ]) {
    const input = legacyFixture();
    Object.assign((input.report!.checks as Record<string, unknown>[])[0], patch);
    assert.equal(buildReviewEvidence(input).status, "inconclusive");
  }
  const input = legacyFixture();
  Object.assign((input.report!.checks as Record<string, unknown>[])[0], { status: "passed" });
  assert.equal(buildReviewEvidence(input).status, "approved");
});

test("unknown legacy keys block approval and repeated issues are deduplicated", () => {
  const input = legacyFixture();
  input.contract!.acceptance_criteria = [
    { key: "unknown", expected: "MP4" },
    { key: "also-unknown", expected: "9:16" },
  ];
  const result = buildReviewEvidence(input);
  assert.equal(result.status, "inconclusive");
  assert.equal(
    result.issues.filter((issue) => issue === "O contrato contém um critério inválido.").length,
    1,
  );
  assert.equal(result.issues.length, new Set(result.issues).size);
});

test("new format still requires status and rejects a conflicting legacy result", () => {
  for (const check of [
    { criterion: "colunas", expected: ["id", "preco"], result: "pass" },
    { criterion: "colunas", expected: ["id", "preco"], result: "fail", status: "passed" },
  ]) {
    const input = fixture();
    input.report!.checks = [check];
    assert.equal(buildReviewEvidence(input).status, "inconclusive");
  }
});
