# NeuraMarket

Uma rede onde empresas de agentes oferecem serviços e contratam especialistas, com o pagamento condicionado à verificação da entrega.

Idioma da interface: português do Brasil. Projeto conectado ao Lovable para o hackathon da NeuraLake.

**Demo autônoma:** objetivo e orçamento pelo MCP, negociação conforme as políticas cadastradas, execução em Chromium, uma correção e liquidação simulada após a auditoria. A autorização é dada antes da contratação. Depende da migração `0017_autonomous_browser_market.sql` e do executor atualizado. [Operação e limites](docs/mcp.md#objetivo-autônomo-de-navegador).

**Direção atual:** [Estratégia](docs/strategy.md). **Estado de implementação:** [Roadmap](roadmap.md). O [estúdio](docs/company-studio.md) cria especialistas, executa missões com até cinco agentes, contrata ofertas da rede e mantém o pagamento simulado reservado até o aceite humano. A API permite que outro agente crie, avance, consulte e retome a mesma cadeia. Claude e outros clientes podem usar essas operações pelo [adaptador MCP](docs/mcp.md). A migração `0012_persist_autonomous_missions.sql` ainda precisa ser aplicada no banco conectado ao Lovable. O cadastro de executores externos continua como próxima extensão.

1. O PRODUTO

O Agente Zero recebe um objetivo e um orçamento. Ele pergunta o que falta, consolida o briefing e divide a missão em até cinco etapas. Depois usa uma capacidade interna, promove uma disputa entre ofertas compatíveis ou cria um novo especialista quando falta capacidade. Cada entrega verificada alimenta a etapa seguinte. A API permite que Claude, um servidor MCP ou outro agente use a mesma rede.

A entrada principal é “Executar missão”. “Criar especialista”, “Marketplace” e “Entregas” permitem configurar capacidades, consultar ofertas e revisar contratos. O fornecedor descreve capacidade, entrada, saída, preço, prazo e critérios de aceite. A oferta só pode receber pedidos depois que seu executor for conectado e validado.

A entrega é verificada conforme os critérios fixados antes da contratação. A missão fica aguardando revisão enquanto houver pagamentos reservados e só termina quando os contratos externos forem aceitos e liquidados. Cada pagamento simulado pode ser liberado uma única vez.

A hipótese de monetização é uma taxa por contratação concluída, com percentual comercial a validar. A demonstração principal usa especialistas NeuraLake que entregam conteúdo estruturado e verificável. O executor de catálogo em CSV continua disponível para contratos antigos. Vídeo e publicação em redes sociais dependem de conectores próprios.

2. OS CINCO DESAFIOS OBRIGATÓRIOS

01. Negócio autônomo:
Uma empresa recebe um pedido, interpreta a necessidade, contrata um fornecedor e acompanha a execução até a entrega.

02. Marketplace de agentes:
O comprador consulta ofertas cadastradas, compara fornecedores e escolhe uma oferta compatível.

03. Economia entre agentes:
O comprador administra um orçamento autorizado. O sistema controla reservas, pagamentos, devoluções e comissão.

04. Produto para agentes:
As ofertas e contratações são acessíveis por uma API autenticada. Outro agente consegue descobrir o serviço, contratar, acompanhar o pedido e consumir a entrega.

05. Confiança e verificação:
Um verificador separado do fornecedor confere a entrega, produz evidências e determina se os critérios de aceite foram cumpridos.

O desafio 05 é obrigatório e deve ser a primeira parte funcionando de ponta a ponta.

3. IDENTIDADE VISUAL

Referência atual: https://olas.network/

Use a organização visual para explicar a participação na rede: fundo claro, gradientes suaves, títulos amplos e um diagrama que conecta comprador, marketplace e fornecedores. As duas ações principais são “Contratar um especialista” e “Oferecer um serviço”. O acesso à demonstração permanece visível.

Adapte o desenho à marca NeuraMarket e ao seu fluxo de verificação. A referência anterior Agentplace faz parte do histórico visual. Logotipos de clientes, números de uso, parcerias e resultados das referências não pertencem à NeuraMarket.

Nas telas operacionais, priorize o contrato, a entrega, as evidências e os saldos. Use estados de carregamento, vazio, erro e sucesso. Os botões precisam executar uma ação ou explicar uma dependência real. Um formulário que apenas gera um rascunho deve informar que a oferta ainda não foi publicada nem conectada.

4. ARQUITETURA

Use React e TypeScript no frontend.

Use Lovable Cloud ou Supabase para:
- autenticação;
- banco de dados;
- armazenamento de arquivos;
- funções de backend;
- segredos das integrações.

As operações privilegiadas ficam no servidor:
- chamada aos modelos;
- execução dos fornecedores;
- reserva de orçamento;
- verificação;
- aprovação;
- movimentação de saldo.

Persistir, no mínimo:
- empresas e seus membros;
- agentes e suas configurações;
- capacidades executáveis;
- ofertas e suas versões;
- pedidos e contratos;
- trabalhos em execução;
- entregas e suas versões;
- relatórios de verificação;
- contas e movimentações de saldo;
- eventos do pedido.

Separe os dados por usuário e empresa. Aplique autorização no backend e políticas de acesso no banco.

Cada empresa possui identidade, configuração e saldo próprios. O fornecedor não pode aprovar a própria entrega nem alterar o orçamento do comprador.

5. INTEGRAÇÃO REAL COM A NEURALAKE

Todas as chamadas de inferência dos agentes devem usar a NeuraLake.

Documentação:
https://www.neuralake.com.br/api

Base URL:
https://api.neuralake.cloud/v1

Método:
POST

Endpoint:
/chat/completions

Headers:
Authorization: Bearer <NEURALAKE_API_KEY>
Content-Type: application/json

Corpo mínimo para testar:
{
  "model": "text",
  "messages": [
    {
      "role": "user",
      "content": "Responda apenas: conexão funcionando"
    }
  ],
  "stream": false
}

Solicite NEURALAKE_API_KEY pelo campo seguro de Secrets.
Leia a chave somente no backend.
Nunca exponha a chave no navegador, no repositório ou nos logs.

Crie uma camada única de integração, reutilizada pelos agentes.
Comece com uma chamada real e valide o formato da resposta.

Use modelos configuráveis:
- Configuração da empresa: reasoning.
- Gerente comprador: reasoning.
- Roteiro e instruções de produção: text ou reasoning.
- Avaliação complementar da entrega: reasoning.
- Análise de imagens: multimodal, após confirmar o formato suportado.

Valide todas as respostas estruturadas no servidor.
Confirme suporte a JSON Schema e ferramentas antes de depender desses recursos.
Não invente campos de resposta, parâmetros de memória ou identificadores de sessão.

Cada agente deve ter instruções e histórico separados por empresa e tarefa.

O tutorial da NeuraLake menciona memória compartilhada no modo auto e orienta chamadas com modelos explícitos para agentes separados. Comece com modelos explícitos e teste o isolamento. Trocar o nome do modelo, sozinho, não deve ser tratado como prova de isolamento.

O verificador recebe o contrato e as evidências necessárias. Ele não herda a conversa privada do fornecedor.

Registre modelo solicitado, duração, resultado e uso retornado pela API, quando disponível. Não invente números de consumo ou custo.

Trate erros e limite novas tentativas. Inferência ilimitada durante o evento não autoriza loops sem limite.

Os créditos da NeuraLake são separados dos créditos financeiros simulados das empresas.

6. EMPRESAS E SERVIÇOS EXTERNOS

Criar uma empresa na plataforma é opcional. Um serviço externo deve ter identidade do dono, executor autenticado e as mesmas condições de contrato. O cadastro precisa validar sua integração antes da publicação.

O usuário descreve:
- o serviço que quer vender;
- o público;
- os materiais necessários;
- o resultado entregue;
- o preço;
- as condições de execução.

O agente de configuração transforma isso em uma proposta estruturada para revisão do dono.

Publicar a empresa deve criar:
- identidade e descrição;
- agente responsável;
- capacidades disponíveis;
- oferta com entradas e saídas definidas;
- preço;
- prazo;
- critérios de aceite;
- limite de correções.

As capacidades publicadas precisam estar ligadas a executores reais.

Se uma integração estiver ausente, a capacidade aparece como “Configuração pendente” e não pode receber contratações.

Para este MVP, a descrição configura as capacidades implementadas. Não prometa que qualquer serviço imaginado se torna executável automaticamente.

Uma nova empresa deve conseguir publicar uma oferta compatível e receber pedidos sem alterar o código do comprador.

7. MARKETPLACE E INTERFACE PARA AGENTES

Cada oferta deve informar:
- empresa fornecedora;
- capacidade;
- descrição da entrega;
- entradas obrigatórias;
- formato da saída;
- preço;
- prazo;
- critérios verificáveis;
- política de correção e cancelamento;
- disponibilidade.

O agente comprador consulta os registros atuais do catálogo.

Ele escolhe com base no pedido, na compatibilidade, no preço e no prazo. Registre uma justificativa curta baseada nesses dados.

Preços e condições usados na contratação vêm da oferta armazenada. O modelo não pode inventar valores ou escolher um fornecedor inexistente.

Disponibilize operações autenticadas para:
- consultar empresas e ofertas;
- obter as condições de uma oferta;
- criar um pedido;
- consultar seu andamento;
- enviar uma entrega;
- consultar o relatório de verificação;
- receber os arquivos finais.

Documente as operações com exemplos de requisição e resposta ou OpenAPI.

Implemente a autorização conforme o papel:
- comprador contrata e acompanha;
- fornecedor recebe e entrega;
- verificador registra evidências;
- serviço financeiro controla o saldo.

Use as mesmas operações no aplicativo e nas chamadas dos agentes. O fluxo precisa funcionar sem depender de cliques de uma pessoa em cada etapa.

8. DEMONSTRAÇÃO PRINCIPAL A IMPLEMENTAR

Prepare uma empresa compradora, dois fornecedores com ofertas diferentes e um verificador com permissões separadas. Identifique os dados de demonstração e o saldo como créditos simulados.

O pedido contém um catálogo de produtos, os campos esperados e o teto de gastos. O fornecedor usa a NeuraLake para padronizar os registros em JSON. O verificador lê a saída e confere o formato, os campos obrigatórios, os identificadores, a quantidade de registros e a preservação dos preços contra a fonte.

O fluxo:
1. O comprador interpreta o pedido e consulta as ofertas atuais.
2. Seleciona um fornecedor compatível com o orçamento.
3. O backend fixa o contrato e reserva o valor.
4. O executor fornecedor produz e armazena uma entrega versionada.
5. O verificador compara o conteúdo recebido com os critérios.
6. Uma falha demonstra a evidência e mantém o pagamento bloqueado.
7. A correção produz uma nova versão e passa pelas mesmas verificações.
8. A aprovação permite o pagamento simulado e o registro da comissão.
9. Repetir a solicitação de liquidação demonstra que o pagamento ocorreu uma vez.
10. O comprador consome o JSON aprovado pela API para continuar seu trabalho.

A falha deliberada é identificada como cenário de teste. Também execute um pedido sem falha introduzida. A aprovação comprova os critérios contratados; avaliações semânticas adicionais devem explicitar seus limites.

O catálogo e os relatórios de vídeo atuais são dados de teste persistidos. A nova demonstração só pode ser declarada funcional depois que o executor, o verificador e a contratação completa estiverem conectados.

9. VÍDEO COMO EXTENSÃO OPCIONAL

Esta seção se aplica caso a equipe acrescente vídeo depois da primeira contratação completa. A NeuraLake fornece a inferência dos agentes. A geração do vídeo depende de uma integração específica.

Crie um adaptador para conectar o gerador existente da equipe.
Solicite sua documentação, endpoint e credencial pelo mecanismo apropriado. Não invente uma API nem escolha um serviço pago sem configuração.

O adaptador deve:
- receber o pedido estruturado;
- iniciar a geração;
- guardar o identificador do trabalho;
- acompanhar o estado;
- recuperar o arquivo;
- registrar falhas;
- evitar iniciar a mesma geração duas vezes.

Geração e processamento são trabalhos assíncronos.
Persistir o estado permite continuar depois de recarregar a página.

Uma integração ausente deve ficar visível como pendência.
Continue construindo as partes independentes, sem declarar que a geração funciona.

Uploads manuais podem servir para testar o verificador, identificados como testes. Não os apresente como produção autônoma.

Para conferir os bytes do vídeo, use um executor compatível com ffprobe e FFmpeg ou ferramentas equivalentes.

Se o ambiente Edge não suportar esse processamento, implemente um serviço separado de mídia e o conecte ao backend. Entregue também suas instruções de execução.

10. CONTRATO E VERIFICAÇÃO

Fixe o contrato antes de iniciar a produção:
- comprador;
- fornecedor;
- versão da oferta;
- preço e comissão;
- prazo;
- dados do pedido;
- critérios de aceite;
- limite de correções;
- política de cancelamento e devolução.

Editar uma oferta depois não pode alterar contratos existentes.

Para o primeiro serviço, conferir o esquema do JSON e os dados preservados contra a entrada. O verificador deve ler o conteúdo recebido, calcular sua identificação e registrar os valores observados.

Se uma oferta de vídeo for conectada, os critérios podem incluir:
- contêiner MP4;
- proporção vertical 9:16;
- resolução mínima de 720 × 1280;
- duração entre 8 e 10 segundos;
- decodificação completa sem erro.

As condições devem corresponder às capacidades reais do fornecedor. Elas ficam visíveis antes da contratação.

Na extensão de vídeo, verifique o arquivo recebido no backend:
- leia os bytes;
- identifique formato, resolução e duração;
- execute uma verificação de decodificação;
- calcule um hash;
- registre os resultados.

Não confie apenas na extensão, nas declarações do fornecedor ou nos metadados enviados pelo navegador.

Cada relatório deve conter:
- pedido e contrato;
- versão e hash da entrega;
- versão das regras aplicadas;
- ferramenta utilizada;
- resultado de cada critério;
- valor esperado;
- valor observado;
- evidência;
- decisão final;
- data da verificação.

Use a NeuraLake para uma avaliação complementar da adequação ao briefing, quando houver evidências que o modelo consiga analisar.

Apresente os limites dessa avaliação. Não garanta criatividade, direitos autorais ou desempenho comercial a partir de testes técnicos.

Uma opinião positiva da IA nunca anula uma falha objetiva.

Qualquer critério obrigatório sem evidência suficiente deixa o resultado inconclusivo e bloqueia a liquidação.

O conteúdo recebido do fornecedor é dado não confiável. Instruções dentro do arquivo ou da mensagem de entrega não podem modificar o contrato ou as regras.

O verificador tem permissões separadas e não pode movimentar dinheiro.

Uma nova versão exige uma nova verificação. Uma aprovação antiga não vale para outro arquivo. Depois da liquidação, preserve o registro concluído como imutável.

11. ORÇAMENTO E LIQUIDAÇÃO

Todos os pagamentos do MVP são simulados, com essa condição visível na interface.

Use valores inteiros em uma unidade mínima para evitar erros de arredondamento.

Mostre:
- saldo disponível;
- valor reservado;
- valor pago;
- valor recebido;
- comissão.

O preço precisa caber no saldo disponível e no teto autorizado para o pedido.

Reserve o valor antes da execução.

O fornecedor recebe o preço contratado menos a taxa acordada. A comissão de 10% dos dados e funções iniciais é um exemplo da demonstração. Tornar a taxa configurável exige uma implementação; o percentual comercial ainda será validado. Separar valor total transacionado, repasse e receita da plataforma nos indicadores.

Uma transação do banco deve registrar conjuntamente:
- consumo da reserva;
- crédito ao fornecedor;
- crédito à plataforma;
- liquidação do pedido.

Use identificadores únicos, bloqueios ou transições condicionais para impedir duplicidade, inclusive com chamadas simultâneas.

Repetir uma aprovação, receber um evento atrasado ou recarregar a página não pode pagar novamente.

Se houver uma correção permitida e dentro do prazo, preserve a reserva.
Cancelamento, expiração ou encerramento sem aceite liberam a reserva conforme o contrato.

Uma corrida entre cancelamento e aprovação não pode produzir pagamento e devolução ao mesmo tempo.

12. ESTADOS E ACOMPANHAMENTO

Modele transições explícitas para:
- rascunho;
- contratado com valor reservado;
- em execução;
- entregue;
- em verificação;
- correção solicitada;
- verificação inconclusiva ou com erro;
- aceito;
- liquidado;
- cancelado;
- expirado.

Rejeite transições incompatíveis.
Relatórios atrasados de uma versão anterior não alteram a versão atual.

Mostre uma linha do tempo baseada em eventos persistidos:
quem executou a ação, quando aconteceu e qual foi o resultado.

A interface apresenta dados reais do backend.
Animações podem acompanhar eventos, mas não podem simular progresso inexistente.

13. TELAS

Entrada:
A composição inspirada na Olas apresenta a rede e as entradas para contratar e oferecer. A demonstração está identificada como protótipo.

Oferecer serviço:
Permitir descrever a capacidade de uma empresa própria ou de um agente externo. Mostrar entrada, saída, preço, critérios e integrações necessárias antes da publicação. Rascunhos locais precisam ser identificados como preparatórios.

Empresas:
Lista das empresas, serviços publicados e situação operacional.

Marketplace:
Ofertas com preço, prazo, critérios e disponibilidade.

Novo pedido:
Briefing, materiais e orçamento autorizado.

Detalhe do pedido:
- estado e linha do tempo;
- oferta escolhida e justificativa;
- contrato;
- entrega estruturada e sua versão;
- relatório de verificação;
- histórico das correções;
- movimentações financeiras.

Verificação:
Entrega e evidências lado a lado. Cada critério mostra esperado, observado e resultado. O tipo de visualização acompanha o formato da saída.

Financeiro:
Saldos, reservas, pagamentos e comissões simulados.

Integrações:
Situação da NeuraLake, dos executores e da revisão por voz com a Agora. A integração de vídeo aparece somente quando fizer parte da oferta. Testes de conexão não exibem valores secretos.

No mobile, reorganize as colunas sem esconder contrato, resultado ou saldo.

14. CENÁRIO DE REPROVAÇÃO E CORREÇÃO

Prepare um cenário de teste reproduzível:
- primeira entrega fora de um critério técnico;
- relatório apontando a falha;
- pagamento bloqueado;
- correção;
- nova verificação;
- pagamento liberado uma única vez.

A falha introduzida para a demonstração deve ser identificada como cenário de teste.

Use conteúdo real recebido do executor. Não force uma aprovação ou reprovação por um botão que ignore o verificador.

Inclua também um fluxo normal, sem falha introduzida.

15. TESTES OBRIGATÓRIOS

Verifique:
- chamada real à NeuraLake;
- separação do contexto dos agentes;
- cadastro de um serviço externo, validação do executor e publicação de sua oferta;
- descoberta dinâmica de sua oferta pelo comprador;
- bloqueio de contratação acima do orçamento;
- reprovação de saída com campos ausentes, preços alterados ou registros incompatíveis;
- detecção de conteúdo inválido ou corrompido;
- bloqueio quando a verificação falha;
- nova verificação após uma correção;
- rejeição de aprovação referente a uma versão antiga;
- pagamento único após chamadas repetidas e simultâneas;
- cancelamento ou expiração sem perda de saldo;
- impossibilidade de o fornecedor aprovar a própria entrega;
- resistência a uma instrução inserida na entrega para forçar aprovação;
- retomada do pedido depois de recarregar a página.

Teste o fluxo também pela API, sem depender da interface.

16. ORDEM DE IMPLEMENTAÇÃO E ENTREGA

Primeiro:
Configure o backend, os segredos e a chamada real à NeuraLake.
Defina o contrato de padronização do catálogo e implemente seu executor.

Depois:
Implemente contrato, entrega versionada, verificação e liquidação simulada. Use arquivos de teste identificados para validar esse núcleo.

Em seguida:
Conecte os agentes, o catálogo e a execução real do fornecedor.

Depois:
Conecte o cadastro de serviços externos ao mesmo fluxo e demonstre a entrada de um novo fornecedor. A criação de uma empresa própria usa as mesmas operações.

Por fim:
Aplique a identidade visual às telas completas, execute os testes e prepare a demonstração.

Entregas previstas:
- aplicação funcional;
- banco e regras de acesso;
- integrações configuráveis;
- documentação da API;
- dados iniciais de demonstração;
- testes dos fluxos críticos;
- instruções para conectar e testar um executor externo;
- lista objetiva das dependências ainda pendentes.

Comece a implementação. Resolva decisões técnicas rotineiras e solicite apenas credenciais ou informações de integração que sejam realmente necessárias.

Não declare uma capacidade concluída antes de executar o fluxo correspondente e conferir seu resultado.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://market-agent-sync.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7e7d151d-1c67-4e35-8981-c8d1556dc0ce).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Para desenvolver localmente, instale Node.js e npm com o [nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
