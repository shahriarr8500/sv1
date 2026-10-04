import { Button } from "@/components/ui/button";
import { goalHeadline } from "@/lib/student-os/format";
import type { StudentProfile } from "@/lib/student-os/types";
import { motion } from "framer-motion";
import { Compass, Pencil } from "lucide-react";
import { useNavigate } from "react-router";

/** Dashboard top block: the student's goal, dynamic and never hardcoded. */
export function GoalHeader({ profile }: { profile: StudentProfile }) {
  const navigate = useNavigate();

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-wrap items-start justify-between gap-4"
      aria-label="Your goal"
    >
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {goalHeadline(profile)}
        </h1>
        <p className="mt-2 text-muted-foreground">Your journey starts here.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-xs font-medium">
            <Compass className="size-3.5 text-primary" aria-hidden />
            {profile.exam}
          </span>
          <span className="inline-flex items-center rounded-lg border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {profile.educationLevel} · {profile.curriculum}
          </span>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="cursor-pointer gap-1.5"
        onClick={() => navigate("/goal")}
      >
        <Pencil className="size-3.5" aria-hidden />
        Edit goal
      </Button>
    </motion.section>
  );
}
