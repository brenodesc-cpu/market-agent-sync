import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Download, FileJson, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type OfferFields = {
  name: string;
  capability: string;
  price: string;
  input: string;
  delivery: string;
  criteria: string;
};

type OfferDraft = {
  schemaVersion: 1;
  status: "local_draft";
  service: {
    name: string;
    capability: string;
    price: { amount: number; currency: "simulated_credits" };
    expectedInput: string;
    expectedDelivery: string;
    acceptanceCriteria: string[];
  };
};

type ServiceOfferDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const initialFields: OfferFields = {
  name: "",
  capability: "",
  price: "",
  input: "",
  delivery: "",
  criteria: "",
};

const inputClassName =
  "border-[#ded4ed] bg-white text-[#241833] placeholder:text-[#7c7188] focus-visible:ring-[#8238e6]";

export function ServiceOfferDialog({ open, onOpenChange }: ServiceOfferDialogProps) {
  const id = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [fields, setFields] = useState<OfferFields>(initialFields);
  const [errors, setErrors] = useState<Partial<Record<keyof OfferFields, string>>>({});
  const [draft, setDraft] = useState<OfferDraft | null>(null);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      if (content.current) content.current.scrollTop = 0;
      if (draft) summary.current?.focus();
      else nameInput.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, draft]);

  function updateField(key: keyof OfferFields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setDraft(null);
  }

  function prepareDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof OfferFields, string>> = {};
    const keys = Object.keys(fields) as (keyof OfferFields)[];
    for (const key of keys) {
      if (!fields[key].trim()) nextErrors[key] = "Preencha este campo.";
    }
    const amount = Number(fields.price);
    if (!Number.isFinite(amount) || amount <= 0) {
      nextErrors.price = "Informe um preço maior que zero.";
    }
    const criteria = fields.criteria
      .split(/\r?\n/)
      .map((criterion) => criterion.trim())
      .filter(Boolean);
    if (criteria.length === 0) {
      nextErrors.criteria = "Informe pelo menos um critério objetivo.";
    }
    setErrors(nextErrors);
    const firstInvalid = keys.find((key) => nextErrors[key]);
    if (firstInvalid) {
      document.getElementById(`${id}-${firstInvalid}`)?.focus();
      return;
    }
    setDraft({
      schemaVersion: 1,
      status: "local_draft",
      service: {
        name: fields.name.trim(),
        capability: fields.capability.trim(),
        price: { amount, currency: "simulated_credits" },
        expectedInput: fields.input.trim(),
        expectedDelivery: fields.delivery.trim(),
        acceptanceCriteria: criteria,
      },
    });
  }

  function downloadDraft() {
    if (!draft) return;
    const blob = new Blob([JSON.stringify(draft, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "neuramarket-oferta-rascunho.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function fieldError(key: keyof OfferFields) {
    return errors[key] ? (
      <p id={`${id}-${key}-error`} className="text-sm text-[#ad254d]" role="alert">
        {errors[key]}
      </p>
    ) : null;
  }

  const textFields = [
    {
      key: "capability",
      label: "O que seu agente faz?",
      placeholder: "Ex.: extrai informações de notas fiscais e devolve uma planilha.",
      maxLength: 1200,
    },
    {
      key: "input",
      label: "Entrada esperada",
      placeholder: "Ex.: até 10 arquivos PDF de notas fiscais, com texto legível.",
      maxLength: 1200,
    },
    {
      key: "delivery",
      label: "Entrega esperada",
      placeholder: "Ex.: arquivo CSV com emitente, data, número e valor de cada nota.",
      maxLength: 1200,
    },
    {
      key: "criteria",
      label: "Critérios objetivos de aceitação",
      placeholder:
        "Uma linha por critério. Ex.:\nCSV contém uma linha por nota.\nTodas as linhas incluem data e valor.",
      maxLength: 4000,
    },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={content}
        className="max-h-[90dvh] w-[calc(100%-24px)] max-w-2xl overflow-y-auto rounded-2xl border-[#e8def4] bg-white p-5 text-[#241833] sm:p-8"
      >
        <DialogHeader className="pr-6 text-left">
          <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#8238e6]">
            <FileJson className="size-4" aria-hidden="true" />
            Rascunho local
          </span>
          <DialogTitle className="text-2xl leading-tight sm:text-3xl">
            {draft ? "Revise sua oferta" : "Prepare a oferta do seu agente"}
          </DialogTitle>
          <DialogDescription className="pt-2 leading-relaxed text-[#665b72]">
            Defina o serviço e o que comprova uma boa entrega. A oferta ainda não será publicada. A
            conexão e a execução de agentes externos estão em desenvolvimento.
          </DialogDescription>
        </DialogHeader>

        {draft ? (
          <div
            ref={summary}
            tabIndex={-1}
            aria-label="Resumo do rascunho de oferta"
            className="space-y-5 focus:outline-none"
          >
            <div className="rounded-xl border border-[#e8def4] bg-[#f8f4ff] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="min-w-0 max-w-full break-words text-xl font-semibold">
                  {draft.service.name}
                </h3>
                <span className="max-w-full break-words rounded-full bg-[#eadcfc] px-3 py-1 text-sm font-medium text-[#6725ba]">
                  {draft.service.price.amount.toLocaleString("pt-BR", {
                    maximumFractionDigits: 20,
                  })}{" "}
                  créditos simulados
                </span>
              </div>
              <dl className="mt-5 space-y-4 text-sm leading-relaxed">
                {[
                  ["Capacidade", draft.service.capability],
                  ["Entrada esperada", draft.service.expectedInput],
                  ["Entrega esperada", draft.service.expectedDelivery],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="font-semibold text-[#241833]">{label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-[#665b72]">{value}</dd>
                  </div>
                ))}
                <div>
                  <dt className="font-semibold text-[#241833]">Critérios de aceitação</dt>
                  <dd>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-[#665b72]">
                      {draft.service.acceptanceCriteria.map((criterion, index) => (
                        <li key={index} className="break-words">
                          {criterion}
                        </li>
                      ))}
                    </ol>
                  </dd>
                </div>
              </dl>
            </div>
            <p className="text-sm leading-relaxed text-[#665b72]">
              Este JSON registra a oferta para revisão. Ele não conecta seu agente nem cria um
              serviço no marketplace.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-11 border-[#ded4ed] bg-white text-[#241833] hover:bg-[#f8f4ff]"
                onClick={() => setDraft(null)}
              >
                <Pencil aria-hidden="true" />
                Editar rascunho
              </Button>
              <Button
                type="button"
                className="h-11 bg-[#8238e6] text-white hover:bg-[#6e29ca]"
                onClick={downloadDraft}
              >
                <Download aria-hidden="true" />
                Baixar rascunho JSON
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={prepareDraft} noValidate className="space-y-5 pt-2">
            <div className="grid gap-5 sm:grid-cols-[1fr_180px]">
              <div className="space-y-2">
                <Label htmlFor={`${id}-name`}>Nome do serviço</Label>
                <Input
                  ref={nameInput}
                  id={`${id}-name`}
                  className={inputClassName}
                  value={fields.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  placeholder="Ex.: Leitor de notas fiscais"
                  maxLength={100}
                  required
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? `${id}-name-error` : undefined}
                />
                {fieldError("name")}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${id}-price`}>Preço por serviço</Label>
                <Input
                  id={`${id}-price`}
                  className={inputClassName}
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={fields.price}
                  onChange={(event) => updateField("price", event.target.value)}
                  placeholder="25"
                  required
                  aria-invalid={Boolean(errors.price)}
                  aria-describedby={`${id}-price-hint${errors.price ? ` ${id}-price-error` : ""}`}
                />
                <p id={`${id}-price-hint`} className="text-xs text-[#665b72]">
                  Em créditos simulados.
                </p>
                {fieldError("price")}
              </div>
            </div>
            {textFields.map(({ key, label, placeholder, maxLength }) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`${id}-${key}`}>{label}</Label>
                <Textarea
                  id={`${id}-${key}`}
                  className={inputClassName}
                  rows={key === "criteria" ? 4 : 2}
                  value={fields[key]}
                  onChange={(event) => updateField(key, event.target.value)}
                  placeholder={placeholder}
                  maxLength={maxLength}
                  required
                  aria-invalid={Boolean(errors[key])}
                  aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
                />
                {fieldError(key)}
              </div>
            ))}
            <Button
              type="submit"
              className="h-11 w-full bg-[#8238e6] text-white hover:bg-[#6e29ca] sm:w-auto"
            >
              Revisar rascunho
            </Button>
          </form>
        )}

        <p className="border-t border-[#e8def4] pt-4 text-xs leading-relaxed text-[#665b72]">
          Os dados ficam apenas nesta página, sem envio ao servidor. Fechar esta janela mantém o
          rascunho; recarregar ou sair da página apaga os dados. Baixe o JSON para guardar uma cópia
          no seu dispositivo.
        </p>
      </DialogContent>
    </Dialog>
  );
}
