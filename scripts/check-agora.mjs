// Verificação ao vivo da Agora: confirma credenciais, Conversational AI habilitado e latência do join.
// Uso: AGORA_APP_ID=... AGORA_APP_CERTIFICATE=... node scripts/check-agora.mjs
// Nenhuma credencial é gravada em disco. Nada é persistido no banco.
import { randomUUID } from "node:crypto";
import AgoraToken from "agora-token";

const { RtcTokenBuilder, RtcRole } = AgoraToken;
const env = process.env;
const appId = env.AGORA_APP_ID;
const certificate = env.AGORA_APP_CERTIFICATE;

const fail = (message) => {
  console.error(`\n  FALHOU: ${message}\n`);
  process.exit(1);
};

if (!appId || !certificate)
  fail("Defina AGORA_APP_ID e AGORA_APP_CERTIFICATE no ambiente desta execução.");
if (!/^[a-f0-9]{32}$/i.test(appId) || !/^[a-f0-9]{32}$/i.test(certificate))
  fail("App ID e App Certificate devem ter 32 caracteres hexadecimais.");

const agentUid = "1001";
const userUid = 1002;
const channel = `review-${randomUUID()}`;
const token = RtcTokenBuilder.buildTokenWithRtm(
  appId,
  certificate,
  channel,
  agentUid,
  RtcRole.PUBLISHER,
  600,
  600,
);

console.log(`\n  App ID       ${appId.slice(0, 6)}…${appId.slice(-4)}`);
console.log(`  Canal        ${channel}`);
console.log(`  Token RTC+RTM gerado (${token.length} caracteres).`);

// Configuração mínima: sem LLM próprio, só ASR e TTS gerenciados.
// Confirma projeto, certificado, Conversational AI e disponibilidade dos modelos gerenciados.
const body = {
  name: channel,
  properties: {
    channel,
    token,
    agent_rtc_uid: agentUid,
    remote_rtc_uids: [String(userUid)],
    enable_string_uid: false,
    idle_timeout: 30,
    asr: {
      credential_mode: "managed",
      vendor: "deepgram",
      params: { url: "wss://api.deepgram.com/v1/listen", model: "nova-3", language: "pt-BR" },
    },
    llm: {
      vendor: "custom",
      style: "openai",
      url: "https://example.invalid/v1/chat/completions",
      api_key: "verificacao-de-conectividade",
      system_messages: [{ role: "system", content: "Verificação de conectividade." }],
      greeting_message: "Verificação de conectividade.",
      failure_message: "Verificação de conectividade.",
      max_history: 1,
      params: { model: "text" },
    },
    tts: env.AGORA_TTS_VOICE_ID
      ? {
          credential_mode: "managed",
          vendor: "minimax",
          params: {
            url: "wss://api.minimax.io/ws/v1/t2a_v2",
            model: "speech-2.6-turbo",
            voice_setting: { voice_id: env.AGORA_TTS_VOICE_ID },
          },
        }
      : undefined,
  },
};

if (!env.AGORA_TTS_VOICE_ID)
  console.log("  AGORA_TTS_VOICE_ID ausente: a voz MiniMax não será exercitada nesta execução.");

const authorization = `agora token=${token}`;
const base = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}`;

const started = Date.now();
let response;
try {
  response = await fetch(`${base}/join`, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify(body),
  });
} catch (error) {
  fail(`A requisição não chegou à Agora: ${error.message}`);
}
const joinMs = Date.now() - started;
const text = await response.text();

if (!response.ok) {
  console.error(`\n  join → HTTP ${response.status} em ${joinMs} ms`);
  console.error(`  Resposta: ${text.slice(0, 600)}`);
  if (response.status === 401 || response.status === 403)
    fail("Credenciais recusadas. Confira o App Certificate e se ele está habilitado no projeto.");
  if (response.status === 404)
    fail("Projeto não encontrado nesta API. Habilite Conversational AI para este App ID.");
  fail("A Agora recusou o início da sessão.");
}

let data;
try {
  data = JSON.parse(text);
} catch {
  fail(`A Agora respondeu algo que não é JSON: ${text.slice(0, 300)}`);
}
const agentId = data.agent_id;
if (typeof agentId !== "string" || !/^[\w-]{1,128}$/.test(agentId))
  fail(`A Agora não devolveu um agent_id válido: ${text.slice(0, 300)}`);

console.log(`\n  join   OK  ${joinMs} ms  agent_id=${agentId}`);

const stopStarted = Date.now();
const stop = await fetch(`${base}/agents/${encodeURIComponent(agentId)}/leave`, {
  method: "POST",
  headers: { Authorization: authorization },
  signal: AbortSignal.timeout(10000),
});
const stopMs = Date.now() - stopStarted;

if (!stop.ok && stop.status !== 404) {
  console.error(`  leave  HTTP ${stop.status}: ${(await stop.text()).slice(0, 300)}`);
  fail(`O agente ${agentId} não foi encerrado. Encerre-o pelo console para não acumular uso.`);
}
console.log(`  leave  OK  ${stopMs} ms`);

console.log(`
  Confirmado: projeto, certificado e Conversational AI respondem.
  Esta execução NÃO prova latência de áudio nem a voz MiniMax — isso exige
  uma sessão real com microfone pela tela de Verificação.
`);
