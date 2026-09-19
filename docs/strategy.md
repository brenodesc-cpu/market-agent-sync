# Estratégia da NeuraMarket

Atualizada em 19/09/2026. Esta é a direção atual do produto; o README conserva os requisitos de implementação. O [roadmap](../roadmap.md) separa as entregas existentes das próximas implementações.

## Proposta

**Uma rede onde empresas de agentes oferecem serviços e contratam especialistas, com o pagamento condicionado à verificação da entrega.**

Um agente comprador recebe um objetivo e um orçamento. Encontra uma oferta compatível, contrata e recebe uma entrega estruturada que consegue usar na próxima etapa do trabalho. Seu dono define o limite de gastos e as permissões. O verificador compara a entrega com o contrato; o serviço financeiro libera o pagamento uma única vez quando os critérios obrigatórios são comprovados.

O problema inicial é contratar uma capacidade externa com condições claras e uma forma de conferir o resultado. O comprador economiza o trabalho de integrar cada fornecedor e refazer essa conferência. O fornecedor ganha um canal de distribuição para uma capacidade que já executa. Essas vantagens precisam ser medidas com contratações reais antes de serem apresentadas como resultados do produto.

## Quem pode participar

**A participação deve aceitar agentes construídos fora da NeuraMarket.** Criar uma empresa na plataforma será uma opção. Um fornecedor poderá conectar um serviço existente, manter a execução na própria infraestrutura e publicar uma oferta compatível com o contrato da rede.

Um cadastro de serviço deverá identificar o dono, o executor autenticado e sua disponibilidade. A oferta precisa informar entrada, formato da saída, preço, prazo, critérios verificáveis, limite de correções e política de cancelamento. Uma checagem de integração deve preceder a publicação como disponível. O simples preenchimento de um formulário não comprova que o serviço executa.

As duas entradas do produto são:

- **Contratar um especialista:** informar a necessidade e o teto de gastos; comparar serviços disponíveis e acompanhar a entrega.
- **Oferecer um serviço:** descrever a capacidade, conectar o executor e validar a oferta antes da publicação.

O agente comprador e o executor fornecedor devem ter identidades e permissões separadas. A descoberta e a contratação usam a mesma API autenticada que sustenta o aplicativo. A demonstração A2A precisa mostrar o comprador chamando o fornecedor sem uma pessoa copiar a saída de uma tela para outra.

**Na implementação atual**, contratar abre o marketplace do estúdio e oferecer abre a criação da empresa. A empresa pode publicar uma oferta do executor de catálogo existente. A publicação de uma capacidade externa arbitrária ainda depende da conexão e validação desse executor. A API permite que um comprador externo contrate e baixe o resultado. O [estúdio](company-studio.md) documenta o recorte executável.

## Contratação e confiança

O contrato fixa a versão da oferta, as partes, as entradas, a saída esperada, o preço e as regras de aceite antes da execução. O valor é reservado dentro do orçamento autorizado. Uma edição posterior da oferta preserva as condições dos contratos existentes.

A entrega recebe uma versão e uma identificação do conteúdo. O verificador independente registra o valor esperado, o observado e a evidência de cada critério. Uma reprovação ou resultado inconclusivo mantém a reserva até a correção ou a resolução prevista no contrato. Uma nova entrega exige uma nova verificação. Falhas objetivas não podem ser anuladas por uma opinião positiva do modelo.

O serviço financeiro confere a aprovação da versão atual e registra a movimentação de forma idempotente: repetir a chamada não paga novamente. A autorização para verificar não permite movimentar saldo. O conteúdo enviado pelo fornecedor é tratado como dado e não pode alterar as regras do contrato.

## Primeira demonstração executável

**Padronização de um catálogo de produtos em CSV.** A entrada atual exige SKU, tamanho e preço em centavos. O fornecedor usa um executor determinístico; a NeuraLake configura a empresa, escolhe ofertas e explica as evidências. A interpretação de rótulos livres é uma extensão futura. O verificador confere o formato, os campos obrigatórios, os identificadores e a preservação de preços e quantidade de registros contra a fonte.

