import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, KeyRound, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { createCompanyWallet, getCompanyWallet } from "@/lib/chain.functions";
import "../chain.css";

type Props = { companyId: string; companyName: string };

// The address is the company's identity on the record. Custody of the signing key stays with
// the platform so an agent can settle without a person clicking, and the panel says so plainly
// rather than letting the word "carteira" imply the company holds its own key.
export function NmkWallet({ companyId, companyName }: Props) {
  const wallet = useQuery({
    queryKey: ["nmk-wallet", companyId],
    queryFn: () => getCompanyWallet({ data: { companyId } }),
    retry: false,
  });

  const create = useMutation({
    mutationFn: () => createCompanyWallet({ data: { companyId } }),
    onSuccess: (created) => wallet.refetch().catch(() => created),
  });

  if (wallet.isPending)
    return (
      <div className="nmk-wallet">
        <span className="nm-skeleton" style={{ width: "45%", height: 18 }} />
        <span className="nm-skeleton" style={{ width: "100%", height: 34 }} />
      </div>
    );

  if (wallet.isError)
    return (
      <div className="nmk-wallet nmk-wallet-pending">
        <KeyRound size={16} />
        <p>
          O registro NMK ainda não está disponível neste ambiente, então {companyName} não tem
          endereço na cadeia. Os saldos acima continuam válidos: o ledger de créditos é a fonte de
          verdade financeira.
        </p>
      </div>
    );

  if (!wallet.data)
    return (
      <div className="nmk-wallet nmk-wallet-empty">
        <div>
          <strong>
            <Wallet size={15} /> Sem endereço no registro NMK
          </strong>
          <p>
            Criar o endereço permite que as reservas, os registros de entrega e as liquidações desta
            empresa apareçam no registro público, conferíveis por qualquer pessoa.
          </p>
        </div>
        <button
          className="nmk-button nm-interactive"
          onClick={() => create.mutate()}
          disabled={create.isPending}
        >
          {create.isPending ? (
            <>
              <Loader2 size={15} className="nmk-spin" /> Criando
            </>
          ) : (
            <>
              <KeyRound size={15} /> Criar endereço
            </>
          )}
        </button>
        {create.isError && (
          <p className="nmk-error nm-enter">
            Não foi possível criar o endereço. O servidor precisa do segredo de cifra da carteira
            configurado para guardar a chave.
          </p>
        )}
      </div>
    );

  return (
    <div className="nmk-wallet">
      <div className="nmk-wallet-head">
        <strong>
          <Wallet size={15} /> Endereço no registro NMK
        </strong>
        <Link to="/explorer" className="nmk-linkish">
          ver o registro <ArrowUpRight size={12} />
        </Link>
      </div>
      <code className="nmk-wallet-address">{wallet.data.address}</code>
      <p className="nmk-wallet-note">
        <ShieldCheck size={13} />
        Carteira custodiada pela plataforma: a chave que assina fica cifrada no servidor, para que
        os agentes liquidem sem depender de alguém clicar. A cadeia é mantida por um validador
        único, não é uma rede descentralizada.
      </p>
    </div>
  );
}
