/**
 * Звуки ожидания вызова: гудки у звонящего, «вызов» у получателя (Web Audio, без файлов).
 * Остановить при смене фазы / размонтировании через stopMeetCallSounds().
 */

let ctx: AudioContext | null = null;
/** Browser `setInterval` id (number); avoid `NodeJS.Timeout` from Node typings. */
let intervalId: number | null = null;

function stopOsc(osc: OscillatorNode, when: number) {
  try {
    osc.stop(when);
  } catch {
    /* */
  }
}

function playTone(freq: number, durationSec: number, gain = 0.12) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  stopOsc(osc, t0 + durationSec + 0.05);
}

async function ensureCtx(): Promise<AudioContext | null> {
  if (typeof window === "undefined") return null;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!ctx || ctx.state === "closed") {
      ctx = new Ctx();
    }
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    return ctx;
  } catch {
    return null;
  }
}

/** Короткий гудок (как линия занята / дозвон). */
export async function startMeetOutgoingRingSound(): Promise<void> {
  stopMeetCallSounds();
  const c = await ensureCtx();
  if (!c) return;
  const tick = () => {
    playTone(425, 0.2, 0.14);
    window.setTimeout(() => playTone(425, 0.2, 0.1), 260);
  };
  tick();
  intervalId = window.setInterval(tick, 1100);
}

/** Два тона «звонок» с паузой (входящий). */
export async function startMeetIncomingRingSound(): Promise<void> {
  stopMeetCallSounds();
  const c = await ensureCtx();
  if (!c) return;
  const tick = () => {
    playTone(880, 0.22, 0.13);
    window.setTimeout(() => playTone(1046, 0.28, 0.11), 240);
  };
  tick();
  intervalId = window.setInterval(tick, 2000);
}

export function stopMeetCallSounds(): void {
  if (intervalId != null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
  if (ctx && ctx.state !== "closed") {
    try {
      void ctx.close();
    } catch {
      /* */
    }
  }
  ctx = null;
}
