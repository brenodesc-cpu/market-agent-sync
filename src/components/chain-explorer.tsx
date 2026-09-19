import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Blocks,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Coins,
  FileCheck2,
  Link2,
  Loader2,
  ScrollText,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import type { ChainTransaction } from "@/lib/chain/types";
import {
  auditChain,
  getBlockDetails,
  getTransactionDetails,
  type ChainOverview,
} from "@/lib/chain.functions";
import "../chain.css";

type Props = {
  data: ChainOverview;
  selectedHeight?: number | undefined;
  selectedTxid?: string | undefined;
};

const TX_LABEL: Record<string, string> = {
  MINT: "Emissão",
  TRANSFER: "Transferência",
  FEE: "Taxa da plataforma",
  RESERVE: "Reserva",
  RELEASE: "Devolução",
  ANCHOR: "Registro de conteúdo",
};

const TX_ICON: Record<string, typeof Coins> = {
  MINT: Coins,
  TRANSFER: Coins,
  FEE: Coins,
  RESERVE: ShieldCheck,
  RELEASE: Undo2,
  ANCHOR: FileCheck2,
};

const REF_LABEL: Record<string, string> = {
  order: "Pedido",
  delivery: "Entrega",
  report: "Relatório de verificação",
  treasury: "Tesouraria",
  genesis: "Gênese",
};

function short(value: string, head = 10, tail = 8) {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function when(value: string) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

function amount(units: number) {
  return `${units.toLocaleString("pt-BR")} NMK`;
}

// Entrance is opt-in per block and degrades to plain visible content: the hook keeps the
// element visible until it has confirmed an observer, so server rendering stays readable.
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reveal = useScrollReveal<HTMLDivElement>(delay);
  return (
    <div
      ref={reveal.ref}
      className={className ? `${className} ${reveal.className}` : reveal.className}
      style={reveal.style}
    >
      {children}
    </div>
  );
}

export function ChainExplorer({ data, selectedHeight, selectedTxid }: Props) {
  const navigate = useNavigate();
  const [auditOpen, setAuditOpen] = useState(false);

  const audit = useMutation({
    mutationFn: () => auditChain(),
    onSuccess: () => setAuditOpen(true),
  });

  const block = useQuery({
    queryKey: ["nmk-block", selectedHeight],
    queryFn: () => getBlockDetails({ data: { height: selectedHeight as number } }),
    enabled: selectedHeight !== undefined,
  });

  const tx = useQuery({
    queryKey: ["nmk-tx", selectedTxid],
    queryFn: () => getTransactionDetails({ data: { txid: selectedTxid as string } }),
    enabled: Boolean(selectedTxid),
  });

  const openBlock = (height: number) =>
    void navigate({ to: "/explorer", search: { bloco: height } });
  const openTx = (txid: string) => void navigate({ to: "/explorer", search: { tx: txid } });
  const clear = () => void navigate({ to: "/explorer", search: {} });

  if (!data.setup.applied)
    return (
      <main className="nmk">
        <ExplorerHeader head={null} chainId={null} />
        <section className="nmk-shell">
          <div className="nmk-pending">
            <CircleAlert size={22} />
            <div>
              <h2>Registro ainda não publicado neste ambiente</h2>
              <p>{data.setup.message}</p>
              <p className="nmk-muted">
                Enquanto a migration não for aplicada, os contratos continuam sendo liquidados pelo
                ledger de créditos, que permanece a fonte de verdade financeira.
              </p>
            </div>
          </div>
        </section>
      </main>
    );

  return (
    <main className="nmk">
      <ExplorerHeader head={data.head} chainId={data.blocks[0]?.chain_id ?? null} />

      <section className="nmk-shell">
        <Reveal className="nmk-strip">
          <Stat label="Altura da cadeia" value={data.head ? `#${data.head.height}` : "—"} />
          <Stat label="Blocos selados" value={String(data.blocks.length)} />
          <Stat
            label="Transações aguardando selo"
            value={String(data.pendingCount)}
            hint={data.pendingCount > 0 ? "Entram no próximo bloco" : "Nada pendente"}
          />
          <Stat
            label="Âncora em rede pública"
            value={data.anchor?.status === "confirmed" ? "Confirmada" : "Não configurada"}
            hint={data.anchor?.safe_message ?? "Pendência de configuração"}
            warn={data.anchor?.status !== "confirmed"}
          />
        </Reveal>

        <Reveal className="nmk-audit" delay={80}>
          <div>
            <h2>
              <ShieldCheck size={17} /> Conferir o registro
            </h2>
            <p>
              A conferência recalcula todo hash de bloco, toda raiz de Merkle e toda assinatura
              desde a gênese, e compara os saldos derivados da cadeia com o ledger de créditos. O
              resultado vem do mesmo código que um auditor externo pode rodar.
            </p>
          </div>
          <button
            className="nmk-button nm-interactive"
            onClick={() => audit.mutate()}
            disabled={audit.isPending}
          >
            {audit.isPending ? (
              <>
                <Loader2 size={15} className="nmk-spin" /> Conferindo
              </>
            ) : (
              <>
                <ShieldCheck size={15} /> Conferir agora
              </>
            )}
          </button>
        </Reveal>

        {audit.isError && (
          <p className="nmk-error nm-enter">
            Não foi possível conferir o registro agora. Tente novamente em alguns segundos.
          </p>
        )}

        {auditOpen && audit.data && <AuditResult result={audit.data} />}

        {selectedTxid ? (
          <TransactionPanel query={tx} onBack={clear} />
        ) : selectedHeight !== undefined ? (
          <BlockPanel query={block} onBack={clear} onOpenTx={openTx} />
        ) : (
          <>
            <BlockList blocks={data.blocks} onOpen={openBlock} />
            <TransactionList
              transactions={data.transactions}
              onOpen={openTx}
              onOpenBlock={openBlock}
            />
          </>
        )}
      </section>
    </main>
  );
}

