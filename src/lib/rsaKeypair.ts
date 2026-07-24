/**
 * RSA-4096 (RSA-OAEP SHA-256) keypair в PEM — совместимо с ChatService HybridEncryption.
 */

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function derToPem(der: ArrayBuffer, label: "PRIVATE KEY" | "PUBLIC KEY"): string {
  const b64 = bufferToBase64(der);
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

export interface ClientRsaKeypair {
  public_key: string;
  private_key: string;
}

/** Генерация пары на устройстве (private не уходит на сервер в режиме keys v2). */
export async function generateRsaKeypairPem(): Promise<ClientRsaKeypair> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);

  return {
    public_key: derToPem(spki, "PUBLIC KEY"),
    private_key: derToPem(pkcs8, "PRIVATE KEY"),
  };
}
