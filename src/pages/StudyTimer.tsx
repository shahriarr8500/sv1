import { ProgressPanel } from "@/components/student-os/study/ProgressPanel";
import { TimerPanel } from "@/components/student-os/study/TimerPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";

/**
 * Study hours — the section that records study time. Start/stop a study or
 * rest timer with an optional alarm, then watch the recorded sessions turn
 * into daily, monthly, and yearly progress.
 */
export default function StudyTimerPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Study hours
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          Start a study or rest timer — every session is recorded and turned
          into daily, monthly, and yearly progress.
        </p>
      </div>

      <Tabs defaultValue="timer">
        <TabsList>
          <TabsTrigger value="timer">Timer</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
        </TabsList>
        <TabsContent value="timer">
          <TimerPanel />
        </TabsContent>
        <TabsContent value="progress">
          <ProgressPanel />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
