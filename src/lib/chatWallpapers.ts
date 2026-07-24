/** Пресеты фона чата (Telegram-style tile patterns). */

import type { CSSProperties } from "react";

export const DEFAULT_CHAT_WALLPAPER_PRESET_ID = "classic";

export type ChatWallpaperSelection =
  | { kind: "preset"; presetId: string }
  | { kind: "custom"; storageKey: string };

export interface ChatWallpaperPreset {
  id: string;
  label: string;
  /** CSS background for light theme */
  light: { backgroundColor: string; backgroundImage: string; backgroundSize?: string };
  /** CSS background for dark theme */
  dark: { backgroundColor: string; backgroundImage: string; backgroundSize?: string };
}

function svgPattern(dots: string, bg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect fill="${bg}" width="400" height="400"/>${dots}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const classicDots =
  '<circle cx="40" cy="40" r="2" fill="#9cb4c9" opacity="0.35"/><circle cx="120" cy="80" r="1.5" fill="#9cb4c9" opacity="0.25"/><circle cx="200" cy="30" r="2" fill="#9cb4c9" opacity="0.3"/><circle cx="280" cy="100" r="1.5" fill="#9cb4c9" opacity="0.28"/><circle cx="360" cy="50" r="2" fill="#9cb4c9" opacity="0.32"/><circle cx="80" cy="180" r="1.5" fill="#9cb4c9" opacity="0.22"/><circle cx="160" cy="220" r="2" fill="#9cb4c9" opacity="0.3"/><circle cx="240" cy="160" r="1.5" fill="#9cb4c9" opacity="0.26"/><circle cx="320" cy="240" r="2" fill="#9cb4c9" opacity="0.28"/><circle cx="60" cy="320" r="2" fill="#9cb4c9" opacity="0.24"/><circle cx="140" cy="360" r="1.5" fill="#9cb4c9" opacity="0.3"/><circle cx="220" cy="300" r="2" fill="#9cb4c9" opacity="0.27"/><circle cx="300" cy="340" r="1.5" fill="#9cb4c9" opacity="0.25"/><circle cx="380" cy="280" r="2" fill="#9cb4c9" opacity="0.3"/>';

const classicDotsDark =
  '<circle cx="40" cy="40" r="2" fill="#3d5a73" opacity="0.45"/><circle cx="120" cy="80" r="1.5" fill="#3d5a73" opacity="0.35"/><circle cx="200" cy="30" r="2" fill="#3d5a73" opacity="0.4"/><circle cx="280" cy="100" r="1.5" fill="#3d5a73" opacity="0.38"/><circle cx="360" cy="50" r="2" fill="#3d5a73" opacity="0.42"/><circle cx="80" cy="180" r="1.5" fill="#3d5a73" opacity="0.32"/><circle cx="160" cy="220" r="2" fill="#3d5a73" opacity="0.4"/><circle cx="240" cy="160" r="1.5" fill="#3d5a73" opacity="0.36"/><circle cx="320" cy="240" r="2" fill="#3d5a73" opacity="0.38"/><circle cx="60" cy="320" r="2" fill="#3d5a73" opacity="0.34"/><circle cx="140" cy="360" r="1.5" fill="#3d5a73" opacity="0.4"/><circle cx="220" cy="300" r="2" fill="#3d5a73" opacity="0.37"/><circle cx="300" cy="340" r="1.5" fill="#3d5a73" opacity="0.35"/><circle cx="380" cy="280" r="2" fill="#3d5a73" opacity="0.4"/>';

export const CHAT_WALLPAPER_PRESETS: ChatWallpaperPreset[] = [
  {
    id: "classic",
    label: "Классический",
    light: {
      backgroundColor: "#c8d6e3",
      backgroundImage: svgPattern(classicDots, "#c8d6e3"),
      backgroundSize: "400px 400px",
    },
    dark: {
      backgroundColor: "#0e1621",
      backgroundImage: svgPattern(classicDotsDark, "#0e1621"),
      backgroundSize: "400px 400px",
    },
  },
  {
    id: "mint",
    label: "Мята",
    light: {
      backgroundColor: "#d4ebe3",
      backgroundImage: svgPattern(classicDots.replace(/#9cb4c9/g, "#7fb8a8"), "#d4ebe3"),
      backgroundSize: "400px 400px",
    },
    dark: {
      backgroundColor: "#0f1a18",
      backgroundImage: svgPattern(classicDotsDark.replace(/#3d5a73/g, "#2a4a42"), "#0f1a18"),
      backgroundSize: "400px 400px",
    },
  },
  {
    id: "lavender",
    label: "Лаванда",
    light: {
      backgroundColor: "#ddd4eb",
      backgroundImage: svgPattern(classicDots.replace(/#9cb4c9/g, "#a894c9"), "#ddd4eb"),
      backgroundSize: "400px 400px",
    },
    dark: {
      backgroundColor: "#15121f",
      backgroundImage: svgPattern(classicDotsDark.replace(/#3d5a73/g, "#4a3d6b"), "#15121f"),
      backgroundSize: "400px 400px",
    },
  },
  {
    id: "sand",
    label: "Песок",
    light: {
      backgroundColor: "#e8dfd0",
      backgroundImage: svgPattern(classicDots.replace(/#9cb4c9/g, "#c4a882"), "#e8dfd0"),
      backgroundSize: "400px 400px",
    },
    dark: {
      backgroundColor: "#1a1610",
      backgroundImage: svgPattern(classicDotsDark.replace(/#3d5a73/g, "#5a4a32"), "#1a1610"),
      backgroundSize: "400px 400px",
    },
  },
  {
    id: "night",
    label: "Ночь",
    light: {
      backgroundColor: "#b8c4d4",
      backgroundImage: svgPattern(classicDots, "#b8c4d4"),
      backgroundSize: "400px 400px",
    },
    dark: {
      backgroundColor: "#060b12",
      backgroundImage: svgPattern(classicDotsDark, "#060b12"),
      backgroundSize: "400px 400px",
    },
  },
  {
    id: "plain",
    label: "Без узора",
    light: {
      backgroundColor: "hsl(var(--background))",
      backgroundImage: "none",
    },
    dark: {
      backgroundColor: "hsl(var(--background))",
      backgroundImage: "none",
    },
  },
];

export function getPresetById(id: string): ChatWallpaperPreset | undefined {
  return CHAT_WALLPAPER_PRESETS.find((p) => p.id === id);
}

export function presetPreviewStyle(preset: ChatWallpaperPreset, isDark: boolean): CSSProperties {
  const t = isDark ? preset.dark : preset.light;
  return {
    backgroundColor: t.backgroundColor,
    backgroundImage: t.backgroundImage,
    backgroundSize: t.backgroundSize ?? "auto",
    backgroundRepeat: "repeat",
  };
}

export function resolveWallpaperLayerStyle(
  selection: ChatWallpaperSelection,
  isDark: boolean,
  customUrl: string | null,
): CSSProperties {
  if (selection.kind === "custom" && customUrl) {
    return {
      backgroundColor: isDark ? "#0e1621" : "#c8d6e3",
      backgroundImage: `url("${customUrl}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  const preset = getPresetById(selection.kind === "preset" ? selection.presetId : DEFAULT_CHAT_WALLPAPER_PRESET_ID);
  if (!preset) return presetPreviewStyle(CHAT_WALLPAPER_PRESETS[0], isDark);
  const t = isDark ? preset.dark : preset.light;
  return {
    backgroundColor: t.backgroundColor,
    backgroundImage: t.backgroundImage,
    backgroundSize: t.backgroundSize ?? "auto",
    backgroundRepeat: "repeat",
  };
}
