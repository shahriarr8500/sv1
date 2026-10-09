/**
 * SourcesRow — the grounding UI under a searched Ashy answer.
 *
 * Shows a "Searched the web" indicator with the queries Gemini ran
 * (collapsible), Google's Search-suggestions link when the API returned one,
 * and a horizontally scrollable row of compact source cards. Every link opens
 * in a new tab with rel="noopener noreferrer"; only titles and URLs stored on
 * the message are ever rendered — never raw provider HTML.
 */

import { useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Globe2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AshySource } from "@/lib/ashy";

export function SourcesRow({
  sources,
  searchQueries,
  searchEntryPointUrl,
}: {
  sources: AshySource[];
  searchQueries?: string[];
  searchEntryPointUrl?: string;
}) {
  const [queriesOpen, setQueriesOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const copy = async (source: AshySource) => {
    try {
      await navigator.clipboard.writeText(source.url);
      setCopiedUrl(source.url);
      window.setTimeout(() => setCopiedUrl(null), 1500);
    } catch {
      toast("Couldn't copy — select the link and copy it manually.");
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary">
          <Globe2 className="size-3.5" aria-hidden />
          Searched the web
        </span>
        {searchQueries && searchQueries.length > 0 ? (
          <button
            type="button"
            onClick={() => setQueriesOpen((open) => !open)}
            aria-expanded={queriesOpen}
            aria-label={
              queriesOpen ? "Hide search queries" : "Show search queries"
            }
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {queriesOpen ? "Hide queries" : `${searchQueries.length} quer${searchQueries.length === 1 ? "y" : "ies"}`}
            <ChevronDown
              className={cn("size-3 transition-transform", queriesOpen && "rotate-180")}
              aria-hidden
            />
          </button>
        ) : null}
        {searchEntryPointUrl ? (
          <a
            href={searchEntryPointUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Search suggestions
          </a>
        ) : null}
      </div>

      {queriesOpen && searchQueries && searchQueries.length > 0 ? (
        <ul className="space-y-0.5 rounded-md border bg-muted/40 px-2.5 py-1.5">
          {searchQueries.map((query) => (
            <li key={query} className="text-[11px] text-muted-foreground">
              · {query}
            </li>
          ))}
        </ul>
      ) : null}

      {sources.length > 0 ? (
        <div
          role="list"
          aria-label="Sources"
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {sources.map((source, index) => (
            <div
              role="listitem"
              key={source.url}
              className="flex w-44 shrink-0 flex-col justify-between gap-1.5 rounded-lg border bg-card p-2"
            >
              <p className="line-clamp-2 text-[11px] leading-snug font-medium">
                <span className="text-primary">[{index + 1}]</span> {source.title}
              </p>
              <div className="flex items-center justify-between gap-1">
                <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                  {source.domain}
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open link: ${source.title}`}
                    title="Open link"
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                  <button
                    type="button"
                    onClick={() => void copy(source)}
                    aria-label={`Copy link: ${source.title}`}
                    title="Copy link"
                    className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {copiedUrl === source.url ? (
                      <Check className="size-3 text-primary" aria-hidden />
                    ) : (
                      <Copy className="size-3" aria-hidden />
                    )}
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
