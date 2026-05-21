const STORAGE_KEY = "kindred_ollama_model";

export function getDefaultOllamaModel(): string {
  return process.env.NEXT_PUBLIC_OLLAMA_MODEL?.trim() || "qwen2.5:14b";
}

export function readStoredOllamaModel(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = localStorage.getItem(STORAGE_KEY)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

export function writeStoredOllamaModel(model: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, model.trim());
  } catch {
    /* quota / private mode */
  }
}

/** Активная модель: localStorage → env → дефолт. */
export function getActiveOllamaModel(): string {
  return readStoredOllamaModel() ?? getDefaultOllamaModel();
}
