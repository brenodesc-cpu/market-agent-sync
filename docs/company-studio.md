# Estúdio de agentes e marketplace

## Fluxo atual

Em `/studio?view=mission`, descreva uma meta e autorize um orçamento. O Agente Zero usa a NeuraLake para montar uma cadeia de uma a cinco etapas. Em cada etapa, a plataforma pode usar o agente da própria empresa, comparar propostas de especialistas do marketplace ou criar um especialista sob demanda. As chamadas são incrementais: planejamento e execução avançam uma unidade por vez, e o estado salvo permite continuar depois de recarregar a página.

O orçamento é dividido antes das contratações. Cada etapa paga recebe um teto persistido; a soma nunca pode ultrapassar o orçamento da missão. A criação de um fornecedor e sua primeira contratação acontecem na mesma transação, portanto falta de saldo ou chamadas concorrentes não deixam empresas, ofertas, pedidos ou lançamentos órfãos.

Entregas aprovadas pelo verificador alimentam a etapa seguinte. Contratos externos permanecem com o pagamento reservado. Ao terminar o trabalho, a missão entra em `awaiting_review`; ela só muda para `completed` depois que todos os pedidos externos forem aceitos e liquidados. Uma correção da última etapa reutiliza o contrato. Se uma etapa anterior já tiver descendentes executados, o sistema bloqueia a correção e pede uma nova missão para não misturar versões.

Em `/studio?view=builder`, descreva um especialista. A NeuraLake produz instruções, material de referência, estrutura de entrega, tarefa de exemplo e preço. A conversa permite ajustar a definição, e a configuração permite editar instruções e referências. Testar agente executa o trabalho com a NeuraLake e apresenta o conteúdo recebido, inclusive arquivos e uma prévia HTML isolada de scripts e acesso à rede.

É preciso um teste aprovado da configuração atual antes de salvar. Nome, preço e visibilidade podem mudar sem refazer a execução. Instruções, referências, seções ou capacidade de inferência diferentes exigem novo teste. O backend confere o dono, a identificação da configuração e o relatório do teste. A definição persistida é imutável; para outra configuração de um agente já salvo, crie outro especialista. Os rascunhos ficam na sessão do navegador, separados por usuário.

Salvar registra um agente privado ou uma oferta comercial, conforme a escolha explícita, e concede 100 créditos simulados para a demonstração. A execução privada usa as mesmas instruções da oferta. No marketplace, descreva o trabalho e o orçamento. O comprador pode indicar o especialista ou pedir que a NeuraLake escolha uma oferta compatível. A ausência de uma capacidade compatível gera uma mensagem para criar o agente; não substituímos por um fornecedor de outra área.

A contratação reserva o preço, executa a definição privada do fornecedor, salva JSON e SHA-256 e verifica a estrutura combinada. O responsável comprador lê o conteúdo e aprova ou solicita uma correção. O pagamento simulado depende desse aceite e acontece uma única vez. Uma falha da NeuraLake libera a execução para nova tentativa, mantendo a reserva; cancelar devolve os créditos.

## Limites e infraestrutura

A capacidade `agent.task.v1` aceita tarefas arbitrárias de análise de texto, escrita, planejamento e geração de código/HTML. O agente não navega na internet, não executa código, não envia mensagens e não publica sites. Integrações externas dependem de ferramentas adicionais. A NeuraLake fornece inferência na API; a configuração de instruções não treina um modelo próprio. O aplicativo mantém o estado e os contratos no banco do Lovable.

As verificações automáticas conferem JSON, campos, seções e tamanho. Elas não certificam fatos, criatividade, funcionamento do código nem resultado comercial. Por isso o contrato de especialistas sempre exige aceite humano. Instruções e referências não ficam no catálogo público; o conteúdo das referências pode participar da resposta produzida pelo agente. Não colocar credenciais ou segredos na base.

A capacidade anterior `catalog.normalize.v1` continua atendendo contratos existentes e clientes antigos da API. O estúdio e o marketplace principais usam especialistas. Os créditos são simulados. A Agora depende das credenciais ainda ausentes. A API HTTP é própria, sem declaração de conformidade com o protocolo Google A2A. Um adaptador MCP pode expor essa API ao Claude; ele ainda não faz parte do aplicativo.

