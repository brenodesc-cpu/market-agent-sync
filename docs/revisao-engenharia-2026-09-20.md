# Revisão de engenharia da NeuraMarket

Data: 20/09/2026. Repositório: `brenodesc-cpu/market-agent-sync`. Base inicial conferida com `origin/main`: `a9a71a2`. Durante a revisão entrou `7ddda5b`, que preservamos. Esta análise cobre o código, os testes locais, as migrações e as dependências. Não confirma a configuração nem a versão efetivamente publicada no Lovable.

## Resumo executivo

A NeuraMarket tem uma base de protótipo com transações simuladas e controles importantes de isolamento e pagamento. A revisão encontrou falhas de consumo de recursos, de tratamento da resposta da IA e de prazo das tentativas. Foram corrigidas no código, com testes de regressão. Também atualizamos duas dependências com avisos de segurança.

Ainda há impedimentos para tratar a aplicação como infraestrutura financeira de produção: falta limitar a despesa real de inferência por usuário, completar a contabilidade de tentativas, operar execuções longas em uma fila persistente e demonstrar as integrações externas. A auditoria dos agentes de texto verifica estrutura; uma aprovação não comprova qualidade factual. O câmbio usa instituições e saldos fictícios, com negociação definida por regras.

## 1. Organização e estrutura

**O que está adequado:** rotas em `src/routes`, componentes em `src/components`, lógica em `src/lib`, esquemas de entrada com Zod e migrações versionadas. Os sufixos `.server.ts` e `.functions.ts` distinguem execução no servidor e chamadas da interface. O TypeScript usa modo estrito e verificação de acesso a índices.

**O que dificulta manutenção:** `agent-studio.server.ts` reúne mais de 1.400 linhas, incluindo planejamento, reputação, leilão, inferência, persistência e execução. `company-studio.tsx` tem mais de 1.300 linhas. `studio-runtime.server.ts` também concentra consultas, credenciais e inferência. Existem dois caminhos de extração de JSON, em `studio-runtime.server.ts` e `neuralake-json.server.ts`.

**Recomendação:** dividir por responsabilidade, preservando os contratos públicos: planejamento, execução de especialista, seleção de fornecedores e repositório de missões. Extrair as telas do estúdio por fluxo. Unificar o tratamento dos provedores depois de testes de equivalência. Uma reescrita geral antes do pitch aumentaria o risco de regressão.

## 2. Segurança

### Correções desta revisão

| Achado | Impacto e condição | Correção |
| --- | --- | --- |
| Limite de download aplicado após `arrayBuffer()` | Uma resposta grande do servidor configurado podia consumir memória antes de ser rejeitada, mesmo com limite declarado de 1 MB. Não demonstramos exploração externa. | Leitura incremental com cancelamento ao exceder o limite, inclusive sem `Content-Length` ou com cabeçalho falso. |
| Resposta NeuraLake sem limite de bytes | Resposta excessiva podia ser carregada inteira antes da validação. | Limite de 1 MiB durante a leitura no executor JSON. |
| JSON aceito apesar de truncamento ou chamada de ferramenta | Um objeto parseável podia ser tratado como entrega mesmo com `finish_reason=length`, recusa ou `tool_calls`. | Rejeição desses estados antes de interpretar a entrega. |
| Exceções de pagamento incompletas na conexão MCP | A descrição citava apenas parte das operações autorizadas automaticamente. | Descrição inclui os fluxos autônomos de navegador e câmbio. O pagamento continua simulado. |

Os limites de leitura não substituem uma quota de chamadas. A rota de voz e o executor legado ainda têm implementações próprias de consumo da resposta; precisam receber a mesma padronização.

### Proteções confirmadas no código e nos testes

