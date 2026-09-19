import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

export function generateKeyPair() {
  const pair = generateKeyPairSync("ec", { namedCurve: "secp256k1" });
  return {
    publicKey: pair.publicKey.export({ type: "spki", format: "der" }).toString("hex"),
    privateKey: pair.privateKey,
  };
}

function publicKey(hex: string) {
  if (!/^(?:[0-9a-f]{2})+$/.test(hex)) throw new Error("Chave pública inválida.");
  const key = createPublicKey({ key: Buffer.from(hex, "hex"), type: "spki", format: "der" });
  if (
    key.asymmetricKeyType !== "ec" ||
    key.asymmetricKeyDetails?.namedCurve !== "secp256k1" ||
    key.export({ type: "spki", format: "der" }).toString("hex") !== hex
  )
    throw new Error("Chave pública inválida.");
  return key;
}

export function deriveAddress(publicKeyDerHex: string): string {
  publicKey(publicKeyDerHex);
  const body = createHash("sha256")
    .update(Buffer.from(publicKeyDerHex, "hex"))
    .digest("hex")
    .slice(0, 40);
  const checksum = createHash("sha256").update(body, "utf8").digest("hex").slice(0, 4);
  return `nmk1${body}${checksum}`;
}

export function validateAddress(address: unknown): address is string {
  if (typeof address !== "string" || !/^nmk1[0-9a-f]{44}$/.test(address)) return false;
  return (
    createHash("sha256").update(address.slice(4, 44), "utf8").digest("hex").slice(0, 4) ===
    address.slice(44)
  );
}

export function signPayload(payload: string, privateKey: KeyObject): string {
  try {
    if (
      privateKey.type !== "private" ||
      privateKey.asymmetricKeyDetails?.namedCurve !== "secp256k1"
    )
      throw new Error();
    return sign("sha256", Buffer.from(payload, "utf8"), privateKey).toString("hex");
  } catch {
    throw new Error("Não foi possível assinar o registro NMK.");
  }
}

export function verifyPayload(
  payload: string,
  signature: string,
  publicKeyDerHex: string,
): boolean {
  try {
    if (!/^(?:[0-9a-f]{2})+$/.test(signature)) return false;
    return verify(
      "sha256",
      Buffer.from(payload, "utf8"),
      publicKey(publicKeyDerHex),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}
