# A tesouraria contrata câmbio por agentes

Direção escolhida pelo Breno em 20/09/2026. Especificação do próximo caso de uso, ainda sem implementação ou conexão com instituições financeiras. A demo de navegador publicada continua disponível como reserva.

## Objetivo e valor

“Disponibilize US$ 1.000 na carteira empresarial para pagar um fornecedor. Custo total máximo de R$ 5.600, incluindo nossa taxa, e conclusão até o horário definido.” O horário vira uma data e hora explícitas com fuso antes da contratação. O beneficiário da conversão é uma carteira de teste já cadastrada. O envio posterior ao fornecedor fica fora deste primeiro recorte.

O agente comprador representa a tesouraria. Os agentes fornecedores representam instituições fictícias com condições e permissões próprias. O comprador consegue interpretar a necessidade, mas depende do fornecedor para obter uma oferta executável e realizar a conversão. A NeuraMarket compara condições, coordena a contratação e confere a execução. A vantagem frente a integrar um fornecedor diretamente ainda precisa ser validada com compradores reais.

## Cenário reproduzível

Todos os valores são fictícios, em um simulador próprio. Não representam cotações atuais, impostos aplicáveis, dinheiro real ou ofertas de parceiros. Carteiras de BRL e USD são separadas dos créditos de serviço já existentes na plataforma.

| Oferta fictícia | Total do fornecedor para receber US$ 1.000 | Prazo | Decisão |
| --- | --- | --- | --- |
| Câmbio A | R$ 5.450 | Próximo dia útil | Recusada: não atende ao prazo |
| Câmbio B | R$ 5.505 | Dentro do prazo | Elegível; aceita contraproposta de R$ 5.495 |
| Câmbio C | R$ 5.520 | Dentro do prazo | Elegível, custo maior |

A taxa simulada da NeuraMarket é R$ 5, informada antes da compra. O custo final é R$ 5.500. Essa tarifa específica substitui a comissão percentual apenas nos novos contratos deste caso; não altera contratos ou créditos existentes. O principal de câmbio não é receita da plataforma. Comparada à oferta C no mesmo cenário, a escolha custa R$ 25 menos, incluindo a mesma taxa de R$ 5 nas duas opções. Isso não prova vantagem sobre o mercado real.

Cada proposta discrimina conversão e encargos do cenário, além do total, destinatário, valor líquido em USD, prazo, validade, identificador e versão. O provedor calcula e autentica seus próprios termos. A IA compradora não pode inventar preços nem aprovar condições em nome de um fornecedor. A negociação é uma política de desconto configurada pelo fornecedor, sem alegação de negociação livre com bancos reais.

## Fluxo

1. O humano fornece a meta, o limite total e a autorização para agir sobre a carteira de teste cadastrada. Depois disso, apenas observa.
2. O comprador consulta o catálogo pelo MCP. Cada fornecedor responde usando sua política e disponibilidade. O mesmo pedido gera propostas estruturadas comparáveis.
3. O comprador elimina ofertas vencidas, sem cobertura, acima do orçamento ou fora do prazo. Compara o custo total das elegíveis. A indisponibilidade do provedor impede contratação sem evidência de preço válido.
4. Negocia dentro das condições permitidas. Antes de reservar, o auditor confere a proposta aceita e os limites. A aceitação fixa as condições e o identificador da operação; cotação expirada antes do aceite exige nova cotação.
5. O sistema reserva R$ 5.500 na carteira simulada. O fornecedor solicita a operação ao simulador de liquidação, usando uma chave que impede duplicação.
6. O simulador mantém a operação pendente e emite um registro autenticado do valor e da carteira de destino. O fornecedor entrega um comprovante estruturado ligado a esse registro.
7. O auditor consulta o registro diretamente e confere a identidade, a moeda, o valor líquido, o custo e o prazo. Um comprovante incorreto ou inconclusivo não libera a conclusão.
8. Após aprovação, uma transação única no simulador debita a reserva BRL, disponibiliza US$ 1.000 na carteira de destino e contabiliza a taxa da plataforma. A API devolve o recibo e a trilha. Repetir a chamada conserva os saldos.

Essa liquidação conjunta é uma regra do simulador. Uma integração real terá que seguir o processo de financiamento, execução e confirmação do parceiro. Não pressupor que uma instituição real entregue dólares antes de receber os reais.

