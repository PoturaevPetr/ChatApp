/**
 * Статическая карта (без ключей API) для превью в пузырьке.
 * `includePushpin` — пин на тайлах сервиса; если false, центр только по `center` (маркер можно нарисовать в UI поверх).
 */
export function chatLocationStaticMapUrl(
  lat: number,
  lng: number,
  sizeW = 560,
  sizeH = 220,
  zoom = 15,
  includePushpin = true,
): string {
  const z = Math.min(18, Math.max(1, Math.round(zoom)));
  const base = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${z}&size=${sizeW}x${sizeH}`;
  if (!includePushpin) return base;
  return `${base}&markers=${lat},${lng},red-pushpin`;
}

