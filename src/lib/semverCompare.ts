/**
 * Сравнение версий как на сервере (mobile_updates._normalize_version / _is_version_less),
 * чтобы клиент мог не показывать обновление, если локальная сборка уже не ниже latest.
 */
export function normalizeVersion(version: string): number[] {
  const raw = (version || "").trim();
  if (!raw) return [];
  const cleaned = raw.replace(/^v+/i, "");
  const parts = cleaned.split(".");
  const out: number[] = [];
  for (const p of parts) {
    let num = "";
    for (const ch of p) {
      if (ch >= "0" && ch <= "9") num += ch;
      else break;
    }
    out.push(num ? parseInt(num, 10) : 0);
  }
  return out;
}

export function isVersionLess(a: string, b: string): boolean {
  const av = normalizeVersion(a);
  const bv = normalizeVersion(b);
  const maxLen = Math.max(av.length, bv.length);
  const ap = [...av, ...Array(Math.max(0, maxLen - av.length)).fill(0)] as number[];
  const bp = [...bv, ...Array(Math.max(0, maxLen - bv.length)).fill(0)] as number[];
  for (let i = 0; i < maxLen; i++) {
    if (ap[i]! < bp[i]!) return true;
    if (ap[i]! > bp[i]!) return false;
  }
  return false;
}
