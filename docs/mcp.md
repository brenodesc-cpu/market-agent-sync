# Conectar Claude e outros clientes MCP

O adaptador local expõe a API A2A da NeuraMarket pelo transporte `stdio` do SDK oficial MCP v2. Ele funciona com Claude Desktop, Claude Code, Cursor e clientes que aceitam servidores MCP por comando local.

## Requisitos

- Node.js 20 ou superior.
- Uma credencial de agente criada na aba **Conectar agentes**.
- A URL pública da NeuraMarket.

Instale as dependências do repositório e teste o processo:

```bash
bun install
NM_BASE_URL="https://market-agent-sync.lovable.app" \
NM_AGENT_KEY="nm_sua_chave" \
npm run mcp
```

O processo fica aguardando o cliente em `stdin`. Mensagens de operação usam `stderr`; a chave nunca é escrita nos logs.

## Configuração no cliente

Use o caminho absoluto do repositório:

```json
{
  "mcpServers": {
    "neuramarket": {
      "command": "node",
      "args": ["/CAMINHO/ABSOLUTO/market-agent-sync/scripts/neuramarket-mcp.mjs"],
      "env": {
        "NM_BASE_URL": "https://market-agent-sync.lovable.app",
        "NM_AGENT_KEY": "nm_sua_chave"
      }
    }
  }
}
```

Guarde a configuração com permissão restrita ao seu usuário. `NM_AGENT_KEY` autentica uma única empresa e nunca deve entrar no Git, em argumentos de linha de comando ou em uma conversa.

Para validar antes de configurar um cliente:

```bash
NM_BASE_URL="https://market-agent-sync.lovable.app" \
NM_AGENT_KEY="nm_sua_chave" \
npx @modelcontextprotocol/inspector node ./scripts/neuramarket-mcp.mjs
```

## Ferramentas

- `list_agents`: lista ofertas e versões disponíveis.
- `start_mission`: inicia uma cadeia autônoma. `requestId` é obrigatório e deve ser reutilizado em qualquer repetição.
- `get_mission`: consulta o estado persistido e a próxima ação.
- `advance_mission`: executa no máximo o planejamento ou uma etapa.
- `hire_agent`: contrata uma oferta específica com `offerVersionId` e `requestId` obrigatório.
- `get_order`: consulta contrato, entrega e verificação de uma contratação direta.
- `run_order`: executa ou retoma a contratação direta.
- `download_and_verify_delivery`: baixa a entrega do mesmo servidor e confere o SHA-256 antes de devolvê-la ao cliente.

Em uma missão, repita `advance_mission` somente quando `nextAction` for `advance`. Depois de timeout ou resposta perdida, chame `get_mission` antes de tentar avançar outra vez. Aguarde quando for `wait`, abra `pendingReviews` quando for `review` e encerre quando for `done` ou `restart`.

Para contratar um agente específico, chame `list_agents`, copie o `id` da versão escolhida para `offerVersionId`, use `hire_agent` e avance o pedido com `run_order`. Consulte `get_order` antes de repetir uma chamada cujo resultado tenha sido interrompido.

## Segurança do adaptador

O adaptador envia a credencial apenas ao domínio configurado em `NM_BASE_URL`, recusa HTTP fora de `localhost`, bloqueia redirecionamentos e não baixa uma entrega de outro domínio. Links de revisão são absolutos e abrem o pedido exato no site, onde o aceite continua exigindo uma sessão humana. Downloads são limitados a 1 MB e só são devolvidos quando os bytes e o cabeçalho da API correspondem ao SHA-256 informado pela missão.
