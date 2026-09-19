import { useEffect, useState } from "react";
import { MessageCircle, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { explainReview } from "@/lib/review.functions";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export function ReviewAssistant({ orderId }: { orderId: string }) {
  const [signedIn, setSignedIn] = useState(false);
  const [question, setQuestion] = useState(
    "O que esta verificação comprovou e o que ainda está pendente?",
  );
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSignedIn(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      if (!session) {
        setAnswer("");
        setReference("");
      }
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);
  async function submit() {
    setBusy(true);
    setError("");
    setAnswer("");
    setReference("");
    try {
      if (!signedIn) {
        const result = await lovable.auth.signInWithOAuth("google");
        if (result.error)
          setError("Não foi possível entrar. Confira a configuração de autenticação do projeto.");
        return;
      }
      const result = await explainReview({ data: { orderId, question } });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAnswer(result.text);
      setReference(
        result.evidence.report
          ? `Relatório ${result.evidence.report.id}`
          : "Nenhum relatório disponível",
      );
    } catch {
      setError("Não foi possível consultar o agente. Confira seu acesso e tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel mt-6 p-6" aria-label="Assistente de revisão">
      <div className="flex items-center gap-2">
        <MessageCircle className="size-5 text-primary" />
        <h3 className="text-lg font-semibold">Entenda as evidências com a NeuraLake</h3>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        O agente consulta a revisão deste pedido. A conversa não altera a verificação ou o
        pagamento.
      </p>
      <label htmlFor="review-question" className="mt-5 block text-sm font-medium">
        Sua pergunta
      </label>
      <textarea
        id="review-question"
        className="mt-2 min-h-24 w-full rounded-lg border bg-background p-3 text-sm"
        maxLength={1000}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        disabled={busy}
      />
      <Button className="mt-3" disabled={busy || !question.trim()} onClick={() => void submit()}>
        {busy && <LoaderCircle className="size-4 animate-spin" />}
        {signedIn ? "Consultar agente" : "Entrar para consultar o agente"}
      </Button>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {answer && (
        <div className="mt-5 rounded-lg border bg-muted/40 p-4" aria-live="polite">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{answer}</p>
          <p className="mt-3 break-all text-xs text-muted-foreground">{reference}</p>
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Revisão por voz: integração com a Agora em preparação.
      </p>
    </section>
  );
}