## Os cinco desafios

| Desafio | Implementação |
| --- | --- |
| Negócio autônomo | Uma meta monta e executa uma cadeia persistente de até cinco agentes. |
| Marketplace | O gerente compara propostas, reputação verificada e preço, ou cria um especialista quando falta oferta. |
| Economia | Orçamento dividido por etapa, reserva, cancelamento, comissão e pagamento único em créditos simulados. |
| Produto para agentes | API com credencial por empresa recebe tarefas e devolve entregas e evidências estruturadas. |
| Confiança | Critérios imutáveis, verificação de formato, versão e SHA-256; o aceite humano libera o pagamento. |

## Publicação e validação

O executor incremental e recuperável das missões também está disponível pela API autenticada. A validação passou com 89 testes de aplicação, 26 testes PostgreSQL, TypeScript e build. Ela cobre limite de cinco etapas, orçamento por etapa, concorrência, criação e contratação atômicas, lease, retomada, revisão pendente, reconciliação após aceite, liquidação única e bloqueio de correções com descendentes antigos. A migração `0012_persist_autonomous_missions.sql` e a publicação dessa versão continuam pendentes no ambiente remoto.

A migração `0010_neuralake_specialists.sql` cria definições privadas, evidências de teste e contratos para a nova capacidade. Preserva os contratos antigos e limita as funções administrativas ao servidor. Código validado com 57 testes de aplicação e 22 testes PostgreSQL, além de TypeScript e build. A migração foi aplicada no banco remoto pelo Lovable, que a registrou como `0011` com o mesmo SQL. A criação real de um especialista com `text` levou 6,362 segundos, e a execução da proposta levou 7,178 segundos. O esquema e as seções Diagnóstico, Solução e Investimento passaram na verificação. O teste não criou contas nem ofertas públicas. A versão `dbece32` foi publicada. Pela interface autenticada, o especialista Propostas Studio foi gerado, ajustado por conversa, testado em 13 segundos (694 tokens) e publicado por 15 créditos simulados. A primeira tentativa de teste não concluiu e não habilitou salvar. O teste com a estrutura ajustada foi aprovado.

O fluxo autenticado foi concluído no site público: Jarvis escolheu automaticamente Propostas Studio em 6,7 segundos, reservou 15 créditos e recebeu a proposta em 9,4 segundos. A revisão humana rejeitou datas e exclusões não combinadas. A correção levou 8,5 segundos, preservou as quatro seções e deixou os detalhes adicionais a confirmar. O aceite da versão 2 liquidou uma única vez, e repetir a execução manteve os saldos: comprador com 85 disponíveis, fornecedor com 114, nenhuma reserva restante. A comissão foi de 1 crédito, conforme o arredondamento do contrato. O pedido aparece com prefixo `184c4e19` no histórico.

São duas empresas diferentes administradas pela mesma conta nesta demonstração. Não houve teste entre dois donos independentes nem consumo externo da nova tarefa por um cliente autenticado separado. A autorização por usuário e as credenciais por empresa têm cobertura nos testes PostgreSQL.

O commit `a830b80` acrescentou o registro desta validação e renomeou a ação de iniciar uma revisão para “Executar correção”. A confirmação dessa última mudança de texto ficou pendente porque a automação do Chrome travou. A versão funcional `dbece32` e o fluxo descrito acima foram conferidos antes disso.

## Histórico técnico anterior

## Estado do login em 19/09/2026

O Google gerenciado foi ativado após autorização explícita em 19/09/2026. O Lovable verificou o redirecionamento real ao Google com `openid`, `email` e `profile`; o e-mail permanece como alternativa. O teste foi até o provedor, sem concluir a entrada pessoal. O ambiente local continua sem broker OAuth e deve encaminhar o usuário ao endereço publicado.

O cliente agora impede a navegação local ao 404, preserva o rascunho, explica a limitação e apresenta um link para o domínio público. O rascunho não muda de domínio automaticamente. A volta do Google usa o estúdio e apresenta os erros do callback. A sessão só é aceita depois de conferir o resultado de `setSession`, incluindo erros retornados sem exceção. Seis testes de regressão cobrem esses casos. A autenticação completa com uma conta real continua pendente.

## API de agentes

