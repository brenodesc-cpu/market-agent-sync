# Verificação e revisão com NeuraLake e Agora

## O que esta entrega permite

A aba Verificação consulta a entrega atual, confere o vínculo com o contrato e apresenta os resultados registrados. Critério reprovado, ausente ou inconclusivo impede uma apresentação de aprovação. O assistente autenticado envia essas evidências à NeuraLake para explicar o resultado. A conversa não tem uma operação para pagar.

O endpoint `POST /api/reviews/:orderId/chat/completions` prepara a conexão com o Custom LLM da Agora. Ele exige uma credencial assinada com validade de cinco minutos, limitada a um usuário, pedido e relatório. A associação do usuário é conferida novamente em cada consulta. Uma nova versão da entrega exige outra sessão.

## Ativar no Lovable

A criação e a contratação estão descritas em [Estúdio e A2A](company-studio.md). Aplicar a migração `0004_company_studio_and_a2a.sql` depois das anteriores.

Nos Secrets, configurar:

- `NEURALAKE_API_KEY`: inferência no servidor.
- `AGORA_APP_ID` e `AGORA_APP_CERTIFICATE`: projeto com Conversational AI habilitado.
- `AGORA_REVIEW_SECRET`: ao menos 32 caracteres aleatórios, usado para assinar sessões internas.
- `AGORA_TTS_VOICE_ID`: ID de uma voz MiniMax disponível no projeto, preferencialmente em português.
- `PUBLIC_APP_URL`: origem HTTPS da aplicação publicada, por exemplo `https://market-agent-sync.lovable.app`.

A implementação usa reconhecimento Deepgram e voz MiniMax no modo gerenciado da Agora. Confirmar que esses serviços estão disponíveis no projeto. Nenhuma chave precisa ser copiada para o computador ou colada na conversa.

O botão Conversar por voz pede a permissão do microfone, inicia a sessão no servidor e conecta o navegador ao canal RTC. O servidor usa a autenticação por token RTC + RTM recomendada pela Agora; App Certificate e chave NeuraLake permanecem no servidor. O Custom LLM recebe uma credencial curta que permite consultar apenas aquele usuário, pedido e relatório.

Encerrar fecha o microfone, deixa o canal e solicita a parada do agente. A sessão local termina em quatro minutos e meio. Se a página for fechada sem concluir a parada remota, o agente tem um timeout de 30 segundos depois da saída do participante. O callback deixa de funcionar quando o relatório muda ou a credencial expira. A conversa não tem ferramentas de pagamento nem pode aprovar a entrega.

O adaptador espera a resposta completa da NeuraLake e então a entrega em eventos SSE. A latência e a disponibilidade dos modelos precisam ser medidas com áudio real. Uma falha do provedor não altera a verificação ou o saldo. Até a execução desse teste com as credenciais do projeto, a integração permanece sem confirmação ao vivo.

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

A migração retira a inserção direta de relatórios por usuários do navegador. O serviço verificador deve gravá-los com a credencial do servidor após executar os testes objetivos. O executor de catálogo agora produz um CSV persistido; o verificador lê esse conteúdo e o compara com a origem contratada.

## Validação executada

```sh
bun install --frozen-lockfile
npm test
npm run test:finance
npm run test:a2a
npx tsc --noEmit
npm run build
```

Os testes financeiros exigem `initdb`, `pg_ctl` e `psql` no PATH. Criam um cluster temporário local e o removem ao terminar. Não usam a URL do banco do Lovable. Há um teste com duas conexões simultâneas esperando o mesmo bloqueio antes de liquidar.

Os testes da NeuraLake usam respostas controladas para verificar o endpoint, as mensagens e o tratamento de erros. Eles não provam a disponibilidade do provedor ou do áudio.

Fontes: [autenticação da Agora](https://docs.agora.io/en/api-reference/api-ref/conversational-ai/authentication), [Custom LLM da Agora](https://github.com/AgoraIO-Conversational-AI/server-custom-llm), [sessões da Agora](https://docs.agora.io/en/ai/build/start-stop-agent) e documentação `docs-neuralake.txt` fornecida pela equipe.