O cenário começa com um campo obrigatório ausente ou um preço alterado. A evidência aponta o registro e mantém o pagamento bloqueado. A correção produz uma nova versão, que passa pelas mesmas regras e recebe o pagamento simulado. Uma chamada repetida mostra que houve uma única transferência. A falha deliberada deve aparecer como cenário de teste.

Esse serviço permite conferir o conteúdo com regras objetivas, sem depender de geração ou processamento de mídia. A aprovação comprova os critérios contratados; ela não garante a qualidade de toda interpretação semântica. Vídeo continua como opção futura, condicionado a um gerador e a um verificador de arquivos funcionais. A demonstração atual de vídeo permanece identificada como dados de teste até o novo executor estar conectado.

| Desafio | O que a demonstração precisa provar |
| --- | --- |
| 1. Negócio autônomo | O agente de uma empresa recebe o pedido, consulta ofertas e coordena a contratação. |
| 2. Marketplace | O comprador descobre e compara ofertas de fornecedores distintos. |
| 3. Economia | O teto limita a escolha; reserva e liquidação aparecem no saldo simulado. |
| 4. Produto para agentes | Um cliente externo contrata pela API e consome a saída estruturada. |
| 5. Confiança e verificação | A entrega incorreta bloqueia o pagamento; a correção é conferida e paga uma vez. |

O desafio 5 continua sendo o critério principal de conclusão. A apresentação deve mostrar quais partes foram executadas e quais ainda são uma proposta.

## Modelo de receita

A hipótese é cobrar uma taxa por contratação concluída. O percentual comercial será definido após medir o valor entregue e os custos de inferência, execução, verificação e atendimento. A comissão de 10% presente nos dados e funções iniciais é um exemplo técnico da demonstração, sem validação comercial.

O painel deve separar o valor total dos serviços contratados, o repasse aos fornecedores e a receita da plataforma. No hackathon, todos esses valores são créditos financeiros simulados. Os créditos de inferência da NeuraLake pertencem a outra conta e não representam receita nem saldo dos agentes.

Medir contratações concluídas, compradores recorrentes, tempo até a entrega aceita, correções e custo por contratação. O crescimento depende de fornecedores úteis e compradores recorrentes. Quantidade de agentes cadastrados, isoladamente, não demonstra esse valor.

## Integrações e referências

A NeuraLake fornece a inferência no servidor, com chave protegida e contextos separados por empresa e pedido. O código atual contém a consulta às evidências pelo assistente. A chamada real no ambiente autenticado ainda precisa ser comprovada. O executor de catálogo funciona sem inferência; as decisões e explicações usam a NeuraLake quando configurada.

A Agora está prevista para conversar por voz sobre o relatório de verificação. Existe um endpoint de revisão com credencial curta; a sessão de áudio no navegador e a chamada real continuam pendentes. A conversa não aprova entregas nem movimenta saldo.

A [Olas Mech Marketplace](https://olas.network/mech-marketplace) inspira a participação de serviços externos e as duas entradas, contratar e oferecer. A [descrição das requisições por HTTP da Olas](https://olas.network/blog/cheaper-faster-off-chain-requests-mech-marketplace) ajuda a separar descoberta, execução e liquidação. Essas referências orientam o desenho; não existe uma integração da NeuraMarket com a Olas. A documentação consultada não basta para concluir quais garantias de qualidade todos os serviços da Olas oferecem.

A landing adota uma composição que apresenta a rede, com fundo claro, gradientes suaves e uma relação visível entre comprador, marketplace e fornecedor. Usa a marca e as informações da NeuraMarket. Métricas, clientes, integrações e resultados precisam ter comprovação própria.

Token, blockchain, liquidação em criptomoeda e descentralização ficam fora da implementação do hackathon. A arquitetura atual usa banco de dados, serviços autenticados e créditos simulados.
