/**
 * Add Mission — the daily-target creation flow.
 *
 * Picks a date, browses or searches the real syllabus (Subject → Chapter →
 * Item), multi-selects items, and adds them as missions for that date.
 * Anything already planned on the selected date is marked "planned" and
 * cannot be added twice.
 */

import { useMemo, useState } from "react";
import { ChevronRight, Plus, Search, Target, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { xpForSubject } from "@/lib/student-os/gamification";
import type { Chapter, Subject, StudyItem } from "@/lib/student-os/types";
import { useSelectedSubjects } from "@/state/student-os";
import { useTargets } from "@/state/targets";

interface FlatItem {
  id: string;
  item: StudyItem;
  chapter: Chapter;
  subject: Subject;
  xp: number;
  haystack: string;
}

function chapterLabel(chapter: Chapter): string {
  return chapter.title
    ? `Chapter ${chapter.number} — ${chapter.title}`
    : `Chapter ${chapter.number}`;
}

function localTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AddMissionDialog({
  open,
  onOpenChange,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
}) {
  const subjects = useSelectedSubjects();
  const { isPlanned, addMissions } = useTargets();

  const [date, setDate] = useState(defaultDate ?? localTodayKey());
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [justAdded, setJustAdded] = useState(0);

  // Flat index built once from the real syllabus — search runs against it.
  const flat = useMemo<FlatItem[]>(() => {
    const rows: FlatItem[] = [];
    for (const subject of subjects) {
      const xp = xpForSubject(subject);
      for (const chapter of subject.chapters) {
        for (const item of chapter.items) {
          rows.push({
            id: item.id,
            item,
            chapter,
            subject,
            xp,
            haystack: [
              subject.name,
              chapter.number.toString(),
              chapter.title ?? "",
              item.itemNumber,
              item.title,
            ]
              .join(" ")
              .toLowerCase(),
          });
        }
      }
    }
    return rows;
  }, [subjects]);

  const term = query.trim().toLowerCase();
  const matchingIds = useMemo(() => {
    if (!term) return null;
    const set = new Set<string>();
    for (const row of flat) if (row.haystack.includes(term)) set.add(row.id);
    return set;
  }, [flat, term]);

  /** Subject → chapter → visible items, honouring the search filter. */
  const tree = useMemo(() => {
    const grouped = new Map<
      string,
      { subject: Subject; chapters: Map<string, { chapter: Chapter; items: StudyItem[] }> }
    >();
    for (const row of flat) {
      if (matchingIds && !matchingIds.has(row.id)) continue;
      let subjectEntry = grouped.get(row.subject.id);
      if (!subjectEntry) {
        subjectEntry = { subject: row.subject, chapters: new Map() };
        grouped.set(row.subject.id, subjectEntry);
      }
      let chapterEntry = subjectEntry.chapters.get(row.chapter.id);
      if (!chapterEntry) {
        chapterEntry = { chapter: row.chapter, items: [] };
        subjectEntry.chapters.set(row.chapter.id, chapterEntry);
      }
      chapterEntry.items.push(row.item);
    }
    return [...grouped.values()];
  }, [flat, matchingIds]);

  const xpById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of flat) map[row.id] = row.xp;
    return map;
  }, [flat]);

  const isOpen = (key: string) => expanded[key] ?? term.length > 0;
  const toggleOpen = (key: string) =>
    setExpanded((previous) => ({ ...previous, [key]: !(previous[key] ?? term.length > 0) }));

  const toggleItem = (id: string, next: boolean) => {
    setSelected((previous) =>
      next
        ? previous.includes(id)
          ? previous
          : [...previous, id]
        : previous.filter((existing) => existing !== id),
    );
  };

  const selectedRows = useMemo(
    () => flat.filter((row) => selected.includes(row.id)),
    [flat, selected],
  );

  const reset = () => {
    setSelected([]);
    setQuery("");
    setExpanded({});
    setJustAdded(0);
  };

  const handleAdd = () => {
    if (selected.length === 0) return;
    const added = addMissions(selected, date, xpById);
    setJustAdded(added);
    setSelected([]);
    setQuery("");
    if (added > 0) {
      // Close after a beat so the count is readable, then reset for next time.
      window.setTimeout(() => {
        onOpenChange(false);
        reset();
      }, 600);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 pt-5 pb-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <Target className="size-4 text-primary" aria-hidden />
            Add missions
          </DialogTitle>
          <DialogDescription>
            Pick a date, then choose syllabus items to plan. Anything already
            planned that day can&apos;t be added twice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-5 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mission-date">Date</Label>
              <Input
                id="mission-date"
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setSelected([]);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mission-search">Search syllabus</Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="mission-search"
                  value={query}
                  placeholder="Physics, 1.4, bonding…"
                  autoComplete="off"
                  className="pl-9"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
          </div>

          {selectedRows.length > 0 ? (
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {selectedRows.length} selected
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedRows.map((row) => (
                  <span
                    key={row.id}
                    className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs"
                  >
                    <span className="max-w-40 truncate">{row.subject.name}</span>
                    <span className="text-muted-foreground">
                      {row.item.itemNumber}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${row.item.itemNumber}`}
                      className="cursor-pointer rounded-full text-muted-foreground hover:text-destructive"
                      onClick={() => toggleItem(row.id, false)}
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t px-5 py-3 sm:px-6">
          {tree.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No syllabus items match “{query}”.
            </p>
          ) : (
            <div className="space-y-4">
              {tree.map((subjectEntry) => (
                <section key={subjectEntry.subject.id}>
                  <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {subjectEntry.subject.name}
                    <span className="ml-2 font-normal normal-case opacity-70">
                      {subjectEntry.subject.paper}
                    </span>
                  </h3>
                  <div className="mt-2 space-y-1.5">
                    {[...subjectEntry.chapters.values()].map((chapterEntry) => {
                      const openState = isOpen(chapterEntry.chapter.id);
                      const items = chapterEntry.items;
                      const plannedCount = items.filter((item) =>
                        isPlanned(item.id, date),
                      ).length;
                      return (
                        <div
                          key={chapterEntry.chapter.id}
                          className="rounded-lg border"
                        >
                          <button
                            type="button"
                            onClick={() => toggleOpen(chapterEntry.chapter.id)}
                            aria-expanded={openState}
                            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/60"
                          >
                            <ChevronRight
                              className={cn(
                                "size-4 shrink-0 text-muted-foreground transition-transform",
                                openState && "rotate-90",
                              )}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {chapterLabel(chapterEntry.chapter)}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {items.length} item{items.length === 1 ? "" : "s"}
                              {plannedCount > 0 ? ` · ${plannedCount} planned` : ""}
                            </span>
                          </button>

                          {openState ? (
                            <ul className="border-t p-1.5">
                              {items.map((item) => {
                                const alreadyPlanned = isPlanned(item.id, date);
                                const checked =
                                  alreadyPlanned || selected.includes(item.id);
                                return (
                                  <li key={item.id}>
                                    <label
                                      htmlFor={`mission-item-${item.id}`}
                                      className={cn(
                                        "flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
                                        alreadyPlanned
                                          ? "cursor-not-allowed opacity-60"
                                          : "cursor-pointer hover:bg-accent/60",
                                      )}
                                    >
                                      <Checkbox
                                        id={`mission-item-${item.id}`}
                                        checked={checked}
                                        disabled={alreadyPlanned}
                                        onCheckedChange={(state) =>
                                          toggleItem(item.id, state === true)
                                        }
                                      />
                                      <span className="min-w-0 flex-1 truncate">
                                        {item.title}
                                      </span>
                                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                        +{xpById[item.id] ?? 25} XP
                                      </span>
                                      {alreadyPlanned ? (
                                        <span className="shrink-0 text-[11px] font-medium text-primary">
                                          Planned
                                        </span>
                                      ) : null}
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-5 py-4 sm:px-6">
          {justAdded > 0 ? (
            <p className="mr-auto text-sm font-medium text-primary">
              Added {justAdded} mission{justAdded === 1 ? "" : "s"}
            </p>
          ) : null}
          <Button variant="ghost" className="cursor-pointer" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            className="cursor-pointer"
            disabled={selected.length === 0}
            onClick={handleAdd}
          >
            <Plus className="size-4" aria-hidden />
            Add {selected.length === 0 ? "missions" : `${selected.length} mission${selected.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
