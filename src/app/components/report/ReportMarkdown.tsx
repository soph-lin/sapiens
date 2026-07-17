"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";

type ReportSource = string | { url: string };

type ReportMarkdownProps = {
  children: string;
  sources?: readonly ReportSource[];
  variant?: "light" | "dark";
  scrollable?: boolean;
  className?: string;
};

function sourceUrl(source: ReportSource): string {
  return typeof source === "string" ? source : source.url;
}

function linkFootnotes(
  markdown: string,
  sources: readonly ReportSource[],
): string {
  if (!sources.length) return markdown;
  const urls = sources.map(sourceUrl);
  return markdown.replace(/<(\d+)>/g, (match, raw) => {
    const url = urls[Number(raw) - 1];
    return url ? `[${raw}](${url})` : match;
  });
}

function markdownComponents(variant: "light" | "dark"): Components {
  const isDark = variant === "dark";

  return {
    h2: ({ children }) => (
      <h2
        className={`mt-6 font-display text-xl tracking-[-0.03em] first:mt-0 ${isDark ? "text-white" : "text-[#30281f]"}`}
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3
        className={`mt-5 font-display text-lg tracking-[-0.02em] first:mt-0 ${isDark ? "text-white/90" : "text-[#3d3428]"}`}
      >
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p
        className={`mt-3 leading-7 first:mt-0 ${isDark ? "text-white/65" : "text-[#51483e]"}`}
      >
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul
        className={`mt-3 list-disc space-y-2 pl-5 first:mt-0 ${isDark ? "text-white/65" : "text-[#51483e]"}`}
      >
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol
        className={`mt-3 list-decimal space-y-2 pl-5 first:mt-0 ${isDark ? "text-white/65" : "text-[#51483e]"}`}
      >
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-7">{children}</li>,
    a: ({ href, children }) => {
      const label =
        typeof children === "string"
          ? children
          : Array.isArray(children)
            ? children.join("")
            : "";
      const isFootnote = /^\d+$/.test(label);
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={
            isFootnote
              ? isDark
                ? "align-super text-[10px] font-semibold text-cyan-100/80 no-underline hover:text-cyan-50"
                : "align-super text-[10px] font-semibold text-[#6b5038] no-underline hover:text-[#30281f]"
              : isDark
                ? "break-all text-cyan-100/75 underline decoration-cyan-100/25 underline-offset-2 hover:text-cyan-50"
                : "break-all text-[#6b5038] underline decoration-[#b9a58e] underline-offset-2 hover:text-[#30281f]"
          }
        >
          {children}
        </a>
      );
    },
    strong: ({ children }) => (
      <strong
        className={
          isDark
            ? "font-semibold text-white/85"
            : "font-semibold text-[#30281f]"
        }
      >
        {children}
      </strong>
    ),
    em: ({ children }) => (
      <em className={isDark ? "text-white/75" : "text-[#4a4034]"}>
        {children}
      </em>
    ),
  };
}

export default function ReportMarkdown({
  children,
  sources = [],
  variant = "dark",
  scrollable = false,
  className = "",
}: ReportMarkdownProps) {
  const wrapperClass = [
    "text-sm break-words [overflow-wrap:anywhere]",
    scrollable
      ? "scrollbar-no-track max-h-[min(50vh,28rem)] overflow-y-auto overflow-x-hidden pr-1"
      : "overflow-x-hidden",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClass}>
      <ReactMarkdown components={markdownComponents(variant)}>
        {linkFootnotes(children, sources)}
      </ReactMarkdown>
    </div>
  );
}
