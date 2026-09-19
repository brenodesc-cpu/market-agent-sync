# NMK: colateral, reputação e receita

Segunda parte do contrato da NMK. A primeira, em [NMK](nmk-chain.md), define a criptografia, o
bloco e o registro. Esta define o que a moeda **faz** e como a plataforma ganha dinheiro.

Desenvolvida na branch `feat/guima-nmk-blockchain-ux`. Adoção é decisão do PR.

## 1. O problema que a moeda resolve

A tese do NeuraMarket é pagamento condicionado à verificação. Isso protege o comprador de
**pagar** por uma entrega ruim. Não protege ele de **perder tempo** com uma.

Na implementação atual, nada impede um fornecedor de publicar dezenas de ofertas vazias,
aceitar contratos, entregar qualquer coisa e não perder nada. A verificação bloqueia o
pagamento; ela não cria custo para quem desperdiça o tempo alheio.

A NMK existe para criar esse custo. Ela é **colateral**, não meio de pagamento.

## 2. O que a NMK é e o que ela não é

| É | Não é |
|---|---|
| Colateral travado para poder publicar uma oferta | Meio de pagamento entre empresas |
| Comprada da plataforma em reais, lastro 1:1 | Ativo negociado em mercado secundário |
| Resgatável pelo saldo não travado | Investimento, com promessa de rendimento |
| Registro assinado e conferível por qualquer um | Rede descentralizada |

A NMK **não é transferível entre empresas**. Uma empresa só consegue: comprar da plataforma,
travar como colateral, destravar, perder em queima comprovada, e resgatar o saldo livre.

Essa restrição é deliberada e tem duas razões. Primeira, o produto não precisa de transferência
livre: o pagamento dos contratos continua no ledger de créditos. Segunda, transferência livre
mais conversibilidade em dinheiro é o que transforma um crédito de uso fechado em ativo
virtual, com o regime da Lei 14.478/2022 e as obrigações de prestador de serviços de ativos
virtuais junto ao Banco Central. Promessa de rendimento pelo esforço de terceiros abre a
discussão de contrato de investimento coletivo na CVM.

Nada neste documento é parecer jurídico. O desenho escolhido é o de menor exposição, e a
equipe precisa confirmar com um advogado antes de qualquer operação real.

**Na demonstração, a compra é simulada e precisa estar rotulada como tal em toda tela.**

## 3. Operações

Quatro tipos de transação novos, somados aos seis já definidos:

- `STAKE`: da empresa para a carteira de colateral. `ref_kind = "offer"`, `ref_id` é a oferta.
  O saldo sai do disponível da empresa — o travamento é real, não um campo de status.
- `UNSTAKE`: da carteira de colateral de volta para a empresa. Só depois da carência e sem
  pedido em aberto naquela oferta.
- `SLASH`: da carteira de colateral para o **comprador prejudicado**. `ref_kind = "offer"`,
  `ref_id` é a oferta, e `payload_hash` é obrigatório: o SHA-256 do relatório de verificação
  que justificou a queima.
- `REDEEM`: da empresa para a tesouraria, quando ela resgata saldo livre em dinheiro. Reduz o
  total em circulação, mantendo o lastro 1:1.

`MINT` passa a aceitar `ref_kind = "purchase"`, ligando a emissão ao registro da compra.

Uma carteira de sistema nova, `kind = "stake"`, guarda o colateral. Como tesouraria e custódia,
ela tem `company_id` nulo e é única por índice parcial.

## 4. Por que o slash aponta para a prova

`payload_hash` obrigatório no `SLASH` é o que torna a queima auditável sem confiar na
plataforma. O relatório de verificação já é ancorado quando é produzido, então a cadeia do
argumento fica inteira e pública:

1. O relatório existe e está ancorado no bloco N, com aquele hash exato.
2. O `SLASH` no bloco M aponta para esse mesmo hash.
3. Quem quiser confere: lê o relatório, recalcula o hash, e verifica que a queima se refere a
   ele e que a decisão registrada é de reprovação.

Uma queima sem relatório correspondente é detectável. Uma queima que aponta para um relatório
aprovado é detectável. Isso é o oposto de "confie na plataforma".

## 5. Quanto é queimado

    queima = min(colateral travado na oferta, preço do contrato)

O dano ao comprador é limitado pelo que ele teria pago, então a queima também é. E ela nunca
pode passar do que foi travado.

**A queima vai integralmente para o comprador.** A plataforma não fica com nenhuma parte.

Essa escolha é de desenho, não de generosidade: se a plataforma lucrasse com queimas, ela
passaria a ter incentivo em ver entregas reprovadas, e o verificador independente deixaria de
ser suficiente como garantia. Receita da plataforma e resultado da verificação precisam ficar
sem nenhuma ligação.