function ExplorerHeader({
  head,
  chainId,
}: {
  head: ChainOverview["head"];
  chainId: string | null;
}) {
  return (
    <header className="nmk-head">
      <Link to="/" className="nmk-back">
        <ArrowLeft size={15} /> NeuraMarket
      </Link>
      <div className="nmk-title">
        <span className="nmk-kicker">
          <Blocks size={13} /> Registro NMK
        </span>
        <h1>Cada contrato, entrega e pagamento em um registro assinado</h1>
        <p>
          A NMK é a moeda desta rede e a cadeia guarda a prova de cada etapa: o que foi contratado,
          o conteúdo exato que foi entregue, o que a verificação observou e quanto foi pago. O
          registro é público e conferível por quem quiser.
        </p>
        <div className="nmk-head-meta">
          <span className="nmk-chip">
            <Link2 size={12} /> {chainId ?? "nmk-devnet-1"}
          </span>
          <span
            className="nmk-chip nmk-chip-warn"
            title="A cadeia é mantida por um validador único"
          >
            Autoridade única
          </span>
          {head && <span className="nmk-chip">Último bloco selado em {when(head.sealedAt)}</span>}
        </div>
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="nmk-stat">
      <span>{label}</span>
      <strong className={warn ? "nmk-stat-warn" : undefined}>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function AuditResult({ result }: { result: Awaited<ReturnType<typeof auditChain>> }) {
  const divergent = result.reconciliation.filter(
    (row) =>
      row.ledgerUnits !== row.chainUnits ||
      (row.reservedLedgerUnits !== undefined && row.reservedLedgerUnits !== row.reservedChainUnits),
  );
  const ok =
    result.validation.valid && divergent.length === 0 && result.missingAnchors.length === 0;
  return (
    <div className={`nmk-audit-result nm-enter ${ok ? "is-ok" : "is-bad"}`}>
      <p className="nmk-audit-verdict">
        {ok ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
        {ok
          ? `Registro íntegro até o bloco #${result.validation.height}. Os saldos derivados da cadeia batem com o ledger.`
          : "A conferência encontrou divergências. Elas estão listadas abaixo e não devem ser ignoradas."}
      </p>
      <small className="nmk-muted">Conferido em {when(result.checkedAt)}</small>

      {result.validation.issues.length > 0 && (
        <ul className="nmk-issues">
          {result.validation.issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`}>
              <code>{issue.code}</code>
              <span>
                Bloco #{issue.height}
                {issue.txid ? ` · transação ${short(issue.txid)}` : ""}
              </span>
              <p>{issue.detail}</p>
            </li>
          ))}
        </ul>
      )}

      {divergent.length > 0 && (
        <ul className="nmk-issues">
          {divergent.map((row) => (
            <li key={row.companyId}>
              <code>ledger_divergente</code>
              <span>Empresa {short(row.companyId, 8, 6)}</span>
              <p>
                Ledger registra {amount(row.ledgerUnits)} e a cadeia deriva {amount(row.chainUnits)}
                .
                {row.reservedLedgerUnits !== undefined &&
                  ` Reservado: ${amount(row.reservedLedgerUnits)} no ledger e ${amount(
                    row.reservedChainUnits ?? 0,
                  )} na cadeia.`}
              </p>
            </li>
          ))}
        </ul>
      )}

      {result.missingAnchors.length > 0 && (
        <ul className="nmk-issues">
          {result.missingAnchors.map((row) => (
            <li key={`${row.orderId}-${row.kind}-${row.version}`}>
              <code>ancora_ausente</code>
              <span>
                Pedido {short(row.orderId, 8, 6)} · versão {row.version}
              </span>
              <p>
                {row.kind === "delivery"
                  ? "A entrega existe no banco mas não tem registro de conteúdo na cadeia."
                  : "O relatório de verificação existe no banco mas não tem registro na cadeia."}{" "}
                Uma âncora não move saldo, então essa ausência não aparece na comparação de saldos:
                ela só é encontrada conferindo os artefatos um a um, o que foi feito aqui.
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BlockList({
  blocks,
  onOpen,
}: {
  blocks: ChainOverview["blocks"];
  onOpen: (h: number) => void;
}) {
  if (blocks.length === 0)
    return (
      <Empty
        icon={<Blocks size={20} />}
        title="Nenhum bloco selado ainda"
        detail="O primeiro bloco é selado quando a primeira contratação registra sua reserva na cadeia."
      />
    );
  return (
    <section className="nmk-section">
      <h2 className="nmk-section-title">
        <Blocks size={16} /> Blocos recentes
      </h2>
      <ul className="nmk-blocks nm-stagger">
        {blocks.map((b) => (
          <li key={b.height}>
            <button className="nmk-block nm-interactive" onClick={() => onOpen(b.height)}>
              <span className="nmk-block-height">#{b.height}</span>
              <div>
                <strong>
                  {b.tx_count} {b.tx_count === 1 ? "transação" : "transações"}
                </strong>
                <code>{short(b.block_hash, 14, 10)}</code>
                <small>{when(b.sealed_at)}</small>
              </div>
              <ChevronRight size={16} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TransactionList({
  transactions,
  onOpen,
  onOpenBlock,
}: {
  transactions: ChainTransaction[];
  onOpen: (txid: string) => void;
  onOpenBlock: (height: number) => void;
}) {
  if (transactions.length === 0)
    return (
      <Empty
        icon={<ScrollText size={20} />}
        title="Nenhuma transação registrada"
        detail="Contrate uma oferta no marketplace para ver a reserva, o registro da entrega e a liquidação aparecerem aqui."
      />
    );
  return (
    <section className="nmk-section">
      <h2 className="nmk-section-title">
        <ScrollText size={16} /> Transações recentes
      </h2>
      <ul className="nmk-txs nm-stagger">
        {transactions.map((t) => {
          const Icon = TX_ICON[t.type] ?? Coins;
          return (
            <li key={t.txid}>
              <button className="nmk-tx nm-interactive" onClick={() => onOpen(t.txid)}>
                <span className={`nmk-tx-icon nmk-tx-${t.type.toLowerCase()}`}>
                  <Icon size={15} />
                </span>
                <div className="nmk-tx-main">
                  <strong>{TX_LABEL[t.type] ?? t.type}</strong>
                  <code>{short(t.txid, 12, 10)}</code>
                </div>
                <div className="nmk-tx-value">
                  {t.type === "ANCHOR" ? (
                    <span className="nmk-muted">sem valor</span>
                  ) : (
                    <strong>{amount(t.amount_units)}</strong>
                  )}
                  {t.status === "pending" ? (
                    <span className="nmk-chip nmk-chip-warn">aguardando selo</span>
                  ) : (
                    <button
                      className="nmk-linkish"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (t.block_height !== null) onOpenBlock(t.block_height);
                      }}
                    >
                      bloco #{t.block_height}
                    </button>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BlockPanel({
  query,
  onBack,
  onOpenTx,
}: {
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof getBlockDetails>>>>;
  onBack: () => void;
  onOpenTx: (txid: string) => void;
}) {
  if (query.isPending) return <PanelSkeleton onBack={onBack} />;
  if (query.isError || !query.data)
    return (
      <Empty
        icon={<CircleAlert size={20} />}
        title="Bloco não encontrado"
        detail="Esse bloco não existe no registro, ou a cadeia ainda não chegou nessa altura."
        onBack={onBack}
      />
    );

  const { block, transactions } = query.data;
  return (
    <section className="nmk-panel nm-enter">
      <button className="nmk-back" onClick={onBack}>
        <ArrowLeft size={15} /> Voltar ao registro
      </button>
      <h2>Bloco #{block.height}</h2>
      <dl className="nmk-facts">
        <Fact label="Hash do bloco" value={block.block_hash} mono />
        <Fact label="Hash do bloco anterior" value={block.prev_hash} mono />
        <Fact label="Raiz de Merkle" value={block.merkle_root} mono />
        <Fact label="Validador" value={block.validator} mono />
        <Fact label="Transações" value={String(block.tx_count)} />
        <Fact label="Selado em" value={when(block.sealed_at)} />
      </dl>
      <TransactionList transactions={transactions} onOpen={onOpenTx} onOpenBlock={() => {}} />
    </section>
  );
}

function TransactionPanel({
  query,
  onBack,
}: {
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof getTransactionDetails>>>>;
  onBack: () => void;
}) {
  if (query.isPending) return <PanelSkeleton onBack={onBack} />;
  if (query.isError || !query.data)
    return (
      <Empty
        icon={<CircleAlert size={20} />}
        title="Transação não encontrada"
        detail="Confira o identificador. Ele tem 64 caracteres hexadecimais."
        onBack={onBack}
      />
    );

  const { transaction: t, block, proof, proofValid } = query.data;
  return (
    <section className="nmk-panel nm-enter">
      <button className="nmk-back" onClick={onBack}>
        <ArrowLeft size={15} /> Voltar ao registro
      </button>
      <h2>{TX_LABEL[t.type] ?? t.type}</h2>
      <dl className="nmk-facts">
        <Fact label="Identificador" value={t.txid} mono />
        {t.type !== "ANCHOR" && <Fact label="Valor" value={amount(t.amount_units)} />}
        {t.from_address && <Fact label="Origem" value={t.from_address} mono />}
        {t.to_address && <Fact label="Destino" value={t.to_address} mono />}
        {t.payload_hash && <Fact label="Conteúdo registrado" value={t.payload_hash} mono />}
        {t.ref_kind && (
          <Fact
            label="Referência"
            value={`${REF_LABEL[t.ref_kind] ?? t.ref_kind}${t.ref_id ? ` ${t.ref_id}` : ""}`}
          />
        )}
        <Fact label="Assinatura" value={t.signature} mono />
        <Fact label="Emitida em" value={when(t.issued_at)} />
        <Fact
          label="Situação"
          value={t.status === "sealed" ? `Selada no bloco #${t.block_height}` : "Aguardando selo"}
        />
      </dl>

      {t.payload_hash && (
        <p className="nmk-note">
          Esse valor é o SHA-256 do conteúdo entregue ou do relatório de verificação. Ele prova que
          aquele conteúdo exato existia quando a transação foi registrada. Ele não afirma nada sobre
          a qualidade do conteúdo — isso é papel do relatório de verificação.
        </p>
      )}

      {proof && block && (
        <div className={`nmk-proof ${proofValid ? "is-ok" : "is-bad"}`}>
          <p>
            {proofValid ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
            {proofValid
              ? "Prova de inclusão conferida: esta transação está na raiz de Merkle do bloco."
              : "A prova de inclusão não fechou com a raiz de Merkle do bloco."}
          </p>
          <ol>
            <li>
              <span>folha</span>
              <code>{short(t.txid, 16, 12)}</code>
            </li>
            {proof.map((step, index) => (
              <li key={`${step.hash}-${index}`}>
                <span>{step.position === "left" ? "irmão à esquerda" : "irmão à direita"}</span>
                <code>{short(step.hash, 16, 12)}</code>
              </li>
            ))}
            <li>
              <span>raiz</span>
              <code>{short(block.merkle_root, 16, 12)}</code>
            </li>
          </ol>
        </div>
      )}
    </section>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="nmk-fact">
      <dt>{label}</dt>
      <dd className={mono ? "nmk-mono" : undefined}>{value}</dd>
    </div>
  );
}

function PanelSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <section className="nmk-panel">
      <button className="nmk-back" onClick={onBack}>
        <ArrowLeft size={15} /> Voltar ao registro
      </button>
      <div className="nm-skeleton" style={{ height: 26, width: "40%" }} />
      <div className="nmk-facts">
        {[0, 1, 2, 3, 4].map((i) => (
          <div className="nm-skeleton" key={i} style={{ height: 40, width: "100%" }} />
        ))}
      </div>
    </section>
  );
}

function Empty({
  icon,
  title,
  detail,
  onBack,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  onBack?: () => void;
}) {
  return (
    <section className="nmk-empty nm-enter">
      <span className="nmk-empty-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{detail}</p>
      {onBack ? (
        <button className="nmk-button nm-interactive" onClick={onBack}>
          <ArrowLeft size={15} /> Voltar ao registro
        </button>
      ) : (
        <Link to="/studio" search={{ view: "market" }} className="nmk-button nm-interactive">
          Ver o marketplace <ChevronRight size={15} />
        </Link>
      )}
    </section>
  );
}
