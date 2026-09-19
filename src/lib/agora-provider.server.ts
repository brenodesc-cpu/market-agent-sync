import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import AgoraToken from "agora-token";
const { RtcTokenBuilder, RtcRole } = AgoraToken;

export function agoraConfiguration(env = process.env) {
  const required = [
    "AGORA_APP_ID",
    "AGORA_APP_CERTIFICATE",
    "AGORA_REVIEW_SECRET",
    "AGORA_TTS_VOICE_ID",
    "PUBLIC_APP_URL",
    "NEURALAKE_API_KEY",
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Configure nos Secrets do Lovable: ${missing.join(", ")}.`);
  const origin = new URL(env["PUBLIC_APP_URL"]!);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/")
    throw new Error("PUBLIC_APP_URL deve ser a origem HTTPS pública do aplicativo.");
  if (
    !/^[a-f0-9]{32}$/i.test(env["AGORA_APP_ID"]!) ||
    !/^[a-f0-9]{32}$/i.test(env["AGORA_APP_CERTIFICATE"]!) ||
    env["AGORA_REVIEW_SECRET"]!.length < 32
  )
    throw new Error("Confira as credenciais da Agora e o segredo de revisão.");
  return {
    appId: env["AGORA_APP_ID"]!,
    certificate: env["AGORA_APP_CERTIFICATE"]!,
    secret: env["AGORA_REVIEW_SECRET"]!,
    voiceId: env["AGORA_TTS_VOICE_ID"]!,
    origin: origin.origin,
  };
}
type Config = ReturnType<typeof agoraConfiguration>;
type Control = { userId: string; channel: string; agentId: string; expiresAt: number };
function sign(body: string, secret: string) {
  return createHmac("sha256", secret).update(`agora-control.${body}`).digest("base64url");
}
export function encodeVoiceControl(control: Control, secret: string) {
  const body = Buffer.from(JSON.stringify(control)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}
export function decodeVoiceControl(
  token: string,
  userId: string,
  secret: string,
  now = Date.now(),
): Control {
  try {
    if (token.length > 2048) throw new Error();
    const [body, signature, extra] = token.split(".");
    if (!body || !signature || extra) throw new Error();
    const expected = Buffer.from(sign(body, secret)),
      actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Control;
    if (
      data.userId !== userId ||
      !Number.isSafeInteger(data.expiresAt) ||
      data.expiresAt <= now ||
      data.expiresAt > now + 10 * 60_000 ||
      !/^[\w-]{1,128}$/.test(data.agentId) ||
      !/^review-[a-f0-9-]{36}$/.test(data.channel)
    )
      throw new Error();
    return data;
  } catch {
    throw new Error("Sessão de voz inválida ou expirada.");
  }
}
const agentUid = "1001",
  userUid = 1002;
const agentToken = (c: Config, channel: string) =>
  RtcTokenBuilder.buildTokenWithRtm(
    c.appId,
    c.certificate,
    channel,
    agentUid,
    RtcRole.PUBLISHER,
    600,
    600,
  );
export function voiceJoinBody(
  config: Config,
  orderId: string,
  reviewToken: string,
  channel: string,
  token: string,
) {
  return {
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
        credential_mode: "byok",
        vendor: "custom",
        style: "openai",
        url: `${config.origin}/api/reviews/${orderId}/chat/completions`,
        api_key: reviewToken,
        system_messages: [
          {
            role: "system",
            content:
              "Explique em português as evidências desta revisão. A sessão é somente de consulta.",
          },
        ],
        greeting_message:
          "Posso explicar o que a verificação deste pedido encontrou. O que você quer conferir?",
        failure_message: "Não consegui consultar as evidências. Confira o relatório na tela.",
        max_history: 10,
        params: { model: "text" },
      },
      tts: {
        credential_mode: "managed",
        vendor: "minimax",
        params: {
          url: "wss://api.minimax.io/ws/v1/t2a_v2",
          model: "speech-2.6-turbo",
          voice_setting: { voice_id: config.voiceId },
        },
      },
    },
  };
}
export async function startAgoraVoice(
  config: Config,
  userId: string,
  orderId: string,
  reviewToken: string,
  fetcher = fetch,
) {
  const channel = `review-${randomUUID()}`,
    token = agentToken(config, channel);
  const response = await fetcher(
    `https://api.agora.io/api/conversational-ai-agent/v2/projects/${config.appId}/join`,
    {
      method: "POST",
      headers: { Authorization: `agora token=${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify(voiceJoinBody(config, orderId, reviewToken, channel, token)),
    },
  );
  if (!response.ok)
    throw new Error(
      `A Agora não iniciou a sessão (${response.status}). Confira Conversational AI e os modelos gerenciados no projeto.`,
    );
  const data = await response.json();
  if (typeof data.agent_id !== "string" || !/^[\w-]{1,128}$/.test(data.agent_id))
    throw new Error("A Agora não devolveu uma sessão válida.");
  return {
    appId: config.appId,
    channel,
    uid: userUid,
    rtcToken: RtcTokenBuilder.buildTokenWithUid(
      config.appId,
      config.certificate,
      channel,
      userUid,
      RtcRole.PUBLISHER,
      300,
      300,
    ),
    control: encodeVoiceControl(
      { userId, channel, agentId: data.agent_id, expiresAt: Date.now() + 10 * 60_000 },
      config.secret,
    ),
    expiresAt: Date.now() + 270_000,
  };
}
export async function stopAgoraVoice(
  config: Config,
  userId: string,
  control: string,
  fetcher = fetch,
) {
  const session = decodeVoiceControl(control, userId, config.secret);
  const response = await fetcher(
    `https://api.agora.io/api/conversational-ai-agent/v2/projects/${config.appId}/agents/${encodeURIComponent(session.agentId)}/leave`,
    {
      method: "POST",
      headers: { Authorization: `agora token=${agentToken(config, session.channel)}` },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok && response.status !== 404)
    throw new Error(
      "O encerramento remoto não foi confirmado. A sessão expira após a saída do canal.",
    );
  return { stopped: true };
}
