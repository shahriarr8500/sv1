import React from "react";
import type { ItemLocation, Subject } from "@/lib/student-os/types";
import { ContinueStudying } from "@/components/student-os/ContinueStudying";
import { TodayCard } from "@/components/student-os/TodayCard";
import { DailyBriefing } from "@/components/student-os/DailyBriefing";
import { DailyGuidance } from "@/components/student-os/DailyGuidance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, BookOpen } from "lucide-react";

const STUDENT_OS_PAGE_TITLE = process.env.NEXT_PUBLIC_APP_TITLE ?? "Student OS";

export default function StudentOSPage() {
  return (
    <>
      <ContinueStudying next={null as unknown as ItemLocation | null} subjects={[] as unknown as Subject[]} />
      <TodayCard next={null as unknown as ItemLocation | null} subjects={[] as unknown as Subject[]} />
      <Card className="gap-4">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
            >
              <Sparkles className="size-4" />
            </span>
            <CardTitle className="text-base">AI Summary</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <DailyBriefing />
        </CardContent>
      </Card>
      <Card className="gap-4">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
            >
              <BookOpen className="size-4" />
            </span>
            <CardTitle className="text-base">Daily Guidance</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <DailyGuidance />
        </CardContent>
      </Card>
    </>
  );
}
