# Demo: um agente compra testes de navegador

## O que executar

Abra `/studio?view=advisor`. O pedido é testar o formulário de `/qa-fixture` em desktop e mobile. O comprador do exemplo não dispõe de navegador. O assessor compara a oferta de captura desktop de 5 créditos com o serviço completo de 15, descartando a primeira por cobertura insuficiente.

O serviço executa Chromium, preenche o formulário local sem transmitir dados e captura cada tamanho. O servidor confere a identidade da execução, as dimensões, o hash e a presença das duas evidências. Um defeito encontrado na página é um resultado válido do teste. O contrato compra cobertura de QA, não ausência de defeitos.

O modo de demonstração omite mobile na primeira entrega. Isso está explícito na tela. A auditoria reprova; o usuário ou agente pede a correção; o executor realiza os testes novamente. O humano confere a versão aprovada e libera 15 créditos simulados: 14 para o fornecedor e 1 para a plataforma. Repetir o aceite não duplica o pagamento.

## Ativação

1. Aplicar `drizzle/migrations/0013_browser_qa.sql` no mesmo banco Lovable.
2. Publicar o código. Entrar na tela da demo com a conta do apresentador.
3. Em “Preparar demonstração”, baixar a configuração do executor. A chave vale por 24 horas, só é armazenada como hash no servidor e só permite testar pedidos dessa conta.
4. No computador com Chrome e este repositório: `npm run browser:worker -- --config ~/Downloads/neuramarket-worker.json`.
5. A tela deve mostrar “Executor conectado”. Contratar o teste.

Para executar a compra por um cliente MCP e parar no aceite humano: `npm run demo:mcp -- --config ~/Downloads/neuramarket-mcp.json`. O script cota, contrata, confirma o bloqueio da primeira entrega, pede a correção e confere a segunda versão. Ele não aceita nem paga pelo usuário.

Para conferir depois o estado de um pedido sem alterá-lo: `npm run demo:mcp -- --config ~/Downloads/neuramarket-mcp.json --order ID_DO_PEDIDO`. A saída informa o estado, as versões, as decisões da auditoria e a quantidade de aceites humanos.

Para salvar as capturas de uma entrega baixada: `node scripts/extract-browser-evidence.mjs ~/Downloads/entrega-v2.json /private/tmp/neuramarket-evidence`. O extrator confere os hashes antes de gravar os PNGs.

A máquina precisa permanecer ligada. Esta versão só acessa a página de teste do próprio app. Não executa código fornecido por clientes nem aceita URLs arbitrárias. A confiança na origem das capturas depende do executor autorizado; o hash comprova integridade, não prova sozinho que um navegador foi executado.

## MCP

O adaptador existente ganhou `quote_browser_test`, `buy_browser_test` e `retry_browser_test`. Usa a mesma contratação e contabilidade da interface. `get_order` retorna entregas, verificações e hashes; `download_and_verify_delivery` verifica o arquivo. `run_order` não tenta executar QA no servidor sem navegador. O trabalho é consumido pelo executor conectado.

Prompt do comprador: “Consulte o preço de testar o formulário da página de demonstração em desktop e mobile. Meu teto é 20 créditos simulados. Contrate com um novo requestId e testFailure=true. Se a entrega for reprovada, solicite a correção. Mostre as evidências e peça meu aceite na NeuraMarket.”

A configuração MCP pode ser baixada na tela. Ajustar o caminho absoluto do script. Não compartilhar nem versionar as configurações com credenciais. O aceite humano não tem ferramenta MCP.

## Pitch de três minutos

- 0:00–0:25: “Quando um agente precisa de uma ferramenta que não possui, como decide de quem comprar? A NeuraMarket compara as ofertas e condiciona o pagamento à entrega.”
- 0:25–0:55: pedido pelo MCP, teto de 20, oferta de 5 descartada, contratação de 15.
- 0:55–1:35: navegador real e captura desktop. Falta mobile; pagamento bloqueado. Explicar que a omissão foi ativada para demonstrar a proteção.
- 1:35–2:20: correção, evidência mobile, aceite e distribuição 14 + 1.
- 2:20–3:00: mostrar o resultado aproveitável por outro agente e a tese da infraestrutura. Cobrança por transação concluída é a hipótese comercial; créditos e receita desta demo são simulados.

## Os cinco desafios

1. Negócio autônomo: o fornecedor recebe o contrato e executa QA sem operar manualmente o navegador; o aceite humano limita a autonomia financeira.
2. Marketplace: duas ofertas com capacidades e preços diferentes, contratação estruturada.
3. Economia: teto, reserva, distribuição e proteção contra pagamento duplicado.
4. Produto para agentes: descoberta, contratação, correção e entrega via MCP/API.
5. Confiança: critérios anteriores à execução, evidências versionadas, reprovação, correção e aceite da versão atual.

## Validação

`npm test`, `npm run test:a2a`, `npx tsc --noEmit`, `npm run build`.

Com o servidor local aberto: `node --experimental-strip-types tests/browser-worker.integration.mjs`. Executa o Chrome de verdade, prova reprovação sem mobile e aprovação da entrega completa, e salva as capturas em `/private/tmp/neuramarket-browser-evidence/`. Testes financeiros usam PostgreSQL temporário, sem tocar no banco remoto.
