import { decryptMessage } from "@/lib/decryptMessage";
import type { LlmEncryptedKeyBundle } from "@/services/llmAccessApi";

export interface DecryptedLlmCredentials {
  apiKey: string;
  apiKeyHeader: string | null;
}

export async function decryptLlmApiKeyBundle(
  bundle: LlmEncryptedKeyBundle,
  devicePrivateKeyPem: string,
): Promise<DecryptedLlmCredentials | null> {
  const content = await decryptMessage(
    bundle.encrypted_data,
    bundle.encrypted_aes_key,
    bundle.nonce,
    devicePrivateKeyPem,
  );
  if (!content || typeof content.api_key !== "string" || !content.api_key.trim()) {
    return null;
  }
  const headerRaw = content.api_key_header;
  const apiKeyHeader =
    typeof headerRaw === "string" && headerRaw.trim() ? headerRaw.trim() : null;
  return {
    apiKey: content.api_key.trim(),
    apiKeyHeader,
  };
}
