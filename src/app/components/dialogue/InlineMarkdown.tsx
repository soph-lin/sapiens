import { Fragment, type ReactNode } from "react";

/**
 * Inline markdown for dialogue: `**bold**`, `*italic*`, `_italic_`.
 * HTML-like tags (e.g. `<whatever/>`) stay literal text and are never parsed as DOM.
 * Incomplete markers (while typewriting) remain literal until closed.
 */
export function renderInlineMarkdown(source: string): ReactNode {
  return renderInlineMarkdownBudget(source, { left: Number.POSITIVE_INFINITY });
}

/**
 * Reveal the first `visibleChars` plain characters of inline markdown.
 * Markers are never shown; emphasis applies as soon as those letters appear.
 */
export function renderInlineMarkdownTyped(
  source: string,
  visibleChars: number,
): ReactNode {
  if (visibleChars <= 0) return null;
  return renderInlineMarkdownBudget(source, { left: visibleChars });
}

function renderInlineMarkdownBudget(
  source: string,
  budget: { left: number },
): ReactNode {
  if (!source || budget.left <= 0) return null;
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const pushText = (value: string) => {
    if (!value || budget.left <= 0) return;
    const slice = value.slice(0, budget.left);
    budget.left -= slice.length;
    if (slice) nodes.push(<Fragment key={key++}>{slice}</Fragment>);
  };

  while (i < source.length && budget.left > 0) {
    const ch = source[i]!;

    // Treat HTML-like tags as opaque literal runs.
    if (ch === "<" && /<\/?[a-zA-Z!/?]/.test(source.slice(i, i + 3))) {
      const end = source.indexOf(">", i + 1);
      if (end !== -1) {
        pushText(source.slice(i, end + 1));
        i = end + 1;
        continue;
      }
    }

    if (source.startsWith("**", i)) {
      const close = source.indexOf("**", i + 2);
      if (close !== -1) {
        const inner = renderInlineMarkdownBudget(
          source.slice(i + 2, close),
          budget,
        );
        if (inner != null) {
          nodes.push(
            <strong key={key++} className="font-semibold">
              {inner}
            </strong>,
          );
        }
        i = close + 2;
        continue;
      }
    }

    if (source.startsWith("__", i)) {
      const close = source.indexOf("__", i + 2);
      if (close !== -1) {
        const inner = renderInlineMarkdownBudget(
          source.slice(i + 2, close),
          budget,
        );
        if (inner != null) {
          nodes.push(
            <strong key={key++} className="font-semibold">
              {inner}
            </strong>,
          );
        }
        i = close + 2;
        continue;
      }
    }

    // *italic* (single asterisks; not part of **)
    if (ch === "*" && source[i + 1] !== "*" && source[i - 1] !== "*") {
      const close = findSingleMarkerClose(source, i, "*");
      if (close !== -1) {
        const inner = renderInlineMarkdownBudget(
          source.slice(i + 1, close),
          budget,
        );
        if (inner != null) {
          nodes.push(<em key={key++}>{inner}</em>);
        }
        i = close + 1;
        continue;
      }
    }

    // _italic_ (word-ish; avoids snake_case mid-word matches)
    if (ch === "_" && source[i + 1] !== "_") {
      const prev = source[i - 1];
      if (!prev || /\s|[([{"']/.test(prev)) {
        const close = findUnderscoreItalicClose(source, i);
        if (close !== -1) {
          const inner = renderInlineMarkdownBudget(
            source.slice(i + 1, close),
            budget,
          );
          if (inner != null) {
            nodes.push(<em key={key++}>{inner}</em>);
          }
          i = close + 1;
          continue;
        }
      }
    }

    // Consume a plain run until the next special character.
    let end = i + 1;
    while (end < source.length) {
      const next = source[end]!;
      if (
        next === "*" ||
        next === "_" ||
        (next === "<" && /<\/?[a-zA-Z!/?]/.test(source.slice(end, end + 3)))
      ) {
        break;
      }
      end += 1;
    }
    pushText(source.slice(i, end));
    i = end;
  }

  return nodes.length > 0 ? nodes : null;
}

/** Visible text for aria labels / plain fallbacks (markers stripped, tags kept). */
export function stripInlineMarkdown(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    if (source[i] === "<" && /<\/?[a-zA-Z!/?]/.test(source.slice(i, i + 3))) {
      const end = source.indexOf(">", i + 1);
      if (end !== -1) {
        out += source.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    if (source.startsWith("**", i)) {
      const close = source.indexOf("**", i + 2);
      if (close !== -1) {
        out += stripInlineMarkdown(source.slice(i + 2, close));
        i = close + 2;
        continue;
      }
    }
    if (source.startsWith("__", i)) {
      const close = source.indexOf("__", i + 2);
      if (close !== -1) {
        out += stripInlineMarkdown(source.slice(i + 2, close));
        i = close + 2;
        continue;
      }
    }
    if (source[i] === "*" && source[i + 1] !== "*") {
      const close = findSingleMarkerClose(source, i, "*");
      if (close !== -1) {
        out += stripInlineMarkdown(source.slice(i + 1, close));
        i = close + 1;
        continue;
      }
    }
    if (source[i] === "_" && source[i + 1] !== "_") {
      const prev = source[i - 1];
      if (!prev || /\s|[([{"']/.test(prev)) {
        const close = findUnderscoreItalicClose(source, i);
        if (close !== -1) {
          out += stripInlineMarkdown(source.slice(i + 1, close));
          i = close + 1;
          continue;
        }
      }
    }
    out += source[i];
    i += 1;
  }
  return out;
}

function findSingleMarkerClose(
  source: string,
  openIndex: number,
  marker: "*" | "_",
): number {
  for (let j = openIndex + 1; j < source.length; j++) {
    if (source[j] !== marker) continue;
    if (source[j + 1] === marker) {
      j += 1;
      continue;
    }
    if (j === openIndex + 1) return -1;
    return j;
  }
  return -1;
}

function findUnderscoreItalicClose(source: string, openIndex: number): number {
  for (let j = openIndex + 1; j < source.length; j++) {
    if (source[j] !== "_") continue;
    if (source[j + 1] === "_") {
      j += 1;
      continue;
    }
    if (j === openIndex + 1) return -1;
    const next = source[j + 1];
    if (next && /[A-Za-z0-9]/.test(next)) continue;
    return j;
  }
  return -1;
}

export default function InlineMarkdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  if (!children) return null;
  return className ? (
    <span className={className}>{renderInlineMarkdown(children)}</span>
  ) : (
    <>{renderInlineMarkdown(children)}</>
  );
}
