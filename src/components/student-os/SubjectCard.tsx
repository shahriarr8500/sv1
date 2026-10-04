import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ProgressSummary, Subject } from "@/lib/student-os/types";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";

/** One subject's progress: name, percentage, bar, counts, and a continue action. */
export function SubjectCard({
  subject,
  summary,
  index,
}: {
  subject: Subject;
  summary: ProgressSummary;
  index: number;
}) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1 + index * 0.05, ease: "easeOut" }}
      className="h-full"
    >
      <Card className="h-full gap-4">
        <CardHeader>
          <div className="flex w-full items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-sm">{subject.name}</CardTitle>
              <p className="text-xs text-muted-foreground">{subject.paper}</p>
            </div>
            <span className="text-xl leading-none font-bold tracking-tight tabular-nums">
              {summary.percent}%
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Progress
              value={summary.percent}
              aria-label={`${subject.name} progress`}
              className="h-2 bg-primary/15"
            />
            <p className="text-xs text-muted-foreground tabular-nums">
              {summary.completed} / {summary.total} completed
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full cursor-pointer"
            onClick={() => navigate(`/syllabus/${subject.id}`)}
          >
            Continue
            <ArrowRight className="size-3.5" aria-hidden />
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
