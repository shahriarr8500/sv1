import { NavLink, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { Briefcase, LayoutDashboard, Settings, User, Volume2 } from "lucide-react";
import { useStudentOS } from "@/state/student-os";

interface SidebarNavProps {
  onNavigate?: () => void;
  subjects?: Array<{ id: string; paper: string; paperKey: "1st" | "2nd" }>;
  progressBySubject?: Map<string, number>;
}

const TOP_LEVEL: Array<{ icon: React.ComponentType<{ size?: number; className?: string }>; label: string; to: string }> = [
  { icon: LayoutDashboard, label: "Dashboard", to: "/dashboard" },
  { icon: Briefcase, label: "Study log", to: "/log" },
  { icon: Volume2, label: "Timer", to: "/timer" },
  { icon: User, label: "Goal", to: "/goal" },
  { icon: Settings, label: "Settings", to: "/settings" },
];

export function SidebarNav({
  subjects,
  progressBySubject,
  onNavigate,
}: SidebarNavProps) {
  const navigate = useNavigate();
  const { profile } = useStudentOS();

  return (
    <nav className="flex flex-col gap-1 overflow-y-auto py-2" aria-label="Primary">
      {TOP_LEVEL.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50",
            )
          }
        >
          <item.icon className="size-4 shrink-0" />
          {item.label}
        </NavLink>
      ))}

      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Subjects
      </p>
      {subjects.map((subject) => (
        <NavLink
          key={subject.id}
          to={`/syllabus/${subject.id}`}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:text-sidebar-foreground",
            )
          }
        >
          <span>{subject.name}</span>
          <span className="tabular-nums opacity-70">
            {progressBySubject?.get(subject.id) ?? 0}%
          </span>
        </NavLink>
      ))}
    </nav>
  );
}

export default SidebarNav;
