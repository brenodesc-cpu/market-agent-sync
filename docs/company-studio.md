# Estúdio e contratação entre empresas

A rota `/studio` permite criar uma empresa privada por conversa com a NeuraLake, executar seu catálogo e publicar uma oferta com autorização do dono. O botão Criar empresa da página inicial abre esse estúdio. A demonstração anterior continua em `/demo`.

## Demonstração completa

1. Entrar com Google ou e-mail, descrever a empresa e revisar a configuração. Criar como privada registra os agentes e 100 créditos simulados; a oferta permanece oculta. Em Meu agente, executar o catálogo e conferir o resultado. Depois autorizar a publicação da oferta se quiser comercializar a capacidade.
2. No marketplace, escolher a empresa compradora, informar o catálogo e o orçamento. Deixar o fornecedor automático para o gerente escolher. A escolha usa NeuraLake quando disponível; a alternativa por menor preço fica identificada no histórico.
3. Marcar o erro de preço da primeira entrega e deixar a correção automática desmarcada. Delegar. O servidor reserva o preço, entrega um CSV real e compara os produtos e preços com a origem contratada.
4. Abrir o pedido: a evidência identifica SKU, tamanho, preço esperado e preço recebido. Baixar o arquivo e conferir seu SHA-256. A reserva permanece bloqueada.
5. Solicitar correção. A versão nova passa pela mesma verificação. O responsável comprador confere o arquivo, registra o motivo e aprova essa versão para liberar o pagamento uma única vez. A carteira mostra o valor recebido e a comissão simulada de 10%, arredondada para baixo em créditos inteiros.
6. Repetir a execução de um pedido liquidado ou cancelar um pedido aberto. As operações repetidas não duplicam pagamento ou devolução.

A prévia do editor permite testar o verificador sem autenticação e sem movimentar saldo. A publicação, as contratações e as credenciais exigem login. Rascunhos permanecem neste navegador.

## Os cinco desafios

| Desafio | Implementação |
| --- | --- |
| Negócio autônomo | Gerente escolhe um fornecedor e coordena uma execução iniciada pelo cliente, com uma correção automática opcional. |
| Marketplace | Empresas publicadas entram no mesmo cadastro dos fornecedores iniciais, sem adicionar IDs no código comprador. |
| Economia | Comparação entre executar e contratar com premissas editáveis, reserva transacional, orçamento máximo, devolução, comissão e saldo reutilizável. |
| Produto para agentes | API autenticada por empresa permite descobrir ofertas, contratar, executar e consumir CSV e evidências. |
| Confiança | Verificação independente compara o arquivo com a origem imutável. Contratos novos exigem também o aceite autenticado do comprador, vinculado ao arquivo e relatório atuais. |

O serviço implementado é `catalog.normalize.v1`: organizar um catálogo de até 500 produtos em CSV, preservando SKU, tamanho e preço em centavos. O executor é determinístico. Criar outra empresa publica outra oferta dessa capacidade; não gera código para executar qualquer negócio descrito pelo usuário. Novas capacidades exigem executor e verificador próprios. A API é um protocolo HTTP próprio, sem declaração de conformidade com Google A2A.

## Aplicar no Lovable

Aplicar `drizzle/migrations/0004_company_studio_and_a2a.sql` depois das migrações existentes. O SQL adiciona arquivos persistidos, operações transacionais, credenciais de agentes e dois fornecedores executáveis. Não apagar os pedidos antigos nem recriar contratos para obter aprovações.

O servidor precisa de `SUPABASE_SERVICE_ROLE_KEY`, além da configuração pública de Supabase que o projeto já usa. A chave administrativa nunca deve ser enviada ao navegador. Confirmar `NEURALAKE_API_KEY` nos Secrets. Para o áudio, seguir [Verificação e Agora](verification-agora.md).

Em 19/09/2026, o Lovable confirmou a aplicação da migração 0004, a contratação completa no banco remoto e uma resposta da NeuraLake. O catálogo remoto também retornou Atlas Dados e Prisma Commerce na conferência local. Ainda falta testar a interface com uma conta autenticada e uma chamada real da Agora.

O Lovable confirmou a aplicação de `0006_restrict_unpublished_catalogue.sql`, registrada no histórico remoto como `0007_restrict_unpublished_catalogue.sql`. As políticas limitam versões de ofertas privadas e capacidades internas aos membros da empresa. O catálogo publicado continua acessível. Os 11 testes PostgreSQL do estúdio incluem essa restrição.

### Editor e publicação, correção de 19/09

A prévia local não tinha as chaves administrativas e da NeuraLake. O editor agora verifica a configuração e a sessão antes de gerar ou publicar. Ele preserva o pedido quando há falha ou login pendente, e só confirma a geração após uma resposta real da NeuraLake. A edição manual continua disponível. A tela mostra o limite do ambiente local e o endereço online.

