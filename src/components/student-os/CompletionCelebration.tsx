/**
 * Completion celebration — the satisfying feedback step of the loop.
 *
 * Pure view: the timing and state live in `@/state/celebration`, so this
 * file exports only components and fast refresh keeps working. Rendered
 * once from `AppShell` so it survives route changes.
 *
 * ~1.4s on screen: long enough to read "+25 XP", short enough that it never
 * makes the student wait for the next action.
 */

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Flame, Star, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { dismissCelebration, useCelebration } from "@/state/celebration";

const KIND_ICON = {
  target: Check,
  mission: Star,
  level: Trophy,
  perfect: Flame,
} as const;

const AUTO_DISMISS_MS = 1400;

export function CompletionCelebration() {
  const celebration = useCelebration();
  const id = celebration?.id;

  // Belt-and-braces: never leave an overlay up if the store's timer is lost.
  useEffect(() => {
    if (id === undefined) return;
    const timeout = window.setTimeout(dismissCelebration, AUTO_DISMISS_MS + 400);
    return () => window.clearTimeout(timeout);
  }, [id]);

  const Icon = celebration ? KIND_ICON[celebration.kind] : Check;

  return (
    <AnimatePresence>
      {celebration ? (
        <motion.div
          key={celebration.id}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, scale: 0.94, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: -6 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed inset-x-4 top-1/2 z-[60] mx-auto max-w-xs -translate-y-1/2 rounded-2xl border bg-card px-6 py-5 text-center shadow-2xl sm:inset-x-auto sm:right-6 sm:mx-0"
        >
          <span
            className={cn(
              "mx-auto grid size-11 place-items-center rounded-full",
              celebration.kind === "perfect"
                ? "bg-primary text-primary-foreground"
                : "bg-primary/12 text-primary",
            )}
          >
            <Icon className="size-5" aria-hidden />
          </span>

          <p className="mt-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            {celebration.title}
          </p>

          {celebration.detail ? (
            <p className="mt-1.5 text-sm font-medium text-foreground">
              {celebration.detail}
            </p>
          ) : null}

          {typeof celebration.xp === "number" ? (
            <p className="mt-2 text-2xl font-bold tracking-tight text-primary tabular-nums">
              +{celebration.xp} XP
            </p>
          ) : null}

          {celebration.note ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {celebration.note}
            </p>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
