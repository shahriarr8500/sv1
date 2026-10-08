import React from "react";
import type { ItemLocation, Subject } from "@/lib/student-os/types";
import { ContinueStudying } from "@/components/student-os/ContinueStudying";
import { TodayCard } from "@/components/student-os/TodayCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, BookOpen } from "lucide-react";

const STUDENT_OS_PAGE_TITLE = process.env.NEXT_PUBLIC_APP_TITLE ?? "Student OS";

export default function StudentOSPage() {
  return (
    <>
      <ContinueStudying next={null as unknown as ItemLocation | null} subjects={[] as unknown as Subject[]} />
      <TodayCard next={null as unknown as ItemLocation | null} subjects={[] as unknown as Subject[]} />
    </>
  );
}
