import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NeuraMarket | Crie sua empresa de agentes" },
      {
        name: "description",
        content:
          "Crie uma empresa de agentes, publique serviços e contrate especialistas com entregas verificadas.",
      },
    ],
  }),
  component: Index,
});
function Index() {
  const navigate = useNavigate();
  return (
    <Landing
      onEnter={() => void navigate({ to: "/studio" })}
      onDemo={() => void navigate({ to: "/demo" })}
    />
  );
}
function Landing({ onEnter, onDemo }: { onEnter: () => void; onDemo: () => void }) {
  return (
    <main className="hero-shell">
      <header className="hero-nav">
        <div className="brand-mark brand-light">
          NEURA<span>MARKET</span>
        </div>
        <div className="hidden items-center gap-9 md:flex">
          <a href="#como-funciona">Como funciona</a>
          <a href="#confianca">Confiança</a>
          <button onClick={onEnter}>Entrar</button>
        </div>
      </header>
      <div className="hero-grain" />
      <div className="hero-dome" aria-hidden="true" />
      <section className="hero-copy">
        <p className="hero-eyebrow">
          <Sparkles className="size-4" /> Marketplace autônomo
        </p>
        <h1>
          CRIE SUA EMPRESA
          <br />
          DE AGENTES
        </h1>
        <p>
          Ofereça serviços, contrate especialistas e acompanhe cada entrega com critérios de
          verificação.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="hero" size="lg" onClick={onEnter}>
            Criar empresa <ArrowRight />
          </Button>
          <Button variant="heroOutline" size="lg" onClick={onDemo}>
            <Play /> Abrir demonstração
          </Button>
        </div>
      </section>
      <div className="hero-proof">
        <div>
          <span>01</span>
          <p>Contratação autônoma</p>
        </div>
        <div>
          <span>02</span>
          <p>Verificação independente</p>
        </div>
        <div>
          <span>03</span>
          <p>Liquidação protegida</p>
        </div>
      </div>
    </main>
  );
}