- Credenciais de agentes usam 32 bytes aleatórios e hash SHA-256 no banco. A autenticação confere revogação e proprietário da empresa.
- As funções do servidor verificam propriedade antes de usar o cliente privilegiado. As tabelas de câmbio têm RLS habilitada e acesso direto restrito ao servidor.
- O MCP remoto rejeita origens de navegador diferentes e despacha as ferramentas internamente, sem encaminhar a chave a um host informado pelo chamador.
- A prévia HTML tem `sandbox` sem permissões e uma política que bloqueia scripts e recursos externos.
- A sessão de voz é assinada, dura cinco minutos e fica vinculada ao usuário, pedido e relatório. A voz não recebe uma função de pagamento.
- Os testes de banco cobrem reserva, recusa, adulteração e liquidação única, incluindo chamadas concorrentes.

### Riscos pendentes

**Prioridade alta: custo e abuso.** Não encontramos quota persistente por usuário/chave para criar agentes, testar definições e chamar inferência. Os créditos simulados não representam um teto efetivo para toda a conta do provedor. Implementar limite por período e concorrência, autorização antes da chamada, registro de tentativas e teto global no provedor. A [OWASP API4](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/) descreve esse risco de indisponibilidade e aumento de custos.

**Prioridade alta: conhecimento privado no modelo.** `executeDefinition` envia instruções e conhecimento do proprietário junto com a tarefa do comprador. A frase que proíbe revelar esse conteúdo não constitui uma garantia. Não reproduzimos extração nesta revisão. Evitar segredos no contexto, reduzir os dados ao necessário e testar pedidos adversariais. Referência: [OWASP sobre prompt injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/).

**Credenciais:** existe revogação, mas as chaves de agentes não têm validade nem permissões granulares por ferramenta. Acrescentar expiração e escopo de leitura/compra por chave antes de distribuir acesso amplo.

A busca por padrões de chaves e chaves privadas nos arquivos atuais versionados, fora dos testes, não encontrou correspondências. Essa busca não audita todo o histórico Git, os segredos do ambiente ou os logs do provedor.

### Dependências

`bun audit --json` encontrou avisos em quatro pacotes. O arquivo de versões foi atualizado apenas para `js-yaml` e `nanoid`, por overrides explícitos, mantendo as respectivas linhas principais.

| Pacote | Versão encontrada | Situação |
| --- | --- | --- |
| `js-yaml` | 4.3.0 | Atualizado para 4.3.2. Avisos deixaram de aparecer na nova consulta. |
| `nanoid` | 3.3.16 | Atualizado para 3.3.18. Aviso deixou de aparecer. |
| `brace-expansion` | 1.1.16 e 5.0.8 | Pendente. Duas linhas na árvore de lint exigem atualização compatível de cada resolução. |
| `esbuild` | 0.18.20, além de versões mais novas | Pendente na dependência transitiva de `@esbuild-kit/core-utils`, usada pelo Drizzle. |

Os caminhos examinados passam por lint, PostCSS/Vite e ferramentas de migração. Os avisos não comprovam que uma rota pública da aplicação seja explorável. Não foi feita uma prova de exploração no servidor publicado. O aviso do esbuild se refere ao seu servidor de desenvolvimento. Não forçamos uma versão incompatível em toda a árvore apenas para zerar o relatório.

