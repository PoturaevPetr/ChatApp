let sharedCtx: AudioContext | null = null;
let isPrimed = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedCtx) return sharedCtx;

  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;

  sharedCtx = new AudioContextCtor();
  return sharedCtx;
}

/**
 * Разблокируем AudioContext после первого жеста пользователя.
 * Это нужно на iOS/Safari/Chrome, чтобы звук реально воспроизводился.
 */
export function primeNotificationAudio(): void {
  if (typeof window === "undefined") return;
  if (isPrimed) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  isPrimed = true;
  // Не ждём промис, просто инициируем resume.
  void ctx.resume?.().catch(() => {});
}

export function playSoftMessageSound(): void {
  if (typeof window === "undefined") return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Вдруг контекст не успели разблокировать — попробуем ещё раз.
    if (ctx.state !== "running") void ctx.resume?.().catch(() => {});

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(ctx.destination);

    // Мягкий, но различимый сигнал: 740Hz -> 988Hz
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = 740; // ~F#5
    osc1.connect(gain);

    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = 988; // ~B5
    osc2.connect(gain);

    // Envelope: подъём и затухание
    const peak = 0.08;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc1.start(now);
    osc2.start(now + 0.045);

    osc1.stop(now + 0.2);
    osc2.stop(now + 0.2);
  } catch {
    // Игнорируем любые ошибки аудио (запрет, отсутствие прав, и т.д.)
  }
}

