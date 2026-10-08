/**
 * Authenticated app frame: desktop sidebar + mobile drawer navigation.
 *
 * Also guards the app — visitors without a saved profile are sent to
 * onboarding instead of an empty dashboard.
 */

import { Button } from "@/components/ui/button";
import { StudentOsLogo } from "@/components/student-os/StudentOsLogo";
import { CompletionCelebration } from "@/components/student-os/CompletionCelebration";
import { FloatingQuranPlayer } from "@/components/student-os/FloatingQuranPlayer";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAccountLabel } from "@/hooks/use-account-label";
import { useImpersonation } from "@/hooks/use-impersonation";
import { useSignOut } from "@/hooks/use-sign-out";
import { iconForSubject } from "@/components/student-os/subject-icons";
import { goalHeadline } from "@/lib/student-os/format";
import { getSiblingPaperSubject } from "@/lib/student-os/syllabus";
import { calculateSubjectProgress } from "@/lib/student-os/progress";
import type { Subject } from "@/lib/student-os/types";
import { cn } from "@/lib/utils";
import { useSelectedSubjects, useStudentOS, useSubjectsForPaper } from "@/state/student-os";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  Headphones,
  Home,
  LayoutGrid,
  ListChecks,
  Loader2,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  User,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router";

interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  trailing?: ReactNode;
}

function NavRow({ entry, end, onNavigate }: { entry: NavEntry; end?: boolean; onNavigate?: () => void }) {
  const Icon = entry.icon;
  return (
    <li>
      <NavLink
        to={entry.to}
        end={end}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            isActive
              ? "bg-primary/10 font-medium text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )
        }
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        {entry.trailing}
      </NavLink>
    </li>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6 mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase first:mt-0">
      {children}
    </p>
  );
}

