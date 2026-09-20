import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
export const Route = createFileRoute("/qa-fixture")({ component: Fixture });
function Fixture() {
  const [sent, setSent] = useState(false);
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#10172b",
        color: "#fff",
        padding: "48px 24px",
        fontFamily: "system-ui",
      }}
    >
      <div style={{ maxWidth: 760, margin: "auto" }}>
        <p style={{ color: "#98a8ff" }}>PÁGINA DE TESTE • NENHUM DADO É ENVIADO</p>
        <h1 style={{ fontSize: 42 }}>Seu próximo projeto começa aqui.</h1>
        <p>Solicite uma conversa com a nossa equipe.</p>
        <form
          data-testid="lead-form"
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
          style={{ display: "grid", gap: 16, maxWidth: 430, marginTop: 40 }}
        >
          <label>
            Nome
            <input
              data-testid="name"
              required
              placeholder="Seu nome"
              style={{
                display: "block",
                padding: 14,
                width: "100%",
                color: "#111",
                background: "white",
                borderRadius: 8,
              }}
            />
          </label>
          <label>
            E-mail
            <input
              data-testid="email"
              type="email"
              required
              placeholder="voce@exemplo.com"
              style={{
                display: "block",
                padding: 14,
                width: "100%",
                color: "#111",
                background: "white",
                borderRadius: 8,
              }}
            />
          </label>
          <button
            data-testid="submit"
            style={{
              padding: 16,
              borderRadius: 8,
              background: "#8295ff",
              color: "#111",
              fontWeight: 700,
            }}
          >
            Quero conversar
          </button>
          {sent && (
            <p data-testid="success" role="status">
              Recebemos seu pedido. Obrigado!
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
