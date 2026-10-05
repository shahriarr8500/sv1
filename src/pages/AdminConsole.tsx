import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { useImpersonation } from "@/hooks/use-impersonation";
import { calculateSubjectProgress } from "@/lib/student-os/progress";
import { formatItemCount, formatRelativeDay } from "@/lib/student-os/format";
import { SYLLABUS } from "@/lib/student-os/syllabus";
import type { StudentProfile, Subject } from "@/lib/student-os/types";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Ban,
  ChevronDown,
  ChevronUp,
  Loader2,
  LogIn,
  RotateCcw,
  Save,
  ShieldBan,
  ShieldCheck,
  ShieldOff,
  UserX,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

const PROFILE_FIELDS: Array<{ key: keyof StudentProfile; label: string }> = [
  { key: "goal", label: "Goal" },
  { key: "target", label: "Target score" },
  { key: "exam", label: "Exam" },
  { key: "educationLevel", label: "Education level" },
  { key: "curriculum", label: "Curriculum" },
];

/** One row of `admin.listUsers`. */
interface AdminUser {
  id: Id<"users">;
  name: string | null;
  email: string | null;
  image: string | null;
  role: "admin" | "user" | "member";
  emailVerificationTime: number | null;
  isAnonymous: boolean;
  bannedAt: number | null;
  progress: {
    profile: Record<string, unknown> | null;
    completions: Record<string, number>;
    updatedAt: number;
  } | null;
}

function readProfile(progress: AdminUser["progress"]): StudentProfile | null {
  const raw = progress?.profile;
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<StudentProfile>;
  if (!Array.isArray(value.subjects)) return null;
  return {
    goal: typeof value.goal === "string" ? value.goal : "",
    target: typeof value.target === "string" ? value.target : "",
    exam: typeof value.exam === "string" ? value.exam : "",
    educationLevel:
      typeof value.educationLevel === "string" ? value.educationLevel : "",
    curriculum: typeof value.curriculum === "string" ? value.curriculum : "",
    subjects: value.subjects.filter(
      (id): id is string => typeof id === "string",
    ),
  };
}

/** Only the subjects this account actually tracks (the catalog also holds the
 *  2nd Paper, which the stored profile does not list). */
function trackableSubjects(profile: StudentProfile): Subject[] {
  return SYLLABUS.filter((subject) =>
    profile.subjects.includes(subject.id),
  );
}

