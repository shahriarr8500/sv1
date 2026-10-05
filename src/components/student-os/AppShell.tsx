/**
 * Authenticated app frame: desktop sidebar + mobile drawer navigation.
 *
 * Also guards the app — visitors without a saved profile are sent to
 * onboarding instead of an empty dashboard.
 */

import logo from "@/assets/logo.svg";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAccountLabel } from "@/hooks/use-account-label";
import { useImpersonation } from "@/hooks/use-impersonation";
import { useSignOut } from "@/hooks/use-sign-out";
import { iconForSubject } from "@/components/student-os/subject-icons";
import { goalHeadline } from "@/lib/student-os/format";
import { calculateSubjectProgress } from "@/lib/student-os/progress";
import { cn } from "@/lib/utils";
import {
  useSelectedSubjects,
  useStudentOS,
} from "@/state/student-os";
import {
  CalendarCheck,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Target,
  Timer,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router";

interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Small trailing label (e.g. live progress percentage). */
  trailing?: ReactNode;
}

function NavRow({
  entry,
  end,
  onNavigate,
}: {
  entry: NavEntry;
  end?: boolean;
  onNavigate?: () => void;
}) {
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

function SidebarNav({
  subjects,
  progressBySubject,
  onNavigate,
}: {
  subjects: ReturnType<typeof useSelectedSubjects>;
  progressBySubject: Map<string, number>;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
      <ul className="space-y-1">
        <NavRow
          end
          onNavigate={onNavigate}
          entry={{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }}
        />
      </ul>

      <p className="mt-6 mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        Syllabus
      </p>
      <ul className="space-y-1">
        {subjects.map((subject) => (
          <NavRow
            key={subject.id}
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
        ))}
      </ul>

      <ul className="mt-6 space-y-1">
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
          entry={{ to: "/timer", label: "Study hours", icon: Timer }}
        />
        <NavRow onNavigate={onNavigate} entry={{ to: "/goal", label: "Goal", icon: Target }} />
        <NavRow
          onNavigate={onNavigate}
          entry={{ to: "/settings", label: "Settings", icon: Settings }}
        />
      </ul>

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
            // Full reload so the app state returns to the admin's own account.
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
      <img src={logo} alt="" width={26} height={26} className="rounded-md" />
      <span className="text-sm font-bold tracking-tight">Student OS V1</span>
    </Link>
  );
}

export function AppShell() {
  const { profile, completions } = useStudentOS();
  const subjects = useSelectedSubjects();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  // Keep the viewport at the top for route changes (hash targets scroll themselves).
  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0 });
  }, [location.pathname, location.hash]);

  const progressBySubject = useMemo(() => {
    const map = new Map<string, number>();
    for (const subject of subjects) {
      const summary = calculateSubjectProgress(subject, completions);
      map.set(subject.id, summary.percent);
    }
    return map;
  }, [subjects, completions]);

  if (!profile) return <Navigate to="/onboarding" replace />;

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner />
      {/* Mobile top bar */}
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

      {/* Desktop sidebar */}
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

      {/* Mobile drawer */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent
          side="left"
          className="w-72 gap-0 p-0 sm:max-w-72"
        >
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

      {/* Content */}
      <div className="lg:pl-64">
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
