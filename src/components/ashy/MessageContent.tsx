/**
 * MessageContent — safe renderer for Ashy's answers.
 *
 * Uses react-markdown without `rehype-raw`, so AI-generated HTML can never
 * inject markup into the page: everything renders as typed React elements.
 * Math is rendered through KaTeX instead of showing raw LaTeX, and tables,
 * lists and code blocks are styled to the Student OS theme.
 */

import { useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/** A fenced code block with its own copy button (never a page-wide scroll). */
function CodeBlock({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLPreElement | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative my-3">
      <pre
        ref={ref}
        className="overflow-x-auto rounded-lg border bg-muted/60 p-3 pr-14 text-xs leading-relaxed"
      >
        {children}
      </pre>
      <button
        type="button"
        aria-label="Copy code"
        onClick={() => {
          const text = ref.current?.textContent ?? "";
          navigator.clipboard
            .writeText(text)
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => {
              // Clipboard blocked — the student can select the text manually.
            });
        }}
        className="absolute top-1.5 right-1.5 cursor-pointer rounded-md border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

const components: Components = {
  h1: ({ children }) => (
    <h3 className="mt-4 mb-1.5 text-base font-semibold tracking-tight first:mt-0">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h3 className="mt-4 mb-1.5 text-base font-semibold tracking-tight first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-3 mb-1 text-sm font-semibold tracking-tight first:mt-0">
      {children}
    </h4>
  ),
  h4: ({ children }) => (
    <h4 className="mt-3 mb-1 text-sm font-semibold tracking-tight first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="leading-relaxed [&+p]:mt-2.5">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 marker:text-primary">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-primary marker:font-medium">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <span className="font-semibold text-foreground">{children}</span>
  ),
  em: ({ children }) => <em>{children}</em>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="font-medium text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-primary/40 pl-3 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-muted/60 text-left">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="border-b px-3 py-2 font-semibold whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b px-3 py-2 align-top">{children}</td>,
};

export function MessageContent({ text }: { text: string }) {
  return (
    <div className="text-sm break-words [&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex]:text-[1.05em]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
