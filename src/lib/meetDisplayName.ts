/** Две строки из одного поля `name` (имя и фамилия через пробел). */
export function meetCalleeDisplayName(fullName: string): { firstLine: string; secondLine: string } {
  const t = fullName.trim() || "Пользователь";
  const i = t.indexOf(" ");
  if (i <= 0) return { firstLine: t, secondLine: "" };
  return { firstLine: t.slice(0, i), secondLine: t.slice(i + 1).trim() };
}

export function fallbackPeerName(userId: string): string {
  const short = String(userId).slice(0, 8);
  return short ? `Пользователь ${short}` : "Пользователь";
}
