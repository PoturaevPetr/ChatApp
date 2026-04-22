"use client";

import { useMemo } from "react";
import { parseMessageTextSegments, shortenUrlForDisplay } from "@/utils/messageLinkUtils";

function joinCls(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

type MessageTextWithLinksProps = {
  text: string;
  isOwn: boolean;
  /** Доп. классы на корневой элемент */
  className?: string;
  /** Классы абзаца / текста без ссылок и для текстовых фрагментов при наличии ссылок */
  paragraphClassName?: string;
};

/**
 * Текст сообщения: обычный абзац или компактные блоки-ссылки (подпись укорочена, полный URL в title).
 */
export function MessageTextWithLinks({ text, isOwn, className, paragraphClassName }: MessageTextWithLinksProps) {
  const segments = useMemo(() => parseMessageTextSegments(text), [text]);
  const hasLink = segments.some((s) => s.type === "link");

  const plainBase = joinCls(paragraphClassName ?? "text-sm leading-snug", "whitespace-pre-wrap break-words");

  if (!hasLink) {
    return <p className={joinCls(plainBase, className)}>{text}</p>;
  }

  const linkCls = isOwn
    ? "border-primary-foreground/30 bg-primary-foreground/12 text-primary-foreground hover:bg-primary-foreground/18"
    : "border-primary/30 bg-primary/8 text-primary hover:bg-primary/12";

  return (
    <div className={joinCls("min-w-0 space-y-2", className)}>
      {segments.map((s, i) => {
        if (s.type === "text") {
          if (!s.value) return null;
          return (
            <span key={i} className={joinCls("block", plainBase)}>
              {s.value}
            </span>
          );
        }
        return (
          <a
            key={i}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            title={s.display}
            className={joinCls(
              "block max-w-full min-w-0 truncate rounded-lg border px-2.5 py-1.5 text-sm leading-snug",
              linkCls,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {shortenUrlForDisplay(s.display)}
          </a>
        );
      })}
    </div>
  );
}
