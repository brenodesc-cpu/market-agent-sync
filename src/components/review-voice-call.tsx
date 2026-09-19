import { useEffect, useRef, useState } from "react";
import { Mic, PhoneOff, LoaderCircle } from "lucide-react";
import type { IAgoraRTCClient, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import { startReviewCall, stopReviewCall } from "@/lib/agora.functions";

export function ReviewVoiceCall({ orderId, signedIn }: { orderId: string; signedIn: boolean }) {
  const [state, setState] = useState<"idle" | "connecting" | "connected">("idle"),
    [error, setError] = useState("");
  const client = useRef<IAgoraRTCClient | null>(null),
    microphone = useRef<IMicrophoneAudioTrack | null>(null);
  const control = useRef(""),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    generation = useRef(0);
  async function stop() {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    microphone.current?.stop();
    microphone.current?.close();
    microphone.current = null;
    const active = client.current;
    client.current = null;
    active?.removeAllListeners();
    if (active) await active.leave().catch(() => {});
    const token = control.current;
    control.current = "";
    setState("idle");
    if (token) await stopReviewCall({ data: { control: token } }).catch(() => {});
  }
  useEffect(() => {
    return () => {
      void stop();
    };
  }, [orderId]);
  useEffect(() => {
    if (!signedIn) void stop();
  }, [signedIn]);
  async function start() {
    setState("connecting");
    setError("");
    const current = ++generation.current;
    try {
      const { default: AgoraRTC } = await import("agora-rtc-sdk-ng");
      AgoraRTC.setLogLevel(4);
      const track = await AgoraRTC.createMicrophoneAudioTrack();
      if (current !== generation.current) {
        track.close();
        return;
      }
      microphone.current = track;
      const session = await startReviewCall({ data: { orderId } });
      if (current !== generation.current) {
        track.close();
        await stopReviewCall({ data: { control: session.control } });
        return;
      }
      control.current = session.control;
      const rtc = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      client.current = rtc;
      rtc.on("user-published", async (remote, media) => {
        if (media === "audio") {
          await rtc.subscribe(remote, media);
          remote.audioTrack?.play();
        }
      });
      rtc.on("token-privilege-did-expire", () => {
        void stop();
      });
      await rtc.join(session.appId, session.channel, session.rtcToken, session.uid);
      if (current !== generation.current) {
        await rtc.leave();
        return;
      }
      await rtc.publish(track);
      setState("connected");
      timer.current = setTimeout(
        () => {
          void stop();
        },
        Math.max(1000, session.expiresAt - Date.now()),
      );
    } catch (e) {
      await stop();
      setError(
        e instanceof Error && e.message.length < 350
          ? e.message
          : "Não foi possível conectar o áudio. Confira a permissão do microfone e a configuração da Agora.",
      );
    }
  }
  return (
    <div className="mt-5 border-t pt-4">
      <button
        className="studio-secondary"
        disabled={!signedIn || state === "connecting"}
        onClick={() => void (state === "connected" ? stop() : start())}
      >
        {state === "connecting" ? (
          <LoaderCircle size={16} className="animate-spin" />
        ) : state === "connected" ? (
          <PhoneOff size={16} />
        ) : (
          <Mic size={16} />
        )}
        {state === "connected"
          ? "Encerrar conversa"
          : state === "connecting"
            ? "Conectando áudio..."
            : "Conversar por voz com a Agora"}
      </button>
      <p className="mt-2 text-xs text-muted-foreground">
        {state === "connected"
          ? "Microfone ativo. Sessão de consulta limitada a 4 minutos e meio."
          : "Ao iniciar, seu áudio será enviado à Agora para conversar sobre esta revisão."}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
