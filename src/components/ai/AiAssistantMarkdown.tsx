"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

export type AiAssistantMarkdownVariant = "assistant" | "user";

function buildComponents(variant: AiAssistantMarkdownVariant): Components {
  const linkClass =
    variant === "user"
      ? "break-all font-medium text-primary-foreground underline decoration-primary-foreground/50 underline-offset-2 hover:decoration-primary-foreground"
      : "break-all font-medium text-primary underline decoration-primary/45 underline-offset-2 hover:decoration-primary";

  return {
    a({ href, children }) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {children}
        </a>
      );
    },
    p({ children }) {
      return <p className="mb-2 leading-relaxed last:mb-0">{children}</p>;
    },
    ul({ children }) {
      return <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>;
    },
    li({ children }) {
      return <li className="leading-relaxed [&>p]:mb-0">{children}</li>;
    },
    h1({ children }) {
      return <h1 className="mb-2 mt-3 text-lg font-semibold first:mt-0">{children}</h1>;
    },
    h2({ children }) {
      return <h2 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h2>;
    },
    h3({ children }) {
      return <h3 className="mb-1.5 mt-2 text-sm font-semibold first:mt-0">{children}</h3>;
    },
    blockquote({ children }) {
      return (
        <blockquote className="my-2 border-l-2 border-primary/35 pl-3 italic text-muted-foreground [&>p]:mb-0">
          {children}
        </blockquote>
      );
    },
    hr() {
      return <hr className="my-3 border-border" />;
    },
    pre({ children }) {
      return (
        <pre className="my-2 max-w-full overflow-x-auto rounded-lg border border-border bg-background/85 p-3 text-left shadow-inner dark:bg-background/35">
          {children}
        </pre>
      );
    },
    code({ className, children, ...props }) {
      const text = String(children);
      const isBlock = /\blanguage-[\w-]+\b/.test(className ?? "") || text.includes("\n");
      if (isBlock) {
        return (
          <code
            className={`block min-w-0 max-w-full overflow-x-auto font-mono text-[0.8125rem] leading-relaxed ${className ?? ""}`}
            {...props}
          >
            {children}
          </code>
        );
      }
      const inlineBg =
        variant === "user"
          ? "bg-primary-foreground/15 ring-primary-foreground/25"
          : "bg-background/70 ring-border/60 dark:bg-background/45";
      return (
        <code
          className={`rounded px-1 py-0.5 font-mono text-[0.85em] ring-1 ring-inset ${inlineBg}`}
          {...props}
        >
          {children}
        </code>
      );
    },
    table({ children }) {
      return (
        <div className="my-2 max-w-full overflow-x-auto">
          <table className="min-w-[220px] border-collapse border border-border text-left text-[0.8125rem]">
            {children}
          </table>
        </div>
      );
    },
    thead({ children }) {
      return <thead className="bg-muted/55">{children}</thead>;
    },
    th({ children }) {
      return <th className="border border-border px-2 py-1.5 font-medium">{children}</th>;
    },
    td({ children }) {
      return <td className="border border-border px-2 py-1 align-top">{children}</td>;
    },
    tr({ children }) {
      return <tr className="border-border">{children}</tr>;
    },
    strong({ children }) {
      return <strong className="font-semibold">{children}</strong>;
    },
    em({ children }) {
      return <em className="italic">{children}</em>;
    },
    del({ children }) {
      return <del className="opacity-80 line-through">{children}</del>;
    },
    img(props) {
      const { src, alt, ...rest } = props;
      return (
        <img
          src={src}
          alt={alt ?? ""}
          className="my-2 max-h-56 max-w-full rounded-md object-contain"
          loading="lazy"
          {...rest}
        />
      );
    },
    input(props) {
      const { type, checked, ...rest } = props;
      if (type === "checkbox") {
        return (
          <input
            {...rest}
            type="checkbox"
            checked={Boolean(checked)}
            disabled
            readOnly
            className="mr-1.5 align-middle"
          />
        );
      }
      return <input {...props} />;
    },
  };
}

export function AiAssistantMarkdown({
  content,
  variant,
}: {
  content: string;
  variant: AiAssistantMarkdownVariant;
}) {
  return (
    <div className="min-w-0 max-w-full [&_a]:break-all [&_code]:break-words [&_pre_code]:break-normal">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildComponents(variant)}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** Убирает разметку для однострочного превью в списке чатов. */
export function stripMarkdownForPreview(s: string): string {
  let t = s.replace(/```[\w-]*\r?\n?([\s\S]*?)```/g, " … ");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  t = t.replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/_([^_\s][^_]*)_/g, "$1");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  t = t.replace(/^\s*[-*+]\s+/gm, "");
  t = t.replace(/^\s*\d+\.\s+/gm, "");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}
