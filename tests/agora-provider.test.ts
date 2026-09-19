import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agoraConfiguration,
  encodeVoiceControl,
  decodeVoiceControl,
  startAgoraVoice,
  stopAgoraVoice,
} from "../src/lib/agora-provider.server.ts";
const config = {
  appId: "a".repeat(32),
  certificate: "b".repeat(32),
  secret: "s".repeat(32),
  voiceId: "configured-voice",
  origin: "https://market.example.com",
};
test("Agora requires configured credentials and a fixed public HTTPS callback", () => {
  assert.throws(() => agoraConfiguration({}), /Configure/);
  assert.throws(
    () =>
      agoraConfiguration({
        AGORA_APP_ID: config.appId,
        AGORA_APP_CERTIFICATE: config.certificate,
        AGORA_REVIEW_SECRET: config.secret,
        AGORA_TTS_VOICE_ID: config.voiceId,
        PUBLIC_APP_URL: "http://localhost",
        NEURALAKE_API_KEY: "test",
      }),
    /HTTPS/,
  );
});
test("voice control is signed, scoped to its user and expires", () => {
  const input = {
    userId: "owner",
    channel: "review-00000000-0000-0000-0000-000000000001",
    agentId: "agent-1",
    expiresAt: Date.now() + 10000,
  };
  const token = encodeVoiceControl(input, config.secret);
  assert.equal(decodeVoiceControl(token, "owner", config.secret).agentId, "agent-1");
  assert.throws(() => decodeVoiceControl(token, "outsider", config.secret));
  assert.throws(() => decodeVoiceControl(token + "x", "owner", config.secret));
  assert.throws(() => decodeVoiceControl(token, "owner", config.secret, input.expiresAt + 1));
});
test("join sends only a scoped review credential to custom LLM; stop authenticates its agent", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    return Response.json({ agent_id: "agent-1" });
  }) as typeof fetch;
  const session = await startAgoraVoice(
    config,
    "owner",
    "00000000-0000-0000-0000-000000000001",
    "scoped-review-token",
    fetcher,
  );
  const body = JSON.parse(calls[0].init.body as string);
  assert.equal(body.properties.llm.api_key, "scoped-review-token");
  assert.equal(body.properties.llm.vendor, "custom");
  assert.equal(body.properties.remote_rtc_uids[0], String(session.uid));
  assert.match(body.properties.llm.url, /^https:\/\/market.example.com\/api\/reviews\//);
  assert.equal(body.properties.llm.tools, undefined);
  assert.equal(JSON.stringify(session).includes(config.certificate), false);
  assert.match(session.rtcToken, /^007/);
  await stopAgoraVoice(config, "owner", session.control, fetcher);
  assert.match(calls[1].url, /agents\/agent-1\/leave$/);
  await assert.rejects(stopAgoraVoice(config, "outsider", session.control, fetcher));
  assert.equal(calls.length, 2);
});
test("failed provider request cannot be presented as a connected call", async () => {
  await assert.rejects(
    startAgoraVoice(
      config,
      "owner",
      "order",
      "scoped",
      (async () => new Response("", { status: 403 })) as typeof fetch,
    ),
    /não iniciou/,
  );
});
