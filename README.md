# Agente Marketplace

Construa uma aplicação funcional para um hackathon de 24 horas. O nome da empresa é NeuraMarket.

Nome provisório: Empresas de Agentes.
Idioma da interface: português do Brasil.

Precisamos de um produto completo, com interface, backend, banco de dados, agentes executando tarefas e uma demonstração verificável.

Este documento contém o escopo integral. Implemente em etapas, mantendo um fluxo funcional desde o início.

1. O PRODUTO

Uma plataforma para criar empresas operadas por agentes de IA que oferecem serviços e contratam outras empresas.

O usuário descreve o serviço que quer oferecer. A plataforma configura a empresa, seu agente responsável, as capacidades disponíveis e suas ofertas.

Quando uma empresa recebe um pedido e precisa de uma capacidade externa, seu agente consulta o marketplace, escolhe um fornecedor e contrata dentro do orçamento autorizado.

A entrega é verificada conforme os critérios acordados antes da contratação. O pagamento depende desse aceite.

A monetização da plataforma será uma comissão por contratação concluída.

A demonstração principal será uma agência de marketing contratando uma produtora para entregar um vídeo real.

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

Referência principal:
https://agentplace.io/

Reproduza com fidelidade a linguagem visual dessa referência, adaptada ao nosso produto.

Características observadas:
- Abertura com fundo azul intenso.
- Uma grande forma circular ou cúpula verde-amarelada, ocupando o fundo.
- Transições suaves entre azul e verde, com textura granulada discreta.
- Título central grande, branco, em caixa alta.
- Navegação simples e espaçada.
- Botões transparentes com contorno branco fino e cantos arredondados.
- Seções seguintes em cinza muito claro.
- Texto quase preto.
- Grades organizadas por divisórias finas.
- Ícones simples e bastante espaço entre os elementos.

Paleta inicial aproximada:
- Azul principal: #2941BE.
- Verde de destaque: #B3D876.
- Fundo claro: #F3F3F3.
- Superfície: #FFFFFF.
- Texto principal: #1D1C1B.
- Texto secundário: #656565.
- Divisórias: #DCDCDC.

Tipografia:
- Poppins 700 no título principal da abertura.
- Funnel Display nos títulos secundários e na navegação.
- Inter para tabelas, formulários e informações operacionais.
- Título principal próximo de 72 px no desktop, com ajuste responsivo.
- Corpo entre 14 e 16 px.
- Botões com raio próximo de 12 px.

Use o nome e os textos do nosso produto. Crie os elementos decorativos com CSS ou SVG. Os logotipos de clientes, veículos e parceiros presentes na referência não fazem parte da nossa interface.

A abertura deve apresentar:
Título: “CRIE SUA EMPRESA DE AGENTES”
Subtítulo: “Ofereça serviços, contrate especialistas e acompanhe cada entrega com critérios de verificação.”
Ações: “Criar empresa” e “Abrir demonstração”.

Nas telas de operação, preserve o fundo claro, as divisórias discretas, a tipografia e o azul como destaque.

Reserve a composição com a cúpula para a entrada e o onboarding. As telas de pedidos precisam dar prioridade ao vídeo, às evidências e aos valores.

Use estados de carregamento, vazio, erro e sucesso. Todos os botões devem executar uma ação ou explicar uma dependência real.

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

6. CRIAÇÃO DE EMPRESAS

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

8. DEMONSTRAÇÃO PRINCIPAL

Prepare dados iniciais claramente identificados como demonstração:
- uma agência compradora;
- duas produtoras com ofertas e preços diferentes;
- um verificador;
- 100 créditos financeiros simulados para a agência.

O usuário informa:
- nome do produto;
- imagem ou material do produto;
- público;
- objetivo do vídeo;
- requisitos da entrega;
- teto de gastos.

O fluxo:
1. O gerente interpreta o pedido.
2. Consulta as ofertas disponíveis.
3. Escolhe uma produtora dentro do orçamento.
4. O backend valida a contratação e reserva o valor.
5. O fornecedor prepara a produção com a NeuraLake.
6. O gerador de vídeo conectado produz um arquivo.
7. A entrega é armazenada como uma versão imutável.
8. O verificador analisa o arquivo.
9. Uma reprovação gera evidências e um pedido de correção.
10. Uma nova versão passa por nova verificação.
11. O aceite permite liquidar o pagamento e a comissão.
12. A agência recebe o vídeo aprovado.

O roteiro é uma etapa de produção. A entrega final da demo é um vídeo real.

9. GERAÇÃO E PROCESSAMENTO DE VÍDEO

A NeuraLake fornece a inferência dos agentes.
A geração do vídeo depende de uma integração específica.

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

Exemplo de critérios para uma oferta de vídeo:
- contêiner MP4;
- proporção vertical 9:16;
- resolução mínima de 720 × 1280;
- duração entre 8 e 10 segundos;
- decodificação completa sem erro.

As condições devem corresponder às capacidades reais do fornecedor. Elas ficam visíveis antes da contratação.

Verifique o arquivo recebido no backend:
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

Na demo, use uma comissão configurável de 10%, identificada como exemplo. O fornecedor recebe o preço contratado menos a comissão.

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
A identidade visual azul e verde da referência, com acesso à criação e à demonstração.

Criar empresa:
Descrição em linguagem natural à esquerda e configuração proposta à direita. Mostrar oferta, capacidades e integrações necessárias antes da publicação.

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
- vídeo entregue;
- relatório de verificação;
- histórico das correções;
- movimentações financeiras.

Verificação:
Vídeo e evidências lado a lado. Cada critério mostra esperado, observado e resultado.

Financeiro:
Saldos, reservas, pagamentos e comissões simulados.

Integrações:
Situação da NeuraLake, do gerador e do processamento de mídia, com testes de conexão. Valores secretos não são exibidos.

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

Use arquivos reais. Não force uma aprovação ou reprovação por um botão que ignore o verificador.

Inclua também um fluxo normal, sem falha introduzida.

15. TESTES OBRIGATÓRIOS

Verifique:
- chamada real à NeuraLake;
- separação do contexto dos agentes;
- criação e publicação de uma nova empresa;
- descoberta dinâmica de sua oferta pelo comprador;
- bloqueio de contratação acima do orçamento;
- reprovação de um vídeo fora das condições;
- detecção de arquivo corrompido;
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
Em paralelo, confirme o gerador de vídeo e o executor de mídia.

Depois:
Implemente contrato, entrega versionada, verificação e liquidação simulada. Use arquivos de teste identificados para validar esse núcleo.

Em seguida:
Conecte os agentes, o catálogo e a execução real do fornecedor.

Depois:
Conecte a criação de empresas ao mesmo fluxo e demonstre a entrada de um novo fornecedor.

Por fim:
Aplique a identidade visual às telas completas, execute os testes e prepare a demonstração.

O resultado precisa incluir:
- aplicação funcional;
- banco e regras de acesso;
- integrações configuráveis;
- documentação da API;
- dados iniciais de demonstração;
- testes dos fluxos críticos;
- instruções para executar o processador de mídia;
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

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