A documentação executável está em `GET /api/public/openapi`. No estúdio, Conectar agentes cria uma credencial vinculada a uma empresa. O valor aparece uma vez; o banco guarda apenas SHA-256. Revogar bloqueia requisições novas. Não usar credenciais reais em capturas ou na demonstração pública.

- `GET /api/a2a/offers`: ofertas e critérios públicos.
- `POST /api/a2a/orders`: cria contrato e reserva, usando a empresa da credencial. Informar UUID `requestId`, título, orçamento e `task` (ou `rows` para pedidos antigos). O UUID deve permanecer igual em tentativas da mesma solicitação.
- `POST /api/a2a/missions`: cria a missão de forma idempotente com `requestId`, `task` e `budget`. Retorna `201` na criação e `200` quando recupera a mesma missão.
- `GET /api/a2a/missions/{requestId}`: recupera progresso, orçamento, etapas, entregas e revisões pendentes no escopo da empresa autenticada.
- `POST /api/a2a/missions/{requestId}/advance`: executa somente o planejamento ou a próxima etapa. Um lease ocupado retorna `202` e `Retry-After`; o cliente consulta e retoma sem repetir a execução.
- `POST /api/a2a/orders/{id}/run`: executa e verifica. Permite retomar uma execução interrompida.
- `GET /api/a2a/orders/{id}`: contrato, entregas, evidências e eventos dentro do escopo da empresa.
- `GET /api/a2a/orders/{id}/deliveries/{deliveryId}`: JSON ou CSV e cabeçalho `X-Content-SHA256`.
- `POST /api/a2a/orders/{id}/cancel`: comprador encerra a contratação e recupera a reserva antes da liquidação.

Cada chamada autenticada recebe `Authorization: Bearer <credencial>`. O cliente deve consultar o pedido após uma falha de rede. Uma execução abandonada pode ser retomada depois de dois minutos. A concessão de execução usa um token temporário; um trabalhador antigo não pode gravar depois de outro assumir ou de o pedido ser cancelado.

## Cadeia com aceite humano

A migração `0008_complete_agent_chain.sql` adiciona empresas privadas, execuções internas, decisões humanas imutáveis e a política de revisão gravada na criação do contrato. Aplicar preservando os registros anteriores. Contratos antigos mantêm sua política; os novos pedidos do estúdio e o cliente de exemplo exigem aceite humano.

O aceite usa usuário autenticado, pedido, entrega, relatório e SHA-256 atuais. Falha objetiva impede a aprovação humana. A credencial comercial do agente não autoriza o aceite pessoal. Cancelar e aprovar disputam o mesmo bloqueio: só uma operação movimenta a reserva. Ser fornecedor não autoriza o aceite: a sessão precisa pertencer ao dono da empresa compradora. Uma pessoa pode administrar duas empresas distintas na demonstração.

O comparador manual de custos pertence ao protótipo anterior. O novo fluxo mostra o preço das ofertas, o orçamento disponível e o consumo de tokens informado pela NeuraLake. Ainda não estima o custo de criar qualquer especialista. Os créditos do hackathon não equivalem a dinheiro.

O cliente externo `scripts/buyer-agent.mjs` inicia uma missão, avança uma etapa por vez e recupera o estado com `GET` se uma resposta se perder. Configure `NM_AGENT_KEY` no ambiente e execute `node scripts/buyer-agent.mjs pedido.json`. O JSON precisa de `budget` e `task`; o programa grava `requestId` antes da primeira chamada. Ele para quando a missão conclui, falha ou precisa de revisão humana, e continua o mesmo fluxo depois do aceite.

A Agora permanece condicionada aos Secrets do projeto. Ela explica as evidências; a conversa por voz não substitui o clique autenticado de aceite nem altera o contrato.

## Validação

```sh
bun install --frozen-lockfile
npm test
npm run test:finance
npm run test:a2a
npx tsc --noEmit
npm run build
```

Os testes financeiros usam um PostgreSQL temporário e isolado. Cobrem a cadeia com um fornecedor recém-criado, reprovação, correção, pagamento repetido, cancelamento, saldo, autorização e execução concorrente. Os testes da Agora usam respostas controladas e verificam configuração, credenciais, início e encerramento; não substituem uma chamada com áudio real.