function SidebarNav({
  subjects,
  progressBySubject,
  onNavigate,
}: {
  subjects: ReturnType<typeof useSelectedSubjects>;
  progressBySubject: Map<string, number>;
  onNavigate?: () => void;
}) {
  // Admin is role-gated server-side; normal students never see it.
  const isAdmin = useQuery(api.admin.isAdmin) === true;

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
      <SectionLabel>Main</SectionLabel>
      <ul className="space-y-1">
        <NavRow
          end
          onNavigate={onNavigate}
          entry={{ to: "/dashboard", label: "Home", icon: Home }}
        />
        <NavRow
          onNavigate={onNavigate}
          entry={{ to: "/missions", label: "Missions", icon: ListChecks }}
        />
        <NavRow
          onNavigate={onNavigate}
          entry={{ to: "/syllabus", label: "Syllabus", icon: BookOpen }}
        />
        {subjects.map((subject) => {
          const paperLinks = (["1st", "2nd"] as const)
            .map((paperKey) => getSiblingPaperSubject(subject, paperKey))
            .filter((target): target is Subject => Boolean(target));
          return (
            <li key={subject.id}>
              <NavRow
                onNavigate={onNavigate}
                entry={{
                  to: `/syllabus/${subject.id}`,
                  label: subject.name,
                  icon: iconForSubject(subject.id),
                  trailing: (
                    <span className="text-[11px] font-medium tabular-nums opacity-70">
                      {progressBySubject.get(subject.id) ?? 0}%
                    </span>
                  ),
                }}
              />
              <ul className="ml-6 mt-0.5 space-y-0.5 border-l pl-2">
                {paperLinks.map((target) => (
                  <li key={target.id}>
                    <NavLink
                      to={`/syllabus/${target.id}`}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          "flex cursor-pointer items-center justify-between rounded-md px-2 py-1 text-xs transition-colors",
                          isActive
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-muted-foreground hover:text-foreground",
                        )
                      }
                    >
                      <span>{target.paper}</span>
                      <span className="tabular-nums opacity-70">
                        {progressBySubject.get(target.id) ?? 0}%
                      </span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
        <NavRow
          onNavigate={onNavigate}
          entry={{ to: "/performance", label: "Progress", icon: BarChart3 }}
        />
        <NavRow
          onNavigate={onNavigate}
          entry={{ to: "/timer", label: "Study", icon: Timer }}
        />
        <NavRow
          onNavigate={onNavigate}
          entry={{ to: "/ashy", label: "Ashy", icon: Sparkles }}
        />
        <NavRow
          onNavigate={onNavigate}
          entry={{ to: "/quran", label: "Quran", icon: Headphones }}
        />
      </ul>

      <SectionLabel>More</SectionLabel>
      <ul className="space-y-1">
        <NavRow
          onNavigate={onNavigate}
          entry={{ to: "/goal", label: "Goal", icon: Target }}
        />
        <NavRow
          onNavigate={onNavigate}
          entry={{ to: "/catalog", label: "Catalog", icon: LayoutGrid }}
        />
        <NavRow
          onNavigate={onNavigate}
          entry={{ to: "/bookings", label: "My bookings", icon: CalendarCheck }}
        />
        <NavRow
          onNavigate={onNavigate}
          entry={{ to: "/settings", label: "Settings", icon: Settings }}
        />
      </ul>

      {isAdmin ? (
        <div className="mt-6 border-t pt-4">
          <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Business
          </p>
          <ul>
            <NavRow
              onNavigate={onNavigate}
              entry={{ to: "/admin", label: "Admin", icon: ShieldCheck }}
            />
          </ul>
        </div>
      ) : null}
    </nav>
  );
}

/** Fixed one-hand bottom navigation for phones — Home, Missions, Syllabus, Me. */
function MobileTabBar() {
  const tabs: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
    { to: "/dashboard", label: "Home", icon: Home, end: true },
    { to: "/missions", label: "Missions", icon: ListChecks },
    { to: "/syllabus", label: "Syllabus", icon: BookOpen },
    { to: "/settings", label: "Me", icon: User },
  ];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-4">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  "relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <tab.icon className="size-5" aria-hidden />
                  <span>{tab.label}</span>
                  {isActive ? (
                    <span
                      aria-hidden
                      className="absolute bottom-1 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-primary"
                    />
                  ) : null}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function AccountRow() {
  const label = useAccountLabel();
  const { profile } = useStudentOS();
  const signOut = useSignOut();
  const initial = label.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
      >
        {initial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{label}</span>
        {profile ? (
          <span className="block truncate text-[11px] text-muted-foreground">
            {goalHeadline(profile)}
          </span>
        ) : null}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Sign out"
        title="Sign out"
        onClick={() => void signOut()}
      >
        <LogOut className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

function ImpersonationBanner() {
  const { isImpersonating, target, endImpersonation } = useImpersonation();

  if (!isImpersonating || !target) return null;

  const label = target.name || target.email || "this account";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-primary/10 px-4 py-2 text-sm lg:px-8">
      <p className="flex min-w-0 items-center gap-2">
        <UserCog className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate">
          You are logged in as <span className="font-semibold">{label}</span>
        </span>
      </p>
      <Button
        size="sm"
        variant="outline"
        className="cursor-pointer"
        onClick={async () => {
          if (await endImpersonation()) {
            window.location.assign("/admin-console");
          }
        }}
      >
        Stop and go back to my account
      </Button>
    </div>
  );
}

function BrandMark() {
  return (
    <Link
      to="/"
      className="flex cursor-pointer items-center gap-2.5 transition-opacity hover:opacity-80"
    >
      <StudentOsLogo className="size-6 rounded-md" />
      <span className="text-sm font-bold tracking-tight">Student OS V1</span>
    </Link>
  );
}

export function AppShell() {
  const { profile, completions, isStateLoading } = useStudentOS();
  const subjects = useSelectedSubjects();
  const paperSubjects = useSubjectsForPaper("all");
  const location = useLocation();
  const mountedRef = useRef(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0 });
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    try {
      if (!document.documentElement.dir) document.documentElement.dir = "ltr";
    } catch {
      // Defensive: the document is always available in the browser.
    }
    setSafeAreaPadding();
  }, []);

  const progressBySubject = useMemo(() => {
    const map = new Map<string, number>();
    for (const subject of paperSubjects) {
      const summary = calculateSubjectProgress(subject, completions);
      map.set(subject.id, summary.percent);
    }
    return map;
  }, [paperSubjects, completions]);

  if (isStateLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) return <Navigate to="/onboarding" replace />;

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner />
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background px-4 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          onClick={() => setNavOpen(true)}
        >
          <Menu className="size-5" aria-hidden />
        </Button>
        <BrandMark />
      </header>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-16 items-center border-b px-5">
          <BrandMark />
        </div>
        <SidebarNav
          subjects={subjects}
          progressBySubject={progressBySubject}
          onNavigate={() => setNavOpen(false)}
        />
        <div className="border-t p-3">
          <AccountRow />
        </div>
      </aside>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-72 gap-0 p-0 sm:max-w-72">
          <SheetTitle className="sr-only">Student OS V1 navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Jump to your dashboard, subjects, goal, or settings.
          </SheetDescription>
          <div className="flex h-14 items-center border-b px-5">
            <BrandMark />
          </div>
          <SidebarNav
            subjects={subjects}
            progressBySubject={progressBySubject}
            onNavigate={() => setNavOpen(false)}
          />
          <div className="border-t p-3">
            <AccountRow />
          </div>
        </SheetContent>
      </Sheet>

      <div className="lg:pl-64">
        <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-36 sm:px-6 lg:px-8 lg:pt-10 lg:pb-16">
          <Outlet />
        </main>
      </div>

      <MobileTabBar />
      <FloatingQuranPlayer />
      <CompletionCelebration />
    </div>
  );
}

function setSafeAreaPadding() {
  try {
    if (typeof window === "undefined" || !document.documentElement) return;
    const el = document.documentElement;
    const safe = Number.parseFloat(
      getComputedStyle(el).getPropertyValue("--quran-safe-bottom").trim(),
    );
    if (Number.isFinite(safe) && safe > 0) {
      el.style.paddingBottom = `${safe}px`;
      el.style.setProperty("--quran-page-bottom", `${safe}px`);
    } else {
      el.style.paddingBottom = "";
      el.style.setProperty("--quran-page-bottom", "0px");
    }
  } catch {
    // Safe-area probing is best-effort — never block the shell on it.
  }
}
