# NeuraMarket: implementação

Atualizado em 19/09/2026. Direção atual em [Estratégia](docs/strategy.md). A presença de uma tela, especificação ou dado de demonstração não encerra uma implementação.

## Base existente

- [x] Estrutura de autenticação e banco com empresas, ofertas versionadas, contratos, entregas, evidências e contas.
- [x] Consulta do catálogo e do pedido demonstrativo persistidos, com créditos simulados identificados.
- [x] Funções SQL para reserva e liquidação, com vínculo da entrega atual ao contrato e proteção contra pagamento duplicado.
- [x] Testes locais de liquidação simultânea, limites de orçamento, critérios incompatíveis e permissões.
- [x] Painel que confere a consistência dos relatórios antes de apresentar a aprovação.
- [x] Assistente autenticado que consulta evidências e chama a NeuraLake pelo servidor.
- [x] Endpoint Custom LLM e credencial curta para preparar a revisão com a Agora.
- [x] Especificação inicial OpenAPI e documentação do serviço de mídia.
- [x] Landing com entradas para consultar o catálogo demonstrativo e preparar uma oferta local, com resumo e exportação em JSON.

A verificação local anterior está registrada em [Verificação e Agora](docs/verification-agora.md). As funções e os testes existentes não comprovam uma contratação completa em produção. Os endpoints listados no OpenAPI ainda precisam dos respectivos handlers de operação. O código atual consulta uma demonstração de vídeo; o executor e o verificador de um novo serviço continuam pendentes.

## 1. Fechar uma contratação verificável

- [ ] Implementar o serviço de padronização de catálogo em JSON, com entrada, saída e critérios versionados.
- [ ] Validar a chamada real à NeuraLake em uma sessão autenticada e conferir isolamento entre comprador, fornecedor e verificador.
- [ ] Criar as operações autenticadas para pedido, reserva, execução e envio da entrega; validar permissões no servidor.
- [ ] Implementar um verificador que lê o conteúdo recebido e produz evidências de campos, identificadores, quantidade e preços preservados.
- [ ] Conectar a verificação ao serviço financeiro, usando a versão atual da entrega e a reserva do pedido.
- [ ] Demonstrar falha, correção, aprovação e pagamento único em uma contratação nova, incluindo chamadas simultâneas e retomada após recarregar.
- [ ] Implementar cancelamento e expiração conforme o contrato; provar que uma corrida com a aprovação não paga e devolve ao mesmo tempo.

**Concluído quando:** o arquivo ou JSON real atravessa o fluxo completo, uma falha objetiva impede a transferência e a correção libera uma única transferência simulada.

## 2. Conectar os dois lados do marketplace

- [ ] Entregar um cadastro persistido de serviço externo, vinculado ao dono e com credenciais protegidas no servidor.
- [ ] Verificar a integração do executor antes de permitir que a oferta apareça como disponível.
- [ ] Publicar entrada, saída, preço, prazo, regras de aceite e correção em uma versão imutável da oferta.
- [ ] Implementar descoberta e escolha pelo agente comprador entre pelo menos dois fornecedores, com justificativa baseada no catálogo e no orçamento.
- [ ] Conectar as ações de contratar e oferecer às operações reais; identificar formulários preparatórios enquanto a publicação estiver pendente.
- [ ] Validar a API com um agente externo que encontra a oferta, contrata e consome a entrega sem cliques intermediários.
- [ ] Demonstrar a entrada de um novo fornecedor sem alterar o código do comprador.

**Concluído quando:** um serviço externo validado consegue receber uma contratação do mesmo fluxo usado pelos agentes da plataforma.

## 3. Preparar a apresentação e medir o negócio

- [ ] Ensaiar a demonstração dos cinco desafios conforme a [estratégia](docs/strategy.md), priorizando as evidências do desafio 5.
- [ ] Separar valor transacionado, repasse e taxa da plataforma nos indicadores; manter a comissão da demo identificada como exemplo.
- [ ] Registrar custo de inferência e execução, tempo de conclusão e correções por contratação, sem inventar custos quando o provedor não retornar uso.
- [ ] Validar a taxa por contratação concluída com potenciais compradores e fornecedores antes de definir o percentual comercial.
- [ ] Configurar o projeto Agora e implementar início, fim e áudio da sessão de revisão no navegador; medir latência e falhas reais.
- [ ] Conferir desktop, celular, estados de erro e navegação das novas telas operacionais.

A apresentação da landing descreve a proposta e distingue o protótipo das integrações pendentes. A revisão por voz é complementar e não altera a decisão do verificador. Vídeo depende de um executor conectado e pode ser acrescentado depois da primeira contratação completa. Token e blockchain ficam fora deste escopo.
