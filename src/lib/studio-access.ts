export type StudioReadiness = {
  checked: boolean;
  backendConfigured: boolean;
  neuralakeConfigured: boolean;
};

export class StudioAccessError extends Error {
  readonly reason: "checking" | "server" | "neuralake" | "login";
  constructor(reason: StudioAccessError["reason"], message: string) {
    super(message);
    this.reason = reason;
  }
}

// Both builder actions stop before making a request when the environment is incomplete.
export async function withStudioAccess<T>(
  operation: "draft" | "publish",
  readiness: StudioReadiness,
  userId: string | null,
  perform: () => Promise<T>,
): Promise<T> {
  if (!readiness.checked)
    throw new StudioAccessError("checking", "Ainda estamos conferindo a conexão. Tente novamente em alguns segundos.");
  if (!readiness.backendConfigured)
    throw new StudioAccessError("server", "Este ambiente está sem a conexão de servidor necessária. Use a versão online para criar e publicar sua empresa.");
  if (operation === "draft" && !readiness.neuralakeConfigured)
    throw new StudioAccessError("neuralake", "A criação com IA está indisponível neste ambiente. Sua descrição foi preservada; você também pode configurar o rascunho manualmente.");
  if (!userId)
    throw new StudioAccessError("login", "Entre na sua conta para continuar. Sua descrição e seu rascunho foram preservados.");
  return perform();
}

export async function confirmThenRefresh<T>(
  commit: () => Promise<T>,
  refresh: () => Promise<unknown>,
): Promise<{ result: T; refreshFailed: boolean }> {
  const result = await commit();
  try {
    await refresh();
    return { result, refreshFailed: false };
  } catch {
    // A failed read must not turn a successful publication into a reported failure.
    return { result, refreshFailed: true };
  }
}
