# NeuraMarket — plano de implementação por marcos

## Objetivo
Entregar uma plataforma em português para criar empresas operadas por agentes, contratar serviços, verificar entregas e liquidar pagamentos simulados. O primeiro marco será o fluxo de confiança completo, usando arquivos reais enviados para teste. A geração autônoma de vídeo ficará visivelmente pendente até existir uma integração da equipe.

## Marco 1 — Núcleo verificável ponta a ponta
- Criar autenticação por e-mail e Google e separar dados por usuário, empresa e papel.
- Modelar empresas, membros, agentes, capacidades, ofertas versionadas, pedidos, contratos imutáveis, trabalhos, entregas versionadas, verificações, contas, movimentações e eventos.
- Criar dados de demonstração: agência, duas produtoras, verificador, ofertas e 100 créditos simulados.
- Implementar regras no banco para transições de estado, reserva de saldo e liquidação única com comissão de exemplo de 10%.
- Criar armazenamento privado para materiais e vídeos, com acesso limitado aos participantes do pedido.
- Permitir upload de vídeo real identificado como teste.
- Registrar hash e evidências técnicas por versão. Como o ambiente principal não executa FFmpeg com segurança, preparar um serviço de mídia separado com ffprobe/FFmpeg e instruções de execução; sem ele, a verificação fica inconclusiva e bloqueia pagamento.
- Implementar o cenário reproduzível de reprovação, correção, nova verificação e pagamento único, sem botões que contornem as regras.

## Marco 2 — NeuraLake e agentes
- Criar uma única camada de integração no servidor para `https://api.neuralake.cloud/v1/chat/completions`.
- Executar uma chamada real com `model: "text"`, validar a resposta observada e registrar apenas métricas realmente retornadas.
- Testar separadamente `reasoning`, isolamento de contexto, JSON Schema, ferramentas e multimodal; recursos não confirmados não serão usados como dependência.
- Implementar agente configurador, gerente comprador, produtor e avaliador complementar com instruções e histórico separados por empresa e tarefa.
- Limitar tentativas e mostrar mensagens reais de erro da NeuraLake.

## Marco 3 — Marketplace e execução autônoma
- Publicar ofertas somente quando suas capacidades tiverem executor configurado.
- Fazer o comprador consultar o catálogo persistido, filtrar orçamento/prazo/compatibilidade e registrar uma justificativa baseada na oferta existente.
- Executar contratação, reserva, produção, entrega, verificação, correção e liquidação por operações de servidor idempotentes.
- Manter o adaptador de vídeo com estado “Configuração pendente”; ele aceitará documentação, endpoint e credencial futuros sem alterar o fluxo do comprador.

## Marco 4 — Produto e API para agentes
- Expor operações autenticadas para catálogo, condições, criação e acompanhamento de pedidos, entrega, verificação e arquivos finais.
- Aplicar autorização por papel no servidor e no banco.
- Publicar uma especificação OpenAPI com exemplos e usar as mesmas regras da interface.
- Testar o fluxo crítico também pela API.

## Marco 5 — Interface completa e demonstração
- Aplicar a identidade azul e verde inspirada na referência, com cúpula apenas na entrada e criação.
- Construir Entrada, Criar empresa, Empresas, Marketplace, Novo pedido, Detalhe, Verificação, Financeiro e Integrações.
- Priorizar vídeo, evidências, contrato e valores nas telas operacionais; reorganizar sem ocultar dados no celular.
- Incluir estados reais de carregamento, vazio, erro e sucesso.
- Executar testes de autorização, orçamento, verificação, versão antiga, idempotência, cancelamento, conteúdo malicioso e retomada após recarga.

## Critérios de conclusão
- Nenhuma capacidade será marcada como concluída sem teste correspondente.
- Créditos financeiros serão inteiros, simulados e claramente rotulados.
- O fornecedor nunca poderá aprovar a própria entrega ou alterar orçamento.
- Falha objetiva ou evidência insuficiente sempre bloqueará liquidação.
- Contratos, entregas, relatórios aprovados e lançamentos liquidados serão imutáveis.
- Dependências pendentes aparecerão objetivamente na tela de Integrações e na documentação final.

## Detalhes técnicos
- Frontend: React 19, TypeScript, TanStack Start e o sistema visual do projeto.
- Backend: Lovable Cloud com autenticação, banco, armazenamento privado e funções de servidor.
- Segurança: políticas por empresa, funções autenticadas, papéis em tabela separada, validação Zod e operações privilegiadas somente no servidor.
- Concorrência: transações SQL, bloqueio de linhas, estados condicionais e chaves únicas de idempotência.
- Mídia: serviço separado em contêiner com ffprobe/FFmpeg; o aplicativo nunca confiará em extensão ou metadados do navegador.
- NeuraLake: chave somente no servidor; modelos explícitos; sem campos, custos ou suporte inventados.
