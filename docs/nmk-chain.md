# NMK: moeda e cadeia próprias da NeuraMarket

Documento de contrato técnico. Escrito antes da implementação para que a cadeia, a
integração financeira e a interface sejam construídas contra as mesmas definições.

> **Mudança de direção registrada.** `docs/strategy.md` e `roadmap.md` declaram token e
> blockchain fora do escopo do hackathon. Esta camada é uma proposta desenvolvida na branch
> `feat/guima-nmk-blockchain-ux` e depende de aprovação no PR. O ledger de créditos atual
> (`accounts`, `ledger_entries`, `reserve_demo_order`, `settle_verified_order`) **continua
> sendo a fonte de verdade financeira e não é alterado.** A cadeia é uma camada aditiva de
> registro assinado, verificação e transparência, reconciliável contra esse ledger.

## 1. Unidade e paridade

A menor unidade da NMK é igual à unidade mínima dos créditos já existentes: 1 unit = 1 NMK.
Não há casas decimais e nenhuma conversão com ponto flutuante em nenhum ponto do sistema.
Valores trafegam como inteiros (`bigint` no banco, inteiro seguro em TypeScript).

Motivo: o README exige "valores inteiros em uma unidade mínima para evitar erros de
arredondamento", e a paridade 1:1 torna a reconciliação com `accounts` uma igualdade exata.

## 2. Identidade criptográfica

- Curva: **secp256k1**, ECDSA com digest SHA-256, disponível nativamente em `node:crypto`.
  Nenhuma dependência nova deve ser adicionada ao `package.json` por causa da cadeia.
- Chave pública serializada em DER/SPKI, representada em hex.
- Endereço: `nmk1` + `sha256(spki_der)` truncado em 20 bytes (40 hex) + 4 hex de checksum,
  onde o checksum é o prefixo de `sha256(<os 40 hex anteriores>)`.
  Total: `nmk1` seguido de 44 caracteres hex.
- `deriveAddress(publicKeyDerHex)` é determinística e `validateAddress` confere o checksum.
  Um endereço com checksum inválido é rejeitado antes de qualquer consulta ao banco.

## 3. Transação

Forma canônica: JSON com chaves em ordem alfabética, sem espaços, UTF-8. Essa string é o
único insumo do hash e da assinatura — nunca serialize o objeto de outra forma.

```json
{
  "amount": 0,
  "chain_id": "nmk-devnet-1",
  "from": null,
  "issued_at": "2026-09-19T00:00:00.000Z",
  "memo": "",
  "nonce": 0,
  "payload_hash": null,
  "ref_id": null,
  "ref_kind": null,
  "to": null,
  "type": "MINT"
}
```

Domínios: `amount` inteiro >= 0; `from`/`to` endereço ou `null`; `memo` até 200 caracteres;
`nonce` inteiro >= 0; `payload_hash` 64 hex ou `null`; `ref_kind` em
`genesis | order | delivery | report | treasury | null`; `type` em
`MINT | TRANSFER | FEE | RESERVE | RELEASE | ANCHOR`.

- `txid = sha256(canonical)` em hex.
- `signature` = ECDSA-SHA256 DER em hex sobre os bytes da forma canônica, produzida pela
  chave privada do endereço em `from`. Em `MINT`, `from` é `null` e a assinatura é do
  validador/tesouraria.
- `nonce` é estritamente crescente por endereço, começando em 0. Reuso de nonce é rejeitado.
- Regras por tipo:
  - `MINT`: `from` nulo, `to` obrigatório, `amount > 0`. Só a tesouraria assina.
  - `TRANSFER` e `FEE`: `from` e `to` obrigatórios e distintos, `amount > 0`.
  - `RESERVE` e `RELEASE`: `from` obrigatório, `to` é a conta de custódia, `amount > 0`.
  - `ANCHOR`: `amount = 0`, `to` nulo, `payload_hash` obrigatório. Não move saldo.
    É o registro de que um artefato (entrega ou relatório) existia com aquele conteúdo.

## 4. Bloco

Header canônico, mesmas regras de serialização:

```json
{
  "chain_id": "nmk-devnet-1",
  "height": 0,
  "merkle_root": "0000000000000000000000000000000000000000000000000000000000000000",
  "prev_hash": "0000000000000000000000000000000000000000000000000000000000000000",
  "sealed_at": "2026-09-19T00:00:00.000Z",
  "tx_count": 0,
  "validator": "nmk1..."
}
```

- `block_hash = sha256(canonical_header)`.
- Gênese: `height = 0`, `prev_hash` com 64 zeros.
- Merkle: folhas são os `txid` em bytes, na ordem do bloco; nós internos são
  `sha256(esquerda || direita)`; um nível com contagem ímpar duplica o último nó.
  Bloco sem transações tem `merkle_root` com 64 zeros.
