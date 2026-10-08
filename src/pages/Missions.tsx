/**
 * Missions — the full daily plan, off the dashboard so Home can stay calm.
 *
 * Reuses the exact same `TodayMissions` component the dashboard shows, so a
 * mission behaves identically wherever it is checked off.
 */

import { motion } from "framer-motion";
import { TodayMissions } from "@/components/student-os/TodayMissions";
import { StudentOSTargetsErrorBoundary } from "@/components/student-os/StudentOSTargetsErrorBoundary";

export default function MissionsPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mx-auto max-w-3xl space-y-6"
    >
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Missions
        </h1>
        <p className="text-sm text-muted-foreground">
          What you planned for today. Check one off when it&apos;s done — your
          syllabus and progress update instantly.
        </p>
      </div>

      <StudentOSTargetsErrorBoundary>
        <TodayMissions />
      </StudentOSTargetsErrorBoundary>
    </motion.div>
  );
}
