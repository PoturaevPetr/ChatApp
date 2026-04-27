"use client";

import { useEffect, useState } from "react";

/** Совпадает с breakpoint `md:` в Tailwind (768px). */
const MD_MIN_PX = 768;

export function useMediaMinMd(): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(min-width: ${MD_MIN_PX}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(min-width: ${MD_MIN_PX}px)`);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return matches;
}