- Prova de inclusão: lista de `{ position, hash }` com `position` em `left | right`, da folha
  até a raiz. `verifyMerkleProof(txid, proof, root)` precisa ser verificável sem banco.
- Consenso: autoridade única (PoA com um validador). Documente como autoridade única —
  **não** descreva a cadeia como descentralizada em nenhum texto da interface.

## 5. Validação da cadeia

`validateChain(blocks, txsByHeight)` confere, e falha fechado em qualquer violação:

1. Alturas sequenciais a partir de 0 e `prev_hash` encadeado corretamente.
2. `block_hash` recalculado igual ao armazenado.
3. `merkle_root` recalculado a partir dos txids ordenados igual ao armazenado.
4. `tx_count` igual à quantidade real de transações do bloco.
5. Todo `txid` recalculado igual ao armazenado, e único em toda a cadeia.
6. Toda assinatura válida, e o endereço `from` derivado da chave pública que assinou.
7. Nonce por endereço estritamente crescente a partir de 0, sem buraco nem repetição.
8. Nenhum saldo negativo em nenhuma altura, aplicando as transações em ordem.
9. `chain_id` idêntico em todos os blocos e transações.

A função devolve `{ valid, height, issues }`, onde cada issue traz
`{ height, txid, code, detail }`. Ela é pura e não pode importar nada do Supabase.

## 6. Tabelas (migration `0008_nmk_chain.sql`)

- `chain_blocks(height integer PK, chain_id text, prev_hash text, merkle_root text,
  block_hash text UNIQUE, tx_count integer, validator text, sealed_at timestamptz,
  created_at timestamptz)`
- `chain_transactions(id uuid PK, txid text UNIQUE, chain_id text, type text,
  from_address text, to_address text, amount_units bigint CHECK >= 0,
  nonce integer, ref_kind text, ref_id text, payload_hash text, memo text,
  issued_at timestamptz, signature text, canonical text, block_height integer REFERENCES
  chain_blocks(height), block_index integer, status text em pending/sealed,
  idempotency_key text UNIQUE, created_at timestamptz)`
- `chain_wallets(id uuid PK, company_id uuid UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  address text UNIQUE, public_key text, key_version integer, created_at timestamptz)`
- `chain_wallet_keys(wallet_id uuid PK REFERENCES chain_wallets(id) ON DELETE CASCADE,
  encrypted_private_key text, iv text, auth_tag text, created_at timestamptz)`
- `chain_anchors(id uuid PK, block_height integer REFERENCES chain_blocks(height), network text,
  external_tx_hash text, status text em unavailable/pending/submitted/confirmed/failed,
  safe_message text, checked_at timestamptz, created_at timestamptz)`

RLS obrigatória:

- `chain_blocks`, `chain_transactions`, `chain_anchors`: `SELECT` liberado para `anon` e
  `authenticated`. É um registro público — transparência é o objetivo declarado.
  `INSERT`, `UPDATE` e `DELETE` revogados de `anon` e `authenticated`: só o servidor escreve.
- `chain_wallets`: `SELECT` apenas para membros da empresa, via `public.is_company_member`.
- `chain_wallet_keys`: **nenhuma política.** RLS habilitada e sem policy, todos os privilégios
  revogados de `anon` e `authenticated`. A chave cifrada só é legível pelo service role.
- Blocos e transações seladas são imutáveis: trigger com `public.prevent_immutable_changes()`
  em `UPDATE` e `DELETE`, exatamente como as migrations anteriores fazem.

## 7. Custódia da chave

Custodial no servidor, decisão registrada: o fluxo agente-para-agente do projeto precisa
executar sem uma pessoa clicando, então a assinatura acontece no backend.

- Chave privada cifrada com AES-256-GCM. A chave de cifra vem de `NMK_WALLET_SECRET`
  (32 bytes em hex ou base64), lida **somente** no servidor. `iv` aleatório de 12 bytes por
  registro e `auth_tag` persistidos separadamente.
- Sem `NMK_WALLET_SECRET` configurada, a criação de carteira falha com mensagem segura e a
  interface mostra pendência de configuração. Nunca gere uma chave derivada de valor padrão.
- A chave privada nunca aparece em resposta HTTP, log, mensagem de erro ou tipo exportado
  para o cliente. A leitura para o cliente devolve apenas endereço e chave pública.
- A interface precisa rotular a carteira como custodial da plataforma.

## 8. Integração com a liquidação existente

`reserve_demo_order` e `settle_verified_order` **não são alteradas** — outras pessoas estão
commitando sobre elas e há testes dependendo da assinatura atual. Em vez disso, a migration
adiciona dois invólucros que executam numa única transação do banco:

```
public.reserve_demo_order_nmk(_order_id uuid, _offer_version_id uuid,
                              _idempotency_key text, _chain_txs jsonb)
public.settle_verified_order_nmk(_order_id uuid, _idempotency_key text, _chain_txs jsonb)
```

