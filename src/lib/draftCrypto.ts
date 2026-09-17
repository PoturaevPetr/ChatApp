/**
 * Zero-Knowledge E2E шифрование черновиков сообщений.
 * Черновик шифруется AES-256-GCM, а ключ шифруется публичным мастер-ключом пользователя (RSA-OAEP).
 * Сервер и Redis видят только шифротекст; расшифровать может только сам пользователь.
 */

import { importPublicKey, importPrivateKey } from "@/lib/rsaKeypair";

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const clean = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(clean);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

export interface EncryptedDraftPayload {
  encrypted_data: string;
  nonce: string;
  encrypted_aes_key: string;
}

export async function encryptDraft(
  text: string,
  userPublicKeyPem: string
): Promise<EncryptedDraftPayload> {
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aesKey,
    plaintext
  );

  const rawAes = await crypto.subtle.exportKey("raw", aesKey);
  const pubKey = await importPublicKey(userPublicKeyPem);
  const encAesKey = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    pubKey,
    rawAes
  );

  return {
    encrypted_data: bufferToBase64(encrypted),
    nonce: bufferToBase64(nonce.buffer),
    encrypted_aes_key: bufferToBase64(encAesKey),
  };
}

export async function decryptDraft(
  encryptedDataB64: string,
  nonceB64: string,
  encryptedAesKeyB64: string,
  userPrivateKeyPem: string
): Promise<string> {
  const privKey = await importPrivateKey(userPrivateKeyPem);
  const rawAes = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privKey,
    base64ToBuffer(encryptedAesKeyB64)
  );

  const aesKey = await crypto.subtle.importKey(
    "raw",
    rawAes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(base64ToBuffer(nonceB64)) },
    aesKey,
    base64ToBuffer(encryptedDataB64)
  );

  return new TextDecoder().decode(decrypted);
}
