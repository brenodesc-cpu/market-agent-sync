// Verificação ao vivo da Agora: confirma credenciais, Conversational AI habilitado e latência do join.
// Uso: npm run check:agora   (lê o .env da raiz do projeto)
// Nenhuma credencial é gravada em disco. Nada é persistido no banco.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import AgoraToken from "agora-token";

const { RtcTokenBuilder, RtcRole } = AgoraToken;

const fail = (message) => {
  console.error(`\n  FALHOU: ${message}\n`);
  process.exit(1);
};

// Carrega o .env da raiz sem sobrescrever o que já veio do ambiente.
const env = { ...process.env };
try {
  const file = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of file.split(/\r?\n/)) {
    if (line.trimStart().startsWith("#")) continue;
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    const quote = value[0];
    if (value.length > 1 && (quote === '"' || quote === "'") && value.at(-1) === quote)
      value = value.slice(1, -1);
    env[match[1]] = value;
  }
} catch (error) {
  if (error.code !== "ENOENT") fail(`Não consegui ler o .env: ${error.message}`);
  console.log("  Nenhum .env encontrado; usando apenas as variáveis do ambiente.");
}

const appId = env.AGORA_APP_ID;
const certificate = env.AGORA_APP_CERTIFICATE;

if (!appId || !certificate)
  fail("Defina AGORA_APP_ID e AGORA_APP_CERTIFICATE no .env ou no ambiente.");
if (!/^[a-f0-9]{32}$/i.test(appId) || !/^[a-f0-9]{32}$/i.test(certificate))
  fail("App ID e App Certificate devem ter 32 caracteres hexadecimais.");

// A conectividade precisa só do par acima. As demais variáveis são exigidas por
// agoraConfiguration() para a sessão de voz real da tela de Verificação.
const appMissing = [
  ["AGORA_REVIEW_SECRET", "ao menos 32 caracteres aleatórios: openssl rand -hex 32"],
  ["AGORA_TTS_VOICE_ID", "ID de uma voz MiniMax do projeto, de preferência pt-BR"],
  ["PUBLIC_APP_URL", "origem HTTPS pública do app, sem caminho"],
  ["NEURALAKE_API_KEY", "chave de inferência da NeuraLake"],
].filter(([key]) => !env[key]);

if (env.AGORA_REVIEW_SECRET && env.AGORA_REVIEW_SECRET.length < 32)
  fail("AGORA_REVIEW_SECRET precisa ter ao menos 32 caracteres.");
if (env.PUBLIC_APP_URL) {
  try {
    const origin = new URL(env.PUBLIC_APP_URL);
    if (origin.protocol !== "https:" || origin.pathname !== "/")
      fail("PUBLIC_APP_URL deve ser uma origem HTTPS sem caminho, como https://exemplo.app");
  } catch {
    fail(`PUBLIC_APP_URL não é uma URL válida: ${env.PUBLIC_APP_URL}`);
  }
}

if (!env.AGORA_TTS_VOICE_ID)
  fail(
    "A API Conversational AI exige um bloco tts. Defina AGORA_TTS_VOICE_ID no .env com o ID de uma voz MiniMax do seu projeto (Console da Agora, secao Conversational AI).",
  );

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
    tts: {
      credential_mode: "managed",
      vendor: "minimax",
      params: {
        url: "wss://api.minimax.io/ws/v1/t2a_v2",
        model: "speech-2.6-turbo",
        voice_setting: { voice_id: env.AGORA_TTS_VOICE_ID },
      },
    },
  },
};

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
  if (/addon not found/i.test(text))
    fail(
      "O projeto respondeu, mas um dos modelos gerenciados nao esta habilitado (Deepgram para ASR, MiniMax para TTS). Habilite-os no Console da Agora, em Conversational AI.",
    );
  fail("A Agora recusou o inicio da sessao.");
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
  Esta execução NÃO prova latência de áudio nem a voz MiniMax. A Agora aceita
  qualquer AGORA_TTS_VOICE_ID no join e só repassa o valor ao MiniMax na hora de
  falar: um ID inexistente passa por aqui e falha em silêncio na sessão real.
  Só uma sessão com microfone pela tela de Verificação confirma a voz.
`);

if (appMissing.length) {
  console.log("  Ainda falta para a sessão de voz real funcionar:");
  for (const [key, hint] of appMissing) console.log(`    - ${key}: ${hint}`);
  console.log("");
} else {
  console.log("  Todas as variáveis exigidas por agoraConfiguration() estão presentes.\n");
}
