import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { syllabusLabel } from "@/lib/student-os/format";
import type { ProgressSummary, Subject } from "@/lib/student-os/types";
import { motion } from "framer-motion";

/** Prominent overall progress card — percentage calculated from real item counts. */
export function OverallProgressCard({
  summary,
  subjects,
}: {
  summary: ProgressSummary;
  subjects: Subject[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05, ease: "easeOut" }}
    >
      <Card className="gap-5">
        <CardHeader>
          <div className="flex w-full items-start justify-between gap-4">
            <div className="space-y-1.5">
              <CardTitle className="text-base">
                Overall Syllabus Progress
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {syllabusLabel(subjects)}
              </p>
            </div>
            <span className="text-3xl leading-none font-bold tracking-tight tabular-nums text-primary sm:text-4xl">
              {summary.percent}%
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress
            value={summary.percent}
            aria-label="Overall syllabus progress"
            className="h-2.5 bg-primary/15"
          />
          <p className="text-sm text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">
              {summary.completed} / {summary.total}
            </span>{" "}
            items completed
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