## 6. Quando a queima acontece

Só em falha comprovada, e apenas nestes casos:

- A entrega foi reprovada e o limite de correções do contrato foi atingido.
- O prazo do contrato expirou sem nenhuma entrega registrada.

Não há queima por: verificação inconclusiva, cancelamento pelo comprador, entrega aprovada com
atraso dentro do prazo, ou disputa sem relatório. Um resultado inconclusivo já bloqueia o
pagamento; ele não é prova de falha do fornecedor e não pode custar colateral.

## 7. Colateral exigido e níveis de listagem

Cada oferta exige colateral proporcional ao que ela cobra:

    colateral exigido pela oferta = max(100, preço da oferta × 3)

Assim o colateral sempre cobre a queima máxima daquele contrato, e uma oferta cara exige mais
pele em jogo do que uma barata.

O total travado define quantas ofertas a empresa mantém publicadas ao mesmo tempo:

| Nível | Colateral travado | Ofertas publicadas |
| --- | --- | --- |
| Sem colateral | 0 | 0 |
| Base | 300 | 2 |
| Crescimento | 1.500 | 8 |
| Escala | 6.000 | 30 |

Uma oferta sem colateral suficiente **não pode receber pedidos**, e aparece com a mesma
sinalização que o projeto já usa para capacidade sem executor conectado. Isso estende uma
regra que já existe, não inventa outra.

## 8. Reputação derivada da cadeia

Reputação não é um campo no banco que alguém edita. É uma função pura sobre o histórico
assinado, e qualquer pessoa recalcula a partir do registro público:

- contratos liquidados e valor recebido: transações `TRANSFER` com `ref_kind = "order"`
  destinadas ao endereço da empresa;
- queimas sofridas e valor perdido: transações `SLASH` na oferta cujo `STAKE` veio daquele
  endereço;
- colateral ativo: `STAKE` menos `UNSTAKE` menos `SLASH` por oferta.

O marketplace mostra esses números ao lado de cada oferta, com o endereço, para que o comprador
possa conferir por conta própria no registro público.

Número de empresas cadastradas não é reputação e não deve ser exibido como se fosse.

## 9. Receita da plataforma

Duas fontes, e só estas:

1. **Taxa por contratação concluída.** É a receita principal e a única que cresce com trabalho
   real entregue. Os 10% presentes no código são exemplo técnico; o percentual comercial ainda
   precisa ser validado com compradores e fornecedores.
2. **Níveis de listagem por colateral.** Mais colateral travado, mais ofertas publicadas ao
   mesmo tempo. Cria demanda pela moeda sem cobrar mensalidade e sem cobrar por tentativa.

Deliberadamente **fora**: qualquer fatia da queima, e qualquer rendimento sobre o valor em
custódia durante a execução.

O painel precisa separar, e nunca somar num número só:

- valor total contratado;
- repasse aos fornecedores;
- receita da plataforma;
- colateral travado;
- colateral queimado devolvido a compradores.

Todos esses números são deriváveis do registro assinado, o que significa que os indicadores de
negócio também ficam auditáveis.

## 10. O que a moeda não faz pelo negócio

Emitir moeda não é receita: é passivo lastreado. A NMK não gera lucro por existir.

Ela reduz spam, dá consequência à falha e torna um fornecedor novo avaliável por evidência em
vez de promessa. Se isso aumentar o volume de contratações concluídas, a taxa por contratação
rende mais. Esse é o caminho inteiro entre a moeda e o lucro, e não existe outro.

Qualquer material que apresente a NMK como fonte de receita, ou como ativo com valorização
esperada, está errado e contradiz este documento.

## 11. Testes exigidos

Puros, sem banco, em `tests/economy.test.ts`:

1. Colateral exigido acompanha o preço e respeita o mínimo.
2. Nível de listagem correto em cada faixa e nas fronteiras exatas.
3. `STAKE` reduz o disponível e aparece como travado; `UNSTAKE` devolve.
4. Queima limitada ao menor entre colateral e preço, e nunca excede o travado.
5. `SLASH` sem `payload_hash` é rejeitado na validação da transação.
6. `SLASH` cujo `payload_hash` não corresponde a nenhum relatório ancorado é reportado pela
   auditoria de cobertura.
7. Reputação atribui a queima ao fornecedor dono do `STAKE` daquela oferta.
8. Reputação recalculada a partir do registro público bate com a derivada internamente.
9. Transferência direta entre duas empresas é rejeitada: a NMK não é meio de pagamento.
