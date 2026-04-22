"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Нижний отступ (px) под экранную клавиатуру для фиксированного композера чата.
 *
 * - **Visual Viewport:** `innerHeight - visualViewport.height - visualViewport.offsetTop`
 *   (нормально в Safari / части Chrome).
 * - **Нативно (@capacitor/keyboard):** `keyboardDidShow` отдаёт реальную высоту клавиатуры.
 *   На части **Android + edge-to-edge** визуальный viewport не меняется — плагин закрывает пробел.
 * - **Важно:** при `Keyboard.resizeOnFullScreen` / resize WebView окно уже **сжато по высоте** под клавиатуру.
 *   Тогда `bottom: keyboardInset` + `paddingBottom: … + keyboardInset` дают **двойной** подъём — возвращаем **0**.
 */
export function useVisualViewportKeyboardInset(): number {
  const [vvInset, setVvInset] = useState(0);
  const [nativeKeyboardPx, setNativeKeyboardPx] = useState(0);
  /** WebView уже уменьшился (innerHeight упал) — ручной inset не нужен */
  const [layoutAlreadyShrunkForKeyboard, setLayoutAlreadyShrunkForKeyboard] = useState(false);

  const baselineInnerHRef = useRef(0);
  const innerAtKeyboardWillRef = useRef(0);
  const shrinkCheckGenerationRef = useRef(0);

  const recalcVisualViewport = useCallback(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const ih = window.innerHeight;
    let gap = ih - vv.height - vv.offsetTop;
    if (!Number.isFinite(gap) || gap < 1) {
      setVvInset(0);
      return;
    }
    gap = Math.round(gap);
    /** Android WebView: vv иногда отдаёт почти весь innerHeight → гигантский inset и bottom уезжает «вверх». */
    if (Capacitor.getPlatform() === "android") {
      const cap = Math.max(120, Math.round(ih * 0.52));
      gap = Math.min(gap, cap);
    }
    setVvInset(gap);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    baselineInnerHRef.current = window.innerHeight;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    recalcVisualViewport();
    vv.addEventListener("resize", recalcVisualViewport);
    vv.addEventListener("scroll", recalcVisualViewport);
    window.addEventListener("orientationchange", recalcVisualViewport);
    window.addEventListener("resize", recalcVisualViewport);

    return () => {
      vv.removeEventListener("resize", recalcVisualViewport);
      vv.removeEventListener("scroll", recalcVisualViewport);
      window.removeEventListener("orientationchange", recalcVisualViewport);
      window.removeEventListener("resize", recalcVisualViewport);
    };
  }, [recalcVisualViewport]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const bump = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return;
      if (!["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      const run = () => recalcVisualViewport();
      run();
      requestAnimationFrame(run);
      window.setTimeout(run, 80);
      window.setTimeout(run, 240);
      window.setTimeout(run, 520);
    };

    const onFocusIn = (e: FocusEvent) => bump(e.target);
    const onFocusOut = () => {
      window.setTimeout(recalcVisualViewport, 120);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [recalcVisualViewport]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let mounted = true;
    const subs: Array<{ remove: () => void }> = [];
    const shrinkTimeouts: number[] = [];

    const scheduleShrinkCheck = (keyboardHeight: number) => {
      const gen = ++shrinkCheckGenerationRef.current;
      const run = () => {
        if (!mounted || gen !== shrinkCheckGenerationRef.current) return;
        const kh = keyboardHeight;
        if (kh < 48) {
          setLayoutAlreadyShrunkForKeyboard(false);
          return;
        }
        const before = Math.max(
          innerAtKeyboardWillRef.current || 0,
          baselineInnerHRef.current || 0,
        );
        const lost = before > 0 ? Math.max(0, before - window.innerHeight) : 0;
        /** Android + resizeOnFullScreen: innerHeight падает слабее, чем 30% от kh — всё равно считаем сжатием. */
        const threshold = Capacitor.getPlatform() === "android" ? 0.12 : 0.3;
        setLayoutAlreadyShrunkForKeyboard(lost >= kh * threshold);
      };
      run();
      shrinkTimeouts.push(window.setTimeout(run, 90));
      shrinkTimeouts.push(window.setTimeout(run, 260));
      shrinkTimeouts.push(window.setTimeout(run, 520));
    };

    void import("@capacitor/keyboard")
      .then(async ({ Keyboard }) => {
        try {
          const h0 = await Keyboard.addListener("keyboardWillShow", () => {
            if (!mounted) return;
            innerAtKeyboardWillRef.current = window.innerHeight;
          });
          if (!mounted) {
            h0.remove();
            return;
          }
          subs.push(h0);

          const h1 = await Keyboard.addListener("keyboardDidShow", (info) => {
            if (!mounted) return;
            const kh = Math.max(0, Math.round(info.keyboardHeight));
            setNativeKeyboardPx(kh);
            scheduleShrinkCheck(kh);
          });
          if (!mounted) {
            h0.remove();
            h1.remove();
            return;
          }
          subs.push(h1);

          const h2 = await Keyboard.addListener("keyboardDidHide", () => {
            if (!mounted) return;
            shrinkCheckGenerationRef.current += 1;
            setNativeKeyboardPx(0);
            setLayoutAlreadyShrunkForKeyboard(false);
            innerAtKeyboardWillRef.current = 0;
            window.setTimeout(() => {
              if (!mounted) return;
              baselineInnerHRef.current = window.innerHeight;
            }, 100);
          });
          if (!mounted) {
            h0.remove();
            h1.remove();
            h2.remove();
            return;
          }
          subs.push(h2);
        } catch {
          // нет нативного моста (например, только web)
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
      shrinkCheckGenerationRef.current += 1;
      shrinkTimeouts.splice(0).forEach((id) => window.clearTimeout(id));
      setNativeKeyboardPx(0);
      setLayoutAlreadyShrunkForKeyboard(false);
      subs.splice(0).forEach((s) => s.remove());
    };
  }, []);

  const platform = Capacitor.getPlatform();
  const isAndroidNative = Capacitor.isNativePlatform() && platform === "android";

  /**
   * WebView уже укорочен под клавиатуру — не добавляем bottom/padding второй раз (иначе панель улетает вверх).
   * Дублируем проверку по innerHeight каждый кадр: keyboardWillShow иногда фиксирует высоту поздно.
   */
  if (Capacitor.isNativePlatform() && nativeKeyboardPx > 1 && typeof window !== "undefined") {
    const ih = window.innerHeight;
    const kh = nativeKeyboardPx;
    const before = Math.max(
      innerAtKeyboardWillRef.current || 0,
      baselineInnerHRef.current || 0,
    );
    const lost = before > 0 ? Math.max(0, before - ih) : 0;
    const threshold = platform === "android" ? 0.12 : 0.28;
    if (layoutAlreadyShrunkForKeyboard || lost >= kh * threshold) {
      return 0;
    }
  }

  if (nativeKeyboardPx > 0) {
    /**
     * Android: не берём Math.max с vvInset — при открытой клавиатуре vv часто «ломается» и раздувает отступ.
     * iOS оставляем объединение с vv (Safari).
     */
    if (isAndroidNative) {
      return nativeKeyboardPx;
    }
    return Math.max(nativeKeyboardPx, vvInset);
  }
  return vvInset;
}
