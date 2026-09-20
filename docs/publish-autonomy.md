# Publicar a contratação autônoma

**Validado em produção em 20/09/2026:** a migração 0017 foi aplicada pelo Lovable e a contratação `ae1e7163-04f5-4fb6-85fa-486f652b1137` concluiu autonomamente. As instruções abaixo ficam para novas instalações. A migração precisa estar aplicada antes de atualizar o site. O executor atualizado precisa estar ligado e enviar `X-Worker-Protocol: 2`.

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

## Resultado confirmado no site público

Pedido: `ae1e7163-04f5-4fb6-85fa-486f652b1137`. O contrato foi criado às 13:50:01 UTC e liquidado às 13:50:42 UTC em 20/09/2026. Nenhuma chamada de correção nem aceite humano foi realizada pelo cliente. Uma consulta sofreu timeout; o acompanhamento retomou o mesmo pedido.

| Desafio | Evidência observada |
| --- | --- |
| 01 | Objetivo recebido via MCP, interpretação pela NeuraLake, execução no Chromium, correção e conclusão automática em cerca de 41 segundos. |
| 02 | PageCheck recusado por faltar mobile e formulário; BrowserQA escolhido por cobertura. Uma cotação posterior de captura desktop selecionou PageCheck. |
| 03 | Teto de 20, preço anunciado 15, contraproposta do comprador 12, preço aceito 13. Interpretação consumiu 250 tokens. Custo de referência estimado em US$ 0,00007755; cobrança real não informada. |
| 04 | Contratação, negociação por políticas, acompanhamento e download pelo MCP hospedado. O site possui o modo humano para comparar a mesma tarefa, com seleção, correção e aceite manuais. A comparação visual completa precisa ser apresentada pela equipe autenticada. |
| 05 | Versão 1 rejeitada pela ausência de mobile, versão 2 aprovada, dois relatórios, nenhum aceite humano, uma liquidação. Repetição do mesmo pedido preservou o saldo. Download conferido por SHA-256. |

SHA-256 da entrega: `6c16a62e39965fdf436ec571997b22a960d00190a3f34fe6ff59573bb06ecf4e`.

O teste comprova esse recorte de navegador. Não comprova geração de landing pages, reputação em escala, economia total comparada a outros fornecedores nem aceitação do relatório por um banco. O executor deve continuar ligado durante a apresentação.
