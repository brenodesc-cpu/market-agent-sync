# Verificação e revisão com NeuraLake e Agora

## O que esta entrega permite

A aba Verificação consulta a entrega atual, confere o vínculo com o contrato e apresenta os resultados registrados. Critério reprovado, ausente ou inconclusivo impede uma apresentação de aprovação. O assistente autenticado envia essas evidências à NeuraLake para explicar o resultado. A conversa não tem uma operação para pagar.

O endpoint `POST /api/reviews/:orderId/chat/completions` prepara a conexão com o Custom LLM da Agora. Ele exige uma credencial assinada com validade de cinco minutos, limitada a um usuário, pedido e relatório. A associação do usuário é conferida novamente em cada consulta. Uma nova versão da entrega exige outra sessão.

## Ativar no Lovable

1. Aplicar `drizzle/migrations/0002_harden_verification_settlement.sql` no banco conectado, pelo fluxo de migrações do projeto. A migração está registrada no journal. Os testes executaram essa migração apenas em um PostgreSQL temporário local.
2. Confirmar `NEURALAKE_API_KEY` nos Secrets. A chave continua somente no servidor. Abrir a aba Verificação, entrar e consultar o agente. Esse teste real ainda precisa ser realizado no ambiente do Lovable; a chave remota não foi copiada para o computador.
3. Para habilitar a rota de voz, adicionar `AGORA_REVIEW_SECRET`, gerado aleatoriamente com pelo menos 32 caracteres. Esse segredo assina sessões internas; ele não é a chave da NeuraLake nem o App Certificate da Agora.
4. Com um projeto Agora Conversational AI habilitado, implementar o início/encerramento da sessão RTC no backend e a captura do microfone no navegador. Usar `prepareReviewVoice` para obter o caminho do Custom LLM e sua credencial curta. Configurar a URL pública HTTPS como `llm.url` e a credencial curta como `llm.api_key`. Renovar iniciando outra sessão após a expiração.

A entrada e a saída de áudio, o provisionamento do canal e os tokens RTC ainda estão pendentes. O formato HTTP e o isolamento da revisão foram testados localmente. Não houve uma chamada real à Agora nem à NeuraLake nesta execução.

O adaptador atual espera a resposta completa da NeuraLake e então a entrega em eventos SSE. O streaming de tokens e sua latência precisam ser medidos na integração de voz. Falha do provedor retorna erro e não altera verificação ou saldo.

## Formato para novas verificações

Contrato:

```json
[{"criterion":"Preço preservado","expected":true}]
```

Relatório:

```json
[{"criterion":"Preço preservado","expected":true,"observed":true,"status":"passed","evidence":"Conferência de todas as linhas do arquivo recebido"}]
```

Cada nome deve ser único. O relatório precisa cobrir exatamente os critérios e valores esperados do contrato. As observações devem ser produzidas pelo verificador no servidor, a partir do arquivo recebido. Um valor `passed` escrito por um modelo ou fornecedor não constitui uma verificação.

A leitura da tela mantém compatibilidade explícita com os rótulos dos relatórios de vídeo antigos. A nova liquidação exige o formato canônico acima. Contratos são imutáveis: preparar uma contratação nova para o teste completo. Não reescrever contratos ou relatórios antigos para fabricar uma aprovação.

## Proteções financeiras adicionadas

As operações de reserva e liquidação exigem contas existentes, valores válidos, entrega do fornecedor contratado, identificação SHA-256, relatório da mesma versão e todos os critérios aprovados. A reserva pertence ao pedido e os lançamentos têm chaves derivadas desse pedido. A transação faz toda a movimentação ou desfaz tudo. O fornecedor pode gastar os créditos simulados recebidos em outra contratação.

Reservas anteriores sem a chave `order:<id>:reservation` ficam bloqueadas pela nova regra. Antes de aplicar em um ambiente com pedidos ativos, conferir esses pedidos; nenhuma reserva antiga foi alterada nesta entrega. Pedidos já liquidados continuam registrados.

A migração retira a inserção direta de relatórios por usuários do navegador. O serviço verificador deve gravá-los com a credencial do servidor após executar os testes objetivos. Ainda falta implementar o executor de serviços e o verificador que lê o arquivo real.

## Validação executada

```sh
bun install --frozen-lockfile
npm test
npm run test:finance
npx tsc --noEmit
npm run build
```

Os testes financeiros exigem `initdb`, `pg_ctl` e `psql` no PATH. Criam um cluster temporário local e o removem ao terminar. Não usam a URL do banco do Lovable. Há um teste com duas conexões simultâneas esperando o mesmo bloqueio antes de liquidar.

Os testes da NeuraLake usam respostas controladas para verificar o endpoint, as mensagens e o tratamento de erros. Eles não provam a disponibilidade do provedor ou do áudio.

Fontes: [Custom LLM da Agora](https://github.com/AgoraIO-Conversational-AI/server-custom-llm), [sessões da Agora](https://docs.agora.io/en/ai/build/start-stop-agent) e documentação `docs-neuralake.txt` fornecida pela equipe.
