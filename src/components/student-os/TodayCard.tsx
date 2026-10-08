import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, BookOpen } from "lucide-react";

export function TodayCard() {
  return (
    <>
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
          <p className="text-sm text-muted-foreground">
            Yesterday you studied 2h 10m across 3 sessions. 2 missions left
            today.
          </p>
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
          <p className="text-sm text-foreground">
            “For indeed, with hardship comes ease.” — Quran 94:5
          </p>
        </CardContent>
      </Card>
    </>
  );
}
