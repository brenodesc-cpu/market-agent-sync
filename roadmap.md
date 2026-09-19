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

## 1. Contratação verificável implementada

- [x] Estúdio com conversa, prévia editável, rascunho local e publicação autenticada de empresa e oferta.
- [x] Serviço de catálogo com CSV real, produtos e preços preservados, critérios versionados e identificação SHA-256.
- [x] Reserva, execução, reprovação, correção, liquidação única e cancelamento com devolução.
- [x] API com credencial por empresa, descoberta, contratação, execução, consulta e download da entrega.
- [x] Descoberta de fornecedores novos sem alterar IDs no código comprador.
- [x] Testes em PostgreSQL temporário com arquivo real, autorização, repetição e substituição de execução interrompida.
- [x] Início e encerramento da Agora no servidor, tokens curtos e áudio no navegador.
- [x] Aplicar a migração `0004_company_studio_and_a2a.sql` no banco conectado ao Lovable.
- [ ] Validar publicação e contratação em uma sessão autenticada no ambiente remoto.
- [ ] Testar chamadas reais NeuraLake e Agora, incluindo latência do áudio e disponibilidade dos modelos gerenciados.

O código e os testes locais estão descritos em [Estúdio e A2A](docs/company-studio.md). A execução em produção depende da migração e dos Secrets. O serviço atual tem um executor determinístico; outras capacidades exigem executores e verificadores próprios.

## 2. Conectar os dois lados do marketplace

- [ ] Entregar um cadastro persistido de serviço externo, vinculado ao dono e com credenciais protegidas no servidor.
- [ ] Verificar a integração do executor antes de permitir que a oferta apareça como disponível.
- [x] Publicar entrada, saída, preço, prazo, regras de aceite e correção em uma versão imutável da oferta de catálogo.
- [x] Implementar descoberta e escolha entre dois fornecedores, com justificativa e orçamento; confirmar a escolha NeuraLake ao vivo.
- [x] Conectar contratar e oferecer ao estúdio e às operações autenticadas.
- [ ] Validar a API com um agente externo que encontra a oferta, contrata e consome a entrega sem cliques intermediários.
- [x] Testar a entrada de uma empresa fornecedora de catálogo sem alterar o código comprador.

**Concluído quando:** um serviço externo validado consegue receber uma contratação do mesmo fluxo usado pelos agentes da plataforma.

## 3. Preparar a apresentação e medir o negócio

- [ ] Ensaiar a demonstração dos cinco desafios conforme a [estratégia](docs/strategy.md), priorizando as evidências do desafio 5.
- [ ] Separar valor transacionado, repasse e taxa da plataforma nos indicadores; manter a comissão da demo identificada como exemplo.
- [ ] Registrar custo de inferência e execução, tempo de conclusão e correções por contratação, sem inventar custos quando o provedor não retornar uso.
- [ ] Validar a taxa por contratação concluída com potenciais compradores e fornecedores antes de definir o percentual comercial.
- [ ] Configurar o projeto Agora e testar a implementação de início, fim e áudio; medir latência e falhas reais.
- [ ] Conferir desktop, celular, estados de erro e navegação das novas telas operacionais.

A apresentação da landing descreve a proposta e distingue o protótipo das integrações pendentes. A revisão por voz é complementar e não altera a decisão do verificador. Vídeo depende de um executor conectado e pode ser acrescentado depois da primeira contratação completa. Token e blockchain ficam fora deste escopo.
