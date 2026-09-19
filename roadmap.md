# NeuraMarket roadmap
- [x] Ativar Lovable Cloud e autenticação
- [x] Armazenar a chave NeuraLake com segurança
- [x] Criar o modelo de dados e regras de acesso
- [x] Fechar reserva, verificação e liquidação idempotente
- [x] Inserir e validar dados reais da demonstração
- [ ] Implementar camada NeuraLake e testes de isolamento
- [ ] Implementar interface operacional completa
- [x] Documentar contrato inicial da API e serviço de mídia
- [x] Validar telas atuais em desktop e mobile
- [ ] Validar fluxos críticos autenticados e concorrentes
- [ ] Conectar gerador de vídeo (bloqueado: integração da equipe inexistente)

## Primeira integração de verificação, 19/09

- [x] Conferir vínculo de pedido, contrato, entrega e relatório antes de apresentar aprovação.
- [x] Implementar assistente autenticado que consulta evidências e chama a NeuraLake pelo servidor.
- [x] Preparar endpoint Custom LLM da Agora com sessão curta limitada ao relatório.
- [x] Testar a migração financeira em PostgreSQL local com liquidações simultâneas.
- [x] Aplicar a migração 0002 no banco do Lovable.
- [ ] Validar a chamada autenticada real à NeuraLake (bloqueado: ainda não há usuário cadastrado no app).
- [ ] Configurar o projeto Agora e implementar a sessão de áudio no navegador.
- [ ] Executar uma contratação nova com arquivo real e verificador no servidor.

Instruções e limites em [Verificação e Agora](docs/verification-agora.md). O tipo de serviço da demo permanece aberto; a revisão trabalha com os critérios do contrato.
