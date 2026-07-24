/**
 * libsignal bootstrap — force native Web Crypto before SessionCipher / KeyHelper.
 */

let ready: Promise<void> | null = null;

export function ensureSignalCryptoReady(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    if (typeof window === "undefined") return;
    const wc = globalThis.crypto;
    if (!wc?.subtle) {
      throw new Error(
        "Web Crypto недоступен. Откройте приложение по HTTPS (или localhost) и обновите страницу."
      );
    }
    const { setWebCrypto } = await import("@privacyresearch/libsignal-protocol-typescript");
    setWebCrypto(wc);
  })();
  return ready;
}