Cada invólucro chama a função original, e só se ela tiver sucesso insere as transações
assinadas recebidas em `chain_transactions` com `status = 'pending'`. Como o corpo de uma
função é uma única transação, liquidação e registro na cadeia commitam juntos ou nenhum dos
dois acontece — a cadeia não pode divergir do ledger.

- `_chain_txs` é um array de objetos já assinados pelo servidor. O invólucro valida formato,
  `chain_id` e presença de `idempotency_key`; não valida assinatura (SQL não faz ECDSA).
- `idempotency_key` deriva do pedido, por exemplo `order:<uuid>:settlement:transfer`.
  Uma segunda chamada colide na constraint `UNIQUE` e não duplica lançamento.
- Se o invólucro receber `_chain_txs` nulo ou vazio, ele se comporta como a função original.

Eventos registrados na cadeia, por pedido:

| Momento | Transações emitidas |
| --- | --- |
| Contratação com reserva | `RESERVE` do comprador para a custódia |
| Entrega registrada | `ANCHOR` com `payload_hash` igual a `deliveries.sha256` |
| Verificação concluída | `ANCHOR` com `payload_hash` igual ao sha256 do relatório canônico |
| Liquidação aprovada | `TRANSFER` custódia para fornecedor, `FEE` custódia para plataforma |
| Cancelamento ou expiração | `RELEASE` da custódia de volta ao comprador |

A soma dos saldos derivados da cadeia precisa bater com `accounts` para toda empresa com
carteira. Exponha essa comparação numa função de reconciliação, e mostre divergência como
erro visível — não a esconda.

## 9. Âncora em rede pública

`src/lib/chain/anchor.server.ts` define a interface e o registro de estado. Sem
`NMK_ANCHOR_RPC_URL` e `NMK_ANCHOR_ACCOUNT` configurados, o status é `unavailable` com
mensagem segura, e a interface mostra isso como pendência de configuração, conforme a regra
do README para integrações ausentes.

Não simule uma âncora. Não invente hash de transação externa. Não declare que a cadeia está
publicada numa rede pública enquanto `chain_anchors.status` não for `confirmed`.
Assinar transação EVM exige keccak-256 e RLP, que `node:crypto` não fornece; a escolha do
driver e da dependência fica registrada como próximo passo, não como entrega.

## 10. Testes exigidos

Em `tests/chain.test.ts`, executável com `node --experimental-strip-types --test` e **sem
banco de dados**:

1. Endereço determinístico, checksum válido, e rejeição de endereço alterado em um caractere.
2. Forma canônica estável independente da ordem de inserção das chaves do objeto.
3. Assinatura válida aceita; assinatura de outra chave rejeitada; transação com um byte
   alterado rejeitada.
4. Merkle root conhecida para conjunto fixo, prova de inclusão válida, e prova forjada
   rejeitada.
5. Cadeia de vários blocos validada; adulteração de `prev_hash`, de `merkle_root`, de um
   valor e de um nonce detectada, cada caso com o `code` correspondente em `issues`.
6. Nonce repetido rejeitado. Saldo insuficiente rejeitado.
7. Cifra da chave privada: ida e volta correta, e falha de `auth_tag` ao alterar o texto
   cifrado.

## 11. Superfície de módulos

Nomes fixos: a interface e as funções de servidor são escritas contra eles em paralelo.

`src/lib/chain/types.ts` — tipos `ChainTransaction`, `ChainBlock`, `ChainWalletPublic`
(endereço, chave pública, empresa), `ChainValidation`, `ChainIssue`, `MerkleProofStep`,
`AnchorState`.

`src/lib/chain/keys.ts` — `generateKeyPair`, `deriveAddress`, `validateAddress`,
`signPayload`, `verifyPayload`.

`src/lib/chain/tx.ts` — `canonicalize`, `txid`, `buildTransaction`, `verifyTransaction`.

`src/lib/chain/merkle.ts` — `merkleRoot`, `merkleProof`, `verifyMerkleProof`.

`src/lib/chain/block.ts` — `canonicalizeHeader`, `blockHash`, `GENESIS_PREV_HASH`.

`src/lib/chain/validate.ts` — `validateChain`, `deriveBalances`.

`src/lib/chain/node.server.ts` — `ensureGenesis`, `sealPendingBlock`, `getChainHead`,
`listBlocks`, `getBlock`, `listTransactions`, `getTransaction`, `verifyStoredChain`,
`reconcileWithLedger`, `submitSignedTransactions`.

`src/lib/chain/wallet.server.ts` — `ensureCompanyWallet`, `getCompanyWalletPublic`,
`signAsCompany`, `treasuryAddress`.

`src/lib/chain/anchor.server.ts` — `anchorStatus`, `requestAnchor`.

Os arquivos sem sufixo `.server` são puros: apenas `node:crypto`, sem Supabase, sem
`process.env`, sem rede. Os testes dependem dessa separação.
