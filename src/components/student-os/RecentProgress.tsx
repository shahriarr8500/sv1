import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompletionText, formatRelativeDay } from "@/lib/student-os/format";
import type { ItemLocation } from "@/lib/student-os/types";
import { motion } from "framer-motion";
import { Check, History } from "lucide-react";

/** Real completion history, newest first. Never generates fake entries. */
export function RecentProgress({
  entries,
}: {
  entries: Array<ItemLocation & { completedAt: number }>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.25, ease: "easeOut" }}
      className="h-full"
    >
      <Card className="h-full gap-4">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
            >
              <History className="size-4" />
            </span>
            <CardTitle className="text-base">Recent Progress</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Nothing completed yet. Check off your first syllabus item and it
              will appear here.
            </p>
          ) : (
            <ul className="-mt-1">
              {entries.map((entry) => (
                <li
                  key={entry.item.id}
                  className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0 first:pt-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
                    >
                      <Check className="size-3.5" />
                    </span>
                    <span className="text-sm break-words">
                      {formatCompletionText(entry)}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeDay(entry.completedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
