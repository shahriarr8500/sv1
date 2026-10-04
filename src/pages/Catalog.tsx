import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CATALOG_CATEGORIES,
  formatPrice,
  type CatalogCategory,
  type CatalogItem,
} from "@/lib/student-os/catalog";
import { cn } from "@/lib/utils";
import { useCatalogItems } from "@/state/workspace";
import { motion } from "framer-motion";
import { Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";

const FILTER_OPTIONS: Array<CatalogCategory | "All"> = ["All", ...CATALOG_CATEGORIES];

function CatalogCard({ item }: { item: CatalogItem }) {
  return (
    <Link
      to={`/catalog/${item.id}`}
      className="group flex h-full cursor-pointer flex-col rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-lg border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {item.category}
        </span>
        {item.source === "user" ? (
          <span className="text-[11px] font-medium text-primary">Your post</span>
        ) : null}
      </div>
      <div className="mt-3 min-w-0 flex-1">
        <h2 className="text-sm font-semibold tracking-tight">{item.title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{item.provider}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-2">
          {item.summary}
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between border-t pt-3">
        <span
          className={cn(
            "text-sm",
            item.price > 0
              ? "font-semibold"
              : "font-medium text-primary",
          )}
        >
          {formatPrice(item.price)}
        </span>
        {item.bookable ? (
          <span className="text-xs text-muted-foreground">Book a time</span>
        ) : null}
      </div>
    </Link>
  );
}

/** Catalog — browse everything on offer and search it instantly. */
export default function CatalogPage() {
  const items = useCatalogItems();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CatalogCategory | "All">("All");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) => {
      if (category !== "All" && item.category !== category) return false;
      if (!normalized) return true;
      return [item.title, item.summary, item.provider, item.category]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [items, query, category]);

  const showEmpty = filtered.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Catalog
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            Browse courses, guides, and sessions — or publish something of your
            own.
          </p>
        </div>
        <Button className="cursor-pointer" asChild>
          <Link to="/catalog/new">
            <Upload className="size-4" aria-hidden />
            Post content
          </Link>
        </Button>
      </div>

      <div className="space-y-3">
        <div className="relative w-full sm:max-w-md">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles, providers, topics..."
            aria-label="Search the catalog"
            className="h-10 pl-9"
          />
        </div>
        <div
          role="group"
          aria-label="Filter by category"
          className="flex flex-wrap gap-2"
        >
          {FILTER_OPTIONS.map((option) => {
            const active = category === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(option)}
                className={cn(
                  "cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-primary/60 bg-primary/10 font-medium text-primary"
                    : "border-border text-foreground hover:border-primary/40 hover:bg-accent",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      {showEmpty ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-sm font-semibold tracking-tight">
            No results found
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing matches “{query || category}”. Try a different search or
            clear the filters.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 cursor-pointer"
            onClick={() => {
              setQuery("");
              setCategory("All");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <CatalogCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