Fontes: [JS-YAML](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj), [Nano ID](https://github.com/advisories/GHSA-2v37-7h3g-55p8), [brace-expansion](https://github.com/advisories/GHSA-rgw5-rvv9-x895), [esbuild](https://github.com/advisories/GHSA-67mh-4wv8-2f99). A severidade do aviso deve ser combinada com o caminho de execução real.

## 3. Desempenho e velocidade

**Corrigido:** criação do agente, esclarecimento do briefing e execução do especialista faziam até duas tentativas com prazos independentes de 22 segundos. Passaram a compartilhar um prazo de 22 segundos para as chamadas ao provedor. Isso limita as tentativas; não garante que a requisição HTTP inteira termine nesse tempo, pois ainda há banco e outras etapas.

**Catálogo:** `catalogueOffers` limita separadamente ofertas a 100, versões a 200 e empresas a 100, depois relaciona em memória. Com crescimento, pode omitir uma oferta válida cuja versão atual ficou fora da consulta. Usar paginação estável e consulta das versões atuais vinculadas às ofertas retornadas.

**Câmbio:** `advanceFx` recupera o histórico completo antes de cada etapa. O painel também consulta a cada dois segundos. Separar estado leve do histórico, indexar a consulta por empresa/data e reduzir consultas quando a aba estiver oculta. O objetivo é medir e reduzir viagens ao banco, sem inventar um ganho de latência.

**Interface:** o build mediu um arquivo do SDK Agora de aproximadamente 1,55 MB, ou 426 kB comprimidos. Já existe importação dinâmica no início da chamada de voz; não presumimos que esse peso seja baixado na abertura de toda página.

Não foram medidos p95/p99, usuários simultâneos, tempo em rede móvel ou gasto real por missão. Esses números exigem um ensaio no ambiente publicado.

## 4. Engenharia de software e operação

Os esquemas e as transações evitam depender apenas das instruções do modelo. Identificadores de pedido repetidos recuperam operações existentes, e os testes de concorrência dão evidência contra pagamento duplicado.

**Pendências operacionais:** o repositório não contém uma configuração `.github` de integração contínua. Isso não comprova a ausência de verificações externas no Lovable. Os testes PostgreSQL usam `/private/tmp`, caminho específico do Mac. Há migrações repetidas ou de confirmação e diferenças entre o histórico SQL e os snapshots gerados. A revisão não aplicou migrações no banco remoto.

Prioridades: tornar os testes portáveis, executar testes e compilação a cada PR, registrar a versão do banco e do aplicativo e ensaiar uma restauração. Execuções longas devem usar uma fila persistente com tentativas limitadas, cancelamento e recuperação. O estado persistente das missões já ajuda a retomar, mas não representa um trabalhador universal funcionando continuamente.

A OpenAPI pública ainda não descreve as rotas de câmbio que o MCP oferece. Gerar a documentação a partir dos mesmos esquemas e testar a correspondência entre ferramentas e endpoints.

## 5. Responsabilidade, dados e transparência

O simulador identifica dinheiro e instituições fictícios. O HTML gerado fica isolado, e os especialistas são instruídos a declarar ferramentas ausentes. São escolhas adequadas para a demonstração.

Há três limites que precisam ficar explícitos:

1. A aprovação de texto confere JSON, presença de conteúdo e seções. Não comprova correção factual, criatividade ou valor comercial. O aceite humano continua necessário nesses contratos.
2. A reputação deriva dos relatórios estruturais e conta versões. Uma tarefa reprovada e corrigida pode contribuir com duas avaliações. Esse número não equivale a acurácia validada por tarefa ou por setor.
3. A negociação de câmbio é calculada por regras sobre três fornecedores fictícios. A NeuraLake explica a comparação. Não há instituição independente aceitando uma proposta nem dinheiro real liquidado.

Não encontramos, nos caminhos revisados, uma política operacional completa de retenção, exportação e exclusão para os briefings e conhecimentos enviados aos provedores. Definir quem recebe cada dado, por quanto tempo ele fica armazenado e como o usuário controla esse uso. Esta revisão não certifica conformidade legal ou bancária.

## 6. Evidências e próximos passos

**Validação local:** 127 testes de aplicação e 52 testes PostgreSQL passaram. TypeScript, lint dos arquivos alterados e build de produção passaram. A auditoria de dependências permanece com avisos em dois pacotes. Os testes novos exercitam streams sem tamanho confiável, cancelamento por limite, truncamento/recusa da IA e bloqueio de novas tentativas após o prazo.

**Antes do pitch:** publicar o código, confirmar as migrações 0018/0019 e executar uma missão pelo MCP no site publicado. Mostrar orçamento, proposta, reprovação, correção e liquidação única. Indicar na tela que o câmbio é uma simulação.

**Antes de usuários externos com consumo relevante:** adicionar quotas de inferência e contabilidade de todas as tentativas; terminar as atualizações de dependências; sincronizar OpenAPI/MCP; limitar e explicar os dados enviados ao provedor.

**Antes de transações reais:** integrar um fornecedor autorizado com ambiente de testes, conciliar a liquidação com o registro externo e definir os procedimentos para falhas, contestação e responsabilidade. Os testes do simulador não comprovam essas condições.
