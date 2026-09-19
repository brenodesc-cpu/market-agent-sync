export const PUBLISHED_STUDIO = "https://market-agent-sync.lovable.app/studio";

export function isLocalPreview(url: string) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
}

export function loginReturnUrl(url: string) {
  const current = new URL(url);
  if (isLocalPreview(url)) {
    throw new Error(
      "O login nesta prévia local ainda não está autorizado. Use a versão online. Seu rascunho continua salvo aqui.",
    );
  }
  return new URL("/studio?view=builder", current.origin).href;
}

export function loginCallbackError(url: string) {
  const current = new URL(url);
  const hash = new URLSearchParams(current.hash.slice(1));
  const error = hash.get("error") ?? current.searchParams.get("error");
  if (!error) return null;
  const description =
    hash.get("error_description") ?? current.searchParams.get("error_description") ?? "";
  if (/provider.*(not supported|not enabled)/i.test(description))
    return "O login com Google ainda precisa ser habilitado no Lovable. Seu rascunho foi preservado.";
  if (/redirect_uri|redirect.*not allowed/i.test(description))
    return "Este endereço ainda não está autorizado para receber o login. Seu rascunho foi preservado.";
  if (error === "access_denied")
    return "O login foi cancelado. Você pode tentar novamente sem perder seu rascunho.";
  return "Não foi possível concluir o login. Tente novamente. Seu rascunho foi preservado.";
}

type OAuthResult = {
  redirected?: boolean;
  error?: Error | null;
  tokens?: { access_token: string; refresh_token: string };
};

export async function establishOAuthSession(
  result: OAuthResult,
  setSession: (tokens: { access_token: string; refresh_token: string }) => PromiseLike<{
    data: { session: unknown | null };
    error: Error | null;
  }>,
) {
  if (result.error) throw result.error;
  if (result.redirected) return;
  if (!result.tokens) throw new Error("O login não retornou uma sessão. Tente novamente.");
  const saved = await setSession(result.tokens);
  if (saved.error) throw saved.error;
  if (!saved.data.session)
    throw new Error("Não foi possível confirmar sua sessão. Tente novamente.");
}
