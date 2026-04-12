/**
 * Подпись под именем в шапке чата: в сети, время по last_seen_at или запасной текст без метки.
 */
export function formatPeerPresenceLabel(opts: {
  isOnline?: boolean;
  lastSeenAt?: string | null;
}): string {
  if (opts.isOnline) return "в сети";
  const raw = opts.lastSeenAt;
  if (!raw) return "Был недавно";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "Был недавно";

  // Защита от рассинхрона часов клиента/сервера: future-время считаем "только что".
  const deltaMs = Math.max(0, Date.now() - d.getTime());
  const deltaSec = Math.floor(deltaMs / 1000);
  if (deltaSec < 60) return "был(а) в сети только что";

  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) {
    return `был(а) в сети ${deltaMin} ${pluralRu(deltaMin, "минуту", "минуты", "минут")} назад`;
  }

  const deltaHours = Math.floor(deltaMin / 60);
  if (deltaHours < 24) return `был(а) в сети в ${formatRuTime(d)}`;

  return `был(а) в сети ${formatRuDayMonth(d)} в ${formatRuTime(d)}`;
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

function formatRuTime(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatRuDayMonth(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(d);
}
