# Publicar a contratação autônoma

O código está no `main`. A migração `0017_autonomous_browser_market.sql` precisa ser aplicada no banco conectado antes de atualizar o site. O executor atualizado precisa estar ligado e enviar `X-Worker-Protocol: 2`.

## Instrução para o Lovable

Aplique integralmente `drizzle/migrations/0017_autonomous_browser_market.sql` no banco conectado da NeuraMarket. Ela preserva contratos existentes e adiciona cotações privadas e liquidação automática apenas em novos contratos de créditos simulados com autorização inicial explícita. O código foi testado em PostgreSQL. Não redesenhe nem altere os fluxos antigos. Confirme a aplicação da migração e publique o código sincronizado do GitHub.

## Verificação depois da publicação

1. Conectar o MCP remoto e confirmar as 17 ferramentas.
2. Consultar o saldo e chamar `start_browser_mission` com um UUID novo em `requestId`, objetivo “Teste o formulário da página de demonstração no computador e no celular”, `budget: 20`, `testFailure: true` e `authorizeAutomaticPayment: true`.
3. Acompanhar apenas com `get_order`. Não chamar correção nem aceite. A primeira entrega deve reprovar, a correção deve ocorrer uma vez e a segunda deve liquidar automaticamente.
4. Conferir duas entregas, dois relatórios, nenhum aceite humano, 13 créditos gastos, 12 para o fornecedor e 1 para a plataforma. Repetir o pedido com o mesmo identificador deve conservar o contrato e os saldos.
5. Baixar a entrega e conferir o SHA-256. Abrir o pedido no painel para mostrar os critérios e a trilha.
6. Comparar a mesma tarefa no modo “Eu escolho os passos”. Esse contrato exige seleção e aceite humanos. Um objetivo de captura desktop deve selecionar a oferta de 4 créditos, sem preencher o formulário.

## Limites para o pitch

A demonstração executa a página controlada `lead-form-v1`. A NeuraLake interpreta o objetivo; a seleção, a contraproposta de preço, o navegador e a auditoria seguem regras explícitas. A reputação ampla e a otimização de eficiência medida permanecem futuras. Os créditos são simulados. O custo em USD é uma estimativa de referência, sem comprovação de cobrança do provedor. A auditoria depende do executor autorizado e não constitui certificação bancária.

Os testes locais cobrem a contratação, o orçamento, a correção e a liquidação única. Isso não substitui a execução completa no site publicado.

## Conferência automática pelo MCP público

`node scripts/check-autonomous-pitch.mjs --config ~/Downloads/neuramarket-mcp.json`

Sem `--run`, apenas verifica as ferramentas publicadas. Recusa a versão antiga sem gastar. Para executar a compra autorizada de até 20 créditos simulados:

`node scripts/check-autonomous-pitch.mjs --config ~/Downloads/neuramarket-mcp.json --run --state /private/tmp/neuramarket-pitch-check.json`

O arquivo de estado conserva o identificador para retomar sem outra compra. O verificador consulta o pedido por até três minutos, sem chamar correção ou aceite. Exige duas versões, reprovação antes da aprovação, pagamento único, trilha das decisões, consumo informado, download com SHA-256 e repetição sem alteração no saldo. Depois apenas cota uma captura desktop para conferir a mudança do fornecedor. A comparação visual com o modo humano permanece uma etapa da apresentação.
