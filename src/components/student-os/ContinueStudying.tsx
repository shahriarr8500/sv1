import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { chapterLabel, itemLabel, itemPath, syllabusShortLabel } from "@/lib/student-os/format";
import type { ItemLocation, Subject } from "@/lib/student-os/types";
import { motion } from "framer-motion";
import { ArrowRight, BookOpenCheck } from "lucide-react";
import { useNavigate } from "react-router";

/**
 * "Continue Studying" — jumps straight to the first incomplete syllabus item.
 * No recommendation engine: just the next real thing to do.
 */
export function ContinueStudying({
  next,
  subjects,
}: {
  next: ItemLocation | null;
  subjects: Subject[];
}) {
  const navigate = useNavigate();
  const complete = next === null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.2, ease: "easeOut" }}
    >
      <Card className="gap-4">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
            >
              <BookOpenCheck className="size-4" />
            </span>
            <CardTitle className="text-base">Continue Studying</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {complete ? (
            <div>
              <p className="text-sm font-semibold tracking-tight">
                {syllabusShortLabel(subjects)} syllabus completed
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Every trackable item is done. Nothing is left to continue.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold tracking-tight">
                {next.subject.name}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {chapterLabel(next.chapter)}
              </p>
              {next.item.title !== next.chapter.title ? (
                <p className="mt-1 text-sm font-medium text-primary">
                  {itemLabel(next.item)}
                </p>
              ) : null}
            </div>
          )}
          {!complete ? (
            <Button
              className="w-full cursor-pointer sm:w-auto"
              onClick={() => navigate(itemPath(next))}
            >
              Continue
              <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}
