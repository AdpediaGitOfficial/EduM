import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  LayoutDashboard, Users, GraduationCap, CalendarDays, Wallet,
  Megaphone, Palmtree, Settings, LogOut, School, BarChart3, Search, Bell,
  ClipboardCheck, BookOpenCheck, NotebookPen, LineChart, Megaphone as MegaphoneIcon, MessageSquare, FileSpreadsheet, UserCog, ShieldCheck, Bus, Package, BookOpen, PieChart,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; roles: AppRole[] };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "teacher", "student", "parent"] },
  { to: "/users", label: "Users", icon: Users, roles: ["admin"] },
  { to: "/teachers", label: "Teachers", icon: Users, roles: ["admin"] },
  { to: "/students", label: "Students", icon: GraduationCap, roles: ["admin", "teacher"] },
  { to: "/classes", label: "Classes", icon: School, roles: ["admin"] },
  { to: "/timetable", label: "Timetable", icon: CalendarDays, roles: ["teacher", "student"] },
  { to: "/attendance", label: "Attendance", icon: ClipboardCheck, roles: ["teacher"] },
  { to: "/attendance-overview", label: "Attendance Overview", icon: ClipboardCheck, roles: ["admin"] },
  { to: "/progress-hub", label: "Progress Hub", icon: LineChart, roles: ["admin", "teacher"] },
  { to: "/gradebook", label: "Gradebook", icon: BookOpenCheck, roles: ["teacher"] },
  { to: "/assignments", label: "Assignments", icon: NotebookPen, roles: ["student"] },
  { to: "/children", label: "My Children", icon: GraduationCap, roles: ["parent"] },
  { to: "/fees", label: "Fees", icon: Wallet, roles: ["admin", "parent"] },
  { to: "/payments", label: "Payments", icon: Wallet, roles: ["admin"] },
  { to: "/announcements", label: "Announcements", icon: Megaphone, roles: ["admin", "teacher", "student", "parent"] },
  { to: "/holidays", label: "Holidays", icon: Palmtree, roles: ["admin", "teacher", "student", "parent"] },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["admin"] },
  { to: "/reports-generator", label: "Reports Generator", icon: FileSpreadsheet, roles: ["admin"] },
  { to: "/communication", label: "Communication", icon: MegaphoneIcon, roles: ["admin", "teacher"] },
  { to: "/complaints", label: "Complaints", icon: MessageSquare, roles: ["admin", "teacher", "parent"] },
  { to: "/staff-monitoring", label: "Staff Monitoring", icon: UserCog, roles: ["admin"] },
  { to: "/staff-access", label: "Access Control", icon: ShieldCheck, roles: ["admin"] },
  { to: "/fleet", label: "Fleet", icon: Bus, roles: ["admin"] },
  { to: "/assets", label: "Assets", icon: Package, roles: ["admin"] },
  { to: "/library", label: "Library", icon: BookOpen, roles: ["admin", "teacher"] },
  { to: "/analytics", label: "Analytics", icon: PieChart, roles: ["admin"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["admin", "teacher", "student", "parent"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const role = user?.primaryRole;
  const items = role ? NAV.filter((n) => n.roles.includes(role)) : [];

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const initials = (user?.fullName ?? "")
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground flex">
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground h-screen sticky top-0">
        <div className="h-16 flex items-center gap-3 px-5 border-b">
          <div className="size-9 rounded-lg bg-primary grid place-items-center text-primary-foreground">
            <GraduationCap className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="font-display font-semibold truncate">Greenwood Intl…</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {items.map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-colors"
          >
            <LogOut className="size-4" /> Sign out
          </button>
          <div className="px-3 py-2 text-xs text-muted-foreground">
            {role ? ROLE_LABEL[role] : ""} workspace
          </div>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        <header className="h-16 shrink-0 flex items-center gap-3 sm:gap-4 px-4 lg:px-8 border-b bg-card sticky top-0 z-20">
          <div className="flex-1 min-w-0 max-w-xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              placeholder="Search…"
              className="w-full h-10 pl-10 pr-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button className="size-10 shrink-0 rounded-lg grid place-items-center hover:bg-secondary text-muted-foreground">
            <Bell className="size-5" />
          </button>
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            <div className="size-9 shrink-0 rounded-lg bg-secondary text-secondary-foreground grid place-items-center text-sm font-semibold">
              {initials}
            </div>
            <div className="hidden sm:block leading-tight min-w-0 max-w-[10rem]">
              <div className="text-sm font-medium truncate">{user?.fullName}</div>
              <div className="text-xs text-muted-foreground truncate">{role ? ROLE_LABEL[role] : ""}</div>
            </div>
          </div>
        </header>
        <main className="flex-1 min-h-0 p-4 lg:p-8 overflow-y-auto overflow-x-hidden">
          <div className="min-w-0 max-w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 mb-6 sm:flex sm:flex-wrap sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold truncate">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}