Depois da publicação, Minhas empresas exibe os agentes efetivamente consultados no banco. A transação cria um gerente e um especialista em catálogo. O verificador é um serviço da plataforma. Uma falha ao atualizar a lista depois da gravação não aparece como uma falha de publicação e não provoca uma segunda criação.

Cinco testes cobrem os bloqueios de sessão e configuração, falha da IA e falha de leitura após publicação. O teste PostgreSQL também confere os dois agentes ativos após uma publicação repetida. O fluxo autenticado no navegador ainda precisa ser concluído. O erro inicial do provedor Google foi corrigido após a autorização explícita do responsável.

## Estado do login em 19/09/2026

O Google gerenciado foi ativado após autorização explícita em 19/09/2026. O Lovable verificou o redirecionamento real ao Google com `openid`, `email` e `profile`; o e-mail permanece como alternativa. O teste foi até o provedor, sem concluir a entrada pessoal. O ambiente local continua sem broker OAuth e deve encaminhar o usuário ao endereço publicado.

O cliente agora impede a navegação local ao 404, preserva o rascunho, explica a limitação e apresenta um link para o domínio público. O rascunho não muda de domínio automaticamente. A volta do Google usa o estúdio e apresenta os erros do callback. A sessão só é aceita depois de conferir o resultado de `setSession`, incluindo erros retornados sem exceção. Seis testes de regressão cobrem esses casos. A autenticação completa com uma conta real continua pendente.

## API de agentes

A documentação executável está em `GET /api/public/openapi`. No estúdio, Conectar agentes cria uma credencial vinculada a uma empresa. O valor aparece uma vez; o banco guarda apenas SHA-256. Revogar bloqueia requisições novas. Não usar credenciais reais em capturas ou na demonstração pública.

- `GET /api/a2a/offers`: ofertas e critérios públicos.
- `POST /api/a2a/orders`: cria contrato e reserva, usando a empresa da credencial. Informar UUID `requestId`, título, orçamento e linhas. O UUID deve permanecer igual em tentativas da mesma solicitação.
- `POST /api/a2a/missions`: cria e executa a contratação em uma chamada. `accepted` significa que os testes passaram e o contrato aguarda o aceite humano.
- `POST /api/a2a/orders/{id}/run`: executa e verifica. Permite retomar uma execução interrompida.
- `GET /api/a2a/orders/{id}`: contrato, entregas, evidências e eventos dentro do escopo da empresa.
- `GET /api/a2a/orders/{id}/deliveries/{deliveryId}`: CSV e cabeçalho `X-Content-SHA256`.
- `POST /api/a2a/orders/{id}/cancel`: comprador encerra a contratação e recupera a reserva antes da liquidação.

Cada chamada autenticada recebe `Authorization: Bearer <credencial>`. O cliente deve consultar o pedido após uma falha de rede. Uma execução abandonada pode ser retomada depois de dois minutos. A concessão de execução usa um token temporário; um trabalhador antigo não pode gravar depois de outro assumir ou de o pedido ser cancelado.

## Cadeia com aceite humano

A migração `0008_complete_agent_chain.sql` adiciona empresas privadas, execuções internas, decisões humanas imutáveis e a política de revisão gravada na criação do contrato. Aplicar preservando os registros anteriores. Contratos antigos mantêm sua política; os novos pedidos do estúdio e o cliente de exemplo exigem aceite humano.

O aceite usa usuário autenticado, pedido, entrega, relatório e SHA-256 atuais. Falha objetiva impede a aprovação humana. A credencial comercial do agente não autoriza o aceite pessoal. Cancelar e aprovar disputam o mesmo bloqueio: só uma operação movimenta a reserva. Ser fornecedor não autoriza o aceite: a sessão precisa pertencer ao dono da empresa compradora. Uma pessoa pode administrar duas empresas distintas na demonstração.

Meu agente compara o custo próprio e a contratação para a quantidade de usos prevista. As premissas são editáveis e identificadas como estimativas em créditos simulados; não medem o custo de construir um executor arbitrário. O catálogo interno não consome inferência. A carteira mostra tokens retornados pela NeuraLake nas decisões comerciais quando o provedor os informa. Os créditos do hackathon não equivalem a dinheiro.

O cliente externo `scripts/buyer-agent.mjs` envia uma missão pela API, recebe o arquivo e confere seu hash. Configure `NM_AGENT_KEY` no ambiente e execute `node scripts/buyer-agent.mjs pedido.json`. O JSON precisa de `title`, `budget` e `rows`; o programa grava `requestId` antes de chamar a API para permitir uma repetição segura. O pagamento aguarda o aceite no site.

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
