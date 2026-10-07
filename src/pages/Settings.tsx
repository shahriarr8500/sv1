import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useSignOut } from "@/hooks/use-sign-out";
import { goalHeadline, syllabusLabel } from "@/lib/student-os/format";
import {
  useOverallProgress,
  useSelectedSubjects,
  useStudentOS,
} from "@/state/student-os";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { ArrowRight, LogOut, Moon, ShieldCheck, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Navigate, useNavigate } from "react-router";

/** Settings — account, data notes, and a shortcut into Settings → Goal. */
export default function SettingsPage() {
  const { profile } = useStudentOS();
  const { user } = useAuth();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const subjects = useSelectedSubjects();
  const overall = useOverallProgress();
  const { theme, setTheme } = useTheme();
  // Only accounts holding the admin role see the console entry.
  const isAdmin = useQuery(api.admin.isAdmin) === true;

  if (!profile) return <Navigate to="/onboarding" replace />;

  const accountLabel = user?.email ?? user?.name ?? "Guest session";
  const isDark = theme === "dark";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Settings
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          Manage your goal, appearance, and account.
        </p>
      </div>

      <Card className="gap-4">
        <CardHeader>
          <div className="flex w-full flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle className="text-base">Goal</CardTitle>
              <p className="text-sm text-muted-foreground">
                Change your goal, target, exam, education, curriculum, and
                subjects.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={() => navigate("/goal")}
            >
              Edit
              <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border bg-muted/50 px-2.5 py-1 text-sm font-semibold tracking-tight">
            {goalHeadline(profile)}
          </span>
          <span className="text-sm text-muted-foreground">{profile.exam}</span>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <div className="space-y-1.5">
            <CardTitle className="text-base">Appearance</CardTitle>
            <p className="text-sm text-muted-foreground">
              Switch between light mode and dark mode. Your choice is saved for
              next time.
            </p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {isDark ? (
              <Moon className="size-4 text-primary" aria-hidden />
            ) : (
              <Sun className="size-4 text-primary" aria-hidden />
            )}
            <span>{isDark ? "Dark mode is on" : "Light mode is on"}</span>
          </div>
          <div role="group" aria-label="Theme" className="flex gap-2">
            <button
              type="button"
              aria-pressed={!isDark}
              onClick={() => setTheme("light")}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm transition-colors",
                !isDark
                  ? "border-primary/60 bg-primary/10 font-medium text-primary"
                  : "border-border text-foreground hover:border-primary/40 hover:bg-accent",
              )}
            >
              <Sun className="size-3.5" aria-hidden />
              Light
            </button>
            <button
              type="button"
              aria-pressed={isDark}
              onClick={() => setTheme("dark")}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm transition-colors",
                isDark
                  ? "border-primary/60 bg-primary/10 font-medium text-primary"
                  : "border-border text-foreground hover:border-primary/40 hover:bg-accent",
              )}
            >
              <Moon className="size-3.5" aria-hidden />
              Dark
            </button>
          </div>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card className="gap-4 border-primary/30">
          <CardHeader>
            <div className="flex w-full flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-4 text-primary" aria-hidden />
                  Admin console
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Your account has admin access. Manage accounts, roles and
                  impersonation from here.
                </p>
              </div>
              <Button
                size="sm"
                className="cursor-pointer"
                onClick={() => window.location.assign("/admin-console")}
              >
                Open
                <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{accountLabel}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Signed in to Student OS V1.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer gap-1.5"
            onClick={() => void signOut()}
          >
            <LogOut className="size-3.5" aria-hidden />
            Sign out
          </Button>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Your data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your goal, syllabus completions, catalog activity, bookings, and
            study hours are all saved on this device, so everything survives a
            refresh. Currently tracking{" "}
            <span className="font-medium text-foreground">
              {syllabusLabel(subjects)}
            </span>{" "}
            at{" "}
            <span className="font-medium text-foreground tabular-nums">
              {overall.completed} / {overall.total}
            </span>{" "}
            items completed.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