## Cena de confiança

A falha deliberada, identificada na tela como teste, é um comprovante que declara US$ 990 para uma operação cujo registro pendente prevê US$ 1.000. O auditor acusa a divergência e mantém a reserva. O fornecedor corrige apenas o comprovante, conservando a mesma operação. O auditor repete a consulta e aprova. Só então o simulador conclui a movimentação uma vez.

O fornecedor não pode alterar o registro que o auditor consulta, aprovar o próprio trabalho ou modificar o contrato. Relato do fornecedor e hash do arquivo, isoladamente, não comprovam liquidação. Em caso de timeout depois de enviar uma operação, consultar o mesmo identificador antes de qualquer nova tentativa. Estado desconhecido permanece pendente. Antes da conclusão, cancelamento confirmado devolve a reserva; operação concluída não admite cancelamento por este fluxo.

## O que aparece no pitch

Uma entrada: objetivo e orçamento. Depois uma tela com ofertas, justificativa da escolha e custo total. A execução mostra comprador, fornecedor escolhido, auditor e estado da operação. O recibo apresenta valor disponível em USD, custo BRL e taxa NeuraMarket, com o selo permanente “Simulação financeira; instituições fictícias”.

A apresentação começa comparando a mesma tarefa conduzida pelo humano: pedir cotações, conferir custo e prazo, escolher e acompanhar. Em seguida, o cliente MCP fornece o objetivo e acompanha o resultado sem seleção ou aprovação manual intermediária.

## Cinco desafios

| Desafio | Prova de aceite |
| --- | --- |
| 01 | Objetivo inicia uma operação que conclui sem intervenção humana intermediária. |
| 02 | Fornecedores distintos respondem; prazo ou custo mudam a seleção sem escolha humana. |
| 03 | Orçamento inclui principal, encargos e taxa. Reserva, gasto, liberação e consumo de inferência ficam registrados separadamente. |
| 04 | Descoberta, contraproposta, contratação, consulta e recibo estão acessíveis pelo MCP/API. Mesma tarefa comparada no modo humano. |
| 05 | Decisões e condições têm versão. Comprovante inconsistente bloqueia a conclusão. Auditor consulta o registro do simulador; correção e repetição não duplicam a operação. |

## Implementação prevista

Reaproveitar autenticação MCP, catálogo, contratos imutáveis, auditoria e painel de eventos. Acrescentar capacidade `fx.convert.simulated.v1`, fornecedores com políticas separadas, propostas com validade e valores em centavos, carteiras BRL/USD próprias, simulador de liquidação e auditor específico. Não encaminhar esta tarefa ao executor de texto genérico nem ao navegador.

Ferramentas previstas: `quote_fx`, `negotiate_fx`, `hire_fx`, `get_fx_order` e `start_fx_mission`. A operação inicial exige autorização explícita para o simulador. As demais ferramentas respeitam a empresa autenticada, o orçamento e a chave de repetição. A IA interpreta e explica; as regras monetárias e os saldos são calculados em inteiros pelo serviço.

Provas obrigatórias: oferta expirada, cotação alterada, total acima do limite, moeda errada, destinatário errado, registro ausente, comprovante falso, repetição concorrente, isolamento entre empresas, timeout depois da execução, cancelamento e saldo insuficiente. Testar que orçamento e prazo diferentes alteram a escolha. Medir tokens reais quando informados e distinguir custo de inferência estimado da taxa cobrada.

## Referência de funcionamento e limites

A documentação da Wise distingue estimativas não autenticadas de cotações autenticadas utilizáveis na criação de transferências, com taxas, prazo e validade: https://docs.wise.com/guides/product/send-money/quotes . A Airwallex documenta cotações LockFX utilizadas por contas habilitadas em conversões posteriores: https://www.airwallex.com/docs/api/2024-04-30/transactional_fx/lockfx . Consultadas em 20/09/2026. São referências de arquitetura; não há integração, parceria ou autorização dessas empresas neste projeto.

O caso demonstra como um agente compra uma capacidade controlada por outro participante. Não demonstra exclusividade técnica frente a um assistente integrado, liquidez real, autorização para operar câmbio, adequação regulatória ou aceitação bancária do relatório.