function UserCard({
  user,
  isSelf,
}: {
  user: AdminUser;
  isSelf: boolean;
}) {
  const banUser = useAction(api.admin.banUser);
  const deleteAccount = useAction(api.admin.deleteAccount);
  const updateUser = useMutation(api.admin.updateUser);
  const updateProgress = useMutation(api.admin.updateUserProgress);
  const navigate = useNavigate();
  const { impersonate } = useImpersonation();
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(user.name ?? "");
  const [role, setRole] = useState(user.role);
  const [profile, setProfile] = useState<StudentProfile | null>(() =>
    readProfile(user.progress),
  );
  const [isSaving, setIsSaving] = useState(false);

  const completions = user.progress?.completions ?? {};
  const subjects = SYLLABUS.filter((subject) =>
    (profile?.subjects ?? []).includes(subject.id),
  );
  const perSubject = subjects.map((subject) => ({
    subject,
    summary: calculateSubjectProgress(subject, completions),
  }));
  const completed = perSubject.reduce((sum, row) => sum + row.summary.completed, 0);
  const total = perSubject.reduce((sum, row) => sum + row.summary.total, 0);
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setIsSaving(true);
    try {
      await action();
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left"
        onClick={() => setExpanded((value) => !value)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold tracking-tight">
              {user.name || user.email || "Unnamed account"}
            </p>
            <span className="rounded-lg border px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {user.role}
            </span>
            {user.bannedAt !== null && (
              <span className="rounded-lg bg-red-500/15 px-1.5 py-0.5 text-[11px] font-medium text-red-500">
                Banned
              </span>
            )}
            {isSelf && (
              <span className="rounded-lg bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                You
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {user.email ?? "No email"} · joined{" "}
            {user.emailVerificationTime
              ? formatRelativeDay(user.emailVerificationTime)
              : "not verified"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {user.progress
              ? `${formatItemCount({ completed, total, percent })} · synced ${formatRelativeDay(user.progress.updatedAt)}`
              : "No dashboard data synced yet"}
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="space-y-5 border-t p-4">
          {/* Login details */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground"
                htmlFor={`name-${user.id}`}
              >
                Display name
              </label>
              <Input
                id={`name-${user.id}`}
                value={name}
                placeholder="Not set"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                Role
              </label>
              <Select value={role} onValueChange={(value) => setRole(value as typeof role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="member">member</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div><div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="cursor-pointer"
              disabled={isSaving}
              onClick={() =>
                run(
                  () => updateUser({ userId: user.id, name, role }),
                  "Account updated",
                )
              }
            >
              {isSaving ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              Save account changes
            </Button>
            <Button
              className="cursor-pointer"
              disabled={isSaving || isSelf}
              onClick={async () => {
                setIsSaving(true);
                const ok = await impersonate(user.id);
                if (ok) navigate("/dashboard");
                else setIsSaving(false);
              }}
            >
              <LogIn className="mr-2 size-4" />
              Log in as this user
            </Button>
            <Button
              variant="outline"
              className="cursor-pointer"
              disabled={isSaving || isSelf}
              onClick={async () => {
                setIsSaving(true);
                await run(
                  () =>
                    banUser({
                      userId: user.id,
                      banned: user.bannedAt === null,
                    }),
                  user.bannedAt === null ? "Account banned" : "Account unbanned",
                );
              }}
            >
              <Ban className="mr-2 size-4" />
              {user.bannedAt === null ? "Ban" : "Unban"}
            </Button>
            <Button
              variant="outline"
              className="cursor-pointer text-red-500 hover:text-red-500"
              disabled={isSaving || isSelf}
              onClick={() => {
                if (
                  !window.confirm(
                    `Permanently delete ${user.name || user.email || "this account"}? This signs them out everywhere and cannot be undone.`,
                  )
                ) {
                  return;
                }
                setIsSaving(true);
                run(
                  () => deleteAccount({ userId: user.id }),
                  "Account deleted",
                );
              }}
            >
              <UserX className="mr-2 size-4" />
              Delete
            </Button>
          </div>

          {/* Dashboard progress */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
              Dashboard progress
            </p>
            {perSubject.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This account has no tracked subjects yet.
              </p>
            ) : (
              <div className="space-y-2">
                {perSubject.map(({ subject, summary }) => (
                  <div key={subject.id}>
                    <div className="flex items-center justify-between text-xs">
                      <span>
                        {subject.name} · {subject.paper}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatItemCount(summary)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${summary.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              disabled={isSaving || completed === 0}
              onClick={() =>
                run(
                  () =>
                    updateProgress({ userId: user.id, completions: null }),
                  "Progress reset for this account",
                )
              }
            >
              <RotateCcw className="mr-2 size-3.5" />
              Reset all progress
            </Button>
          </div>

          {/* Onboarding profile */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
              Onboarding profile
            </p>
            {profile === null ? (
              <p className="text-sm text-muted-foreground">
                This account hasn&apos;t finished onboarding.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {PROFILE_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <label
                        className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground"
                        htmlFor={`${field.key}-${user.id}`}
                      >
                        {field.label}
                      </label>
                      <Input
                        id={`${field.key}-${user.id}`}
                        value={profile[field.key]}
                        onChange={(event) =>
                          setProfile({
                            ...profile,
                            [field.key]: event.target.value,
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {trackableSubjects(profile).map((subject) => {
                    const checked = profile.subjects.includes(subject.id);
                    return (
                      <button
                        key={subject.id}
                        type="button"
                        className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs ${
                          checked
                            ? "border-primary bg-primary/10 text-primary"
                            : "text-muted-foreground"
                        }`}
                        onClick={() =>
                          setProfile({
                            ...profile,
                            subjects: checked
                              ? profile.subjects.filter((id) => id !== subject.id)
                              : [...profile.subjects, subject.id],
                          })
                        }
                      >
                        {subject.name}
                      </button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  disabled={isSaving}
                  onClick={() =>
                    run(
                      () =>
                        updateProgress({ userId: user.id, profile }),
                      "Profile updated",
                    )
                  }
                >
                  <Save className="mr-2 size-3.5" />
                  Save profile
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Banned accounts, lifted out of the main list so restoring someone is a
 * single click rather than a hunt through every account on the deployment.
 */
function BannedSection({ users }: { users: AdminUser[] }) {
  const banUser = useAction(api.admin.banUser);
  const [pendingId, setPendingId] = useState<Id<"users"> | null>(null);

  return (
    <section className="space-y-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldBan className="size-4 text-red-500" />
          <h2 className="text-sm font-semibold tracking-tight">
            Banned accounts
          </h2>
          <span className="rounded-lg bg-red-500/15 px-1.5 py-0.5 text-[11px] font-medium text-red-500">
            {users.length}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Suspended accounts are signed out and cannot save progress.
        </p>
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No accounts are banned right now.
        </p>
      ) : (
        <ul className="space-y-2">
          {users.map((user) => (
            <li
              key={user.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium tracking-tight">
                  {user.name || user.email || "Unnamed account"}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {user.email ?? "No email"} · banned{" "}
                  {user.bannedAt
                    ? formatRelativeDay(user.bannedAt)
                    : "recently"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                disabled={pendingId !== null}
                onClick={async () => {
                  setPendingId(user.id);
                  try {
                    await banUser({ userId: user.id, banned: false });
                    toast.success(
                      `${user.name || user.email || "That account"} can sign in again`,
                    );
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Could not unban that account",
                    );
                  } finally {
                    setPendingId(null);
                  }
                }}
              >
                {pendingId === user.id ? (
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 size-3.5" />
                )}
                Unban
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Admin console — every account on the deployment with its login details and
 * the dashboard state mirrored from that student's device.
 */
export default function AdminConsole() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const isAdmin = useQuery(api.admin.isAdmin);
  const users = useQuery(api.admin.listUsers, isAdmin ? {} : "skip");
  const revokeAdmin = useMutation(api.admin.revokeAdmin);
  const repairOrphanAccounts = useAction(api.admin.repairOrphanAccounts);
  const didRepair = useRef(false);

  const bannedUsers = (users ?? []).filter((user) => user.bannedAt !== null);

  // Accounts deleted before the login-row purge existed left their auth record
  // behind, which locks that email out of signing in again for good. Clear
  // those leftovers as soon as an admin opens the console.
  useEffect(() => {
    if (isAdmin !== true || didRepair.current) return;
    didRepair.current = true;
    void (async () => {
      try {
        const { repaired } = await repairOrphanAccounts();
        if (repaired.length > 0) {
          toast.success(
            `Cleared ${repaired.length} deleted account(s) so those emails can sign up again`,
          );
        }
      } catch {
        // A failed sweep is harmless: new deletes are still purged correctly.
      }
    })();
  }, [isAdmin, repairOrphanAccounts]);

  if (isAdmin === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md space-y-4 text-center">
          <p className="text-sm font-semibold">Admin access required</p>
          <p className="text-sm text-muted-foreground">
            Enter the admin pass to open the account console.
          </p>
          <Button className="w-full" asChild>
            <Link to="/admin-entry">Go to admin entry</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin console</h1>
          <p className="mt-1.5 text-muted-foreground">
            Every account on this deployment, with its login details and
            dashboard progress.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="cursor-pointer" asChild>
            <Link to="/dashboard">Back to app</Link>
          </Button>
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={async () => {
              try {
                await revokeAdmin();
                toast.success("Admin access revoked");
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Could not revoke access",
                );
              }
              navigate("/dashboard", { replace: true });
            }}
          >
            <ShieldOff className="mr-2 size-4" />
            Revoke my admin access
          </Button>
        </div>
      </div>

      <BannedSection users={bannedUsers} />

      <h2 className="text-sm font-semibold tracking-tight">
        All accounts
        {users !== undefined && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {users.length}
          </span>
        )}
      </h2>

      {users === undefined ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading accounts...
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <Users className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold tracking-tight">No accounts yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Accounts appear here as soon as someone signs in.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              isSelf={currentUser?._id === user.id}
            />
          ))}
        </div>
      )}
    </main>
  );
}