/**
 * Device linking QR helpers — payload format from ChatService: kindred-link:CODE
 */

import QRCode from "qrcode";
import jsQR from "jsqr";

export function parseDeviceLinkPayload(raw: string): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  const m =
    t.match(/kindred-link:([A-Z0-9]+)/i) ||
    t.match(/kindred-login:([A-Z0-9]+)/i) ||
    t.match(/^([A-Z0-9]{6,16})$/i);
  return m ? m[1].toUpperCase() : null;
}

/** @deprecated use parseDeviceLinkPayload */
export const parseKindredQrCode = parseDeviceLinkPayload;

export function isKindredLoginPayload(raw: string): boolean {
  return /kindred-login:/i.test((raw || "").trim());
}

export function isKindredLinkPayload(raw: string): boolean {
  return /kindred-link:/i.test((raw || "").trim());
}

export async function renderLinkQrDataUrl(payload: string, size = 220): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: size,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });
}

type ScanOpts = {
  /** Max scan duration ms */
  timeoutMs?: number;
  /** Called with the live video element (for UI overlay). */
  onVideoReady?: (video: HTMLVideoElement, stop: () => void) => void;
  signal?: AbortSignal;
};

/**
 * Open rear camera and decode kindred-link QR via BarcodeDetector or jsQR.
 */
export async function scanDeviceLinkQr(opts: ScanOpts = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 45_000;
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Камера недоступна в этом браузере");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false,
  });

  const video = document.createElement("video");
  video.setAttribute("playsinline", "true");
  video.muted = true;
  video.srcObject = stream;

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };

  opts.signal?.addEventListener("abort", stop, { once: true });

  try {
    await video.play();
    opts.onVideoReady?.(video, stop);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BD = (globalThis as any).BarcodeDetector as
      | (new (o: { formats: string[] }) => { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue?: string }>> })
      | undefined;
    const detector = BD ? new BD({ formats: ["qr_code"] }) : null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas недоступен");

    const deadline = Date.now() + timeoutMs;
    while (!stopped && Date.now() < deadline) {
      if (opts.signal?.aborted) break;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        let raw: string | undefined;
        if (detector) {
          try {
            const codes = await detector.detect(canvas);
            raw = codes?.[0]?.rawValue;
          } catch {
            /* fall through to jsQR */
          }
        }
        if (!raw) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });
          raw = result?.data;
        }

        if (raw && parseDeviceLinkPayload(raw)) {
          stop();
          return raw.trim();
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    stop();
    if (opts.signal?.aborted) throw new Error("Сканирование отменено");
    throw new Error("QR не распознан — введите код вручную");
  } catch (e) {
    stop();
    throw e;
  }
}
