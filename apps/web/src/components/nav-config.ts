/**
 * Role-based sidebar navigation (Section 5 routes).
 * Hiding items here is UX only — the API permission guard is the boundary.
 */
import {
  LayoutDashboard, Users, GraduationCap, School, CalendarCheck, BookOpen,
  ClipboardList, Wallet, Receipt, Banknote, Megaphone, MessagesSquare,
  ShieldAlert, Bus, Boxes, Library, BarChart3, Settings, KeyRound,
  UserCog, CalendarDays, FileText, HeartPulse, NotebookPen, type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

const adminNav: NavSection[] = [
  {
    items: [{ label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'People',
    items: [
      { label: 'Users', href: '/admin/users', icon: Users },
      { label: 'Teachers', href: '/admin/teachers', icon: UserCog },
      { label: 'Students', href: '/admin/students', icon: GraduationCap },
    ],
  },
  {
    title: 'Academics',
    items: [
      { label: 'Classes', href: '/admin/classes', icon: School },
      { label: 'Attendance', href: '/admin/attendance', icon: CalendarCheck },
      { label: 'Progress Hub', href: '/admin/progress-hub', icon: NotebookPen },
      { label: 'Gradebook', href: '/admin/gradebook', icon: BookOpen },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Fees', href: '/admin/fees', icon: Wallet },
      { label: 'Payments', href: '/admin/payments', icon: Receipt },
      { label: 'Payroll', href: '/admin/payroll', icon: Banknote },
    ],
  },
  {
    title: 'Communication',
    items: [
      { label: 'Announcements', href: '/admin/announcements', icon: Megaphone },
      { label: 'Messages', href: '/admin/communication', icon: MessagesSquare },
      { label: 'Complaints', href: '/admin/complaints', icon: ShieldAlert },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Staff Monitoring', href: '/admin/staff-monitoring', icon: ClipboardList },
      { label: 'Fleet', href: '/admin/fleet', icon: Bus },
      { label: 'Assets', href: '/admin/assets', icon: Boxes },
      { label: 'Library', href: '/admin/library', icon: Library },
    ],
  },
  {
    title: 'Insights',
    items: [
      { label: 'Reports', href: '/admin/reports', icon: FileText },
      { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Access Control', href: '/admin/access-control', icon: KeyRound },
      { label: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
];

/** which admin nav items each staff role actually sees (mirrors the matrix) */
const adminNavVisibility: Record<string, (href: string) => boolean> = {
  super_admin: () => true,
  school_admin: () => true,
  principal: (href) => !['/admin/access-control'].includes(href),
  vice_principal: (href) =>
    !['/admin/payroll', '/admin/fees', '/admin/payments', '/admin/assets', '/admin/fleet', '/admin/access-control', '/admin/settings'].includes(href),
  hr: (href) =>
    ['/admin/dashboard', '/admin/users', '/admin/teachers', '/admin/staff-monitoring', '/admin/payroll', '/admin/reports', '/admin/communication', '/admin/announcements'].includes(href),
  accountant: (href) =>
    ['/admin/dashboard', '/admin/students', '/admin/fees', '/admin/payments', '/admin/payroll', '/admin/reports', '/admin/analytics', '/admin/communication', '/admin/announcements'].includes(href),
};

const teacherNav: NavSection[] = [
  { items: [{ label: 'Dashboard', href: '/teacher/dashboard', icon: LayoutDashboard }] },
  {
    title: 'Classroom',
    items: [
      { label: 'My Students', href: '/teacher/students', icon: GraduationCap },
      { label: 'Timetable', href: '/teacher/timetable', icon: CalendarDays },
      { label: 'Attendance', href: '/teacher/attendance', icon: CalendarCheck },
      { label: 'Lesson Plans', href: '/teacher/lesson-plans', icon: NotebookPen },
    ],
  },
  {
    title: 'Progress',
    items: [
      { label: 'Homework', href: '/teacher/homework', icon: BookOpen },
      { label: 'Assignments', href: '/teacher/assignments', icon: ClipboardList },
      { label: 'Gradebook', href: '/teacher/gradebook', icon: FileText },
      { label: 'Progress Hub', href: '/teacher/progress-hub', icon: BarChart3 },
      { label: 'Behavior Notes', href: '/teacher/behavior-notes', icon: HeartPulse },
    ],
  },
  {
    title: 'School',
    items: [
      { label: 'Announcements', href: '/teacher/announcements', icon: Megaphone },
      { label: 'Messages', href: '/teacher/communication', icon: MessagesSquare },
      { label: 'Complaints', href: '/teacher/complaints', icon: ShieldAlert },
      { label: 'Library', href: '/teacher/library', icon: Library },
      { label: 'Leave Requests', href: '/teacher/leave-requests', icon: CalendarDays },
      { label: 'Settings', href: '/teacher/settings', icon: Settings },
    ],
  },
];

const parentNav: NavSection[] = [
  { items: [{ label: 'Dashboard', href: '/parent/dashboard', icon: LayoutDashboard }] },
  {
    title: 'Finance',
    items: [
      { label: 'Fees', href: '/parent/fees', icon: Wallet },
      { label: 'Payments', href: '/parent/payments', icon: Receipt },
    ],
  },
  {
    title: 'School',
    items: [
      { label: 'Announcements', href: '/parent/announcements', icon: Megaphone },
      { label: 'Messages', href: '/parent/communication', icon: MessagesSquare },
      { label: 'Complaints', href: '/parent/complaints', icon: ShieldAlert },
      { label: 'Transport', href: '/parent/transport', icon: Bus },
      { label: 'Library', href: '/parent/library', icon: Library },
      { label: 'Calendar', href: '/parent/calendar', icon: CalendarDays },
      { label: 'Settings', href: '/parent/settings', icon: Settings },
    ],
  },
];

const studentNav: NavSection[] = [
  { items: [{ label: 'Dashboard', href: '/student/dashboard', icon: LayoutDashboard }] },
  {
    title: 'Academics',
    items: [
      { label: 'Timetable', href: '/student/timetable', icon: CalendarDays },
      { label: 'Homework', href: '/student/homework', icon: BookOpen },
      { label: 'Attendance', href: '/student/attendance', icon: CalendarCheck },
      { label: 'Gradebook', href: '/student/gradebook', icon: FileText },
      { label: 'Report Cards', href: '/student/report-cards', icon: GraduationCap },
      { label: 'Progress Hub', href: '/student/progress-hub', icon: BarChart3 },
    ],
  },
  {
    title: 'School',
    items: [
      { label: 'Announcements', href: '/student/announcements', icon: Megaphone },
      { label: 'Messages', href: '/student/messages', icon: MessagesSquare },
      { label: 'Library', href: '/student/library', icon: Library },
      { label: 'Calendar', href: '/student/calendar', icon: CalendarDays },
      { label: 'Profile', href: '/student/profile', icon: Users },
      { label: 'Settings', href: '/student/settings', icon: Settings },
    ],
  },
];

export function navForRole(role: string): NavSection[] {
  if (role === 'teacher') return teacherNav;
  if (role === 'parent') return parentNav;
  if (role === 'student') return studentNav;
  const visible = adminNavVisibility[role] ?? (() => false);
  return adminNav
    .map((s) => ({ ...s, items: s.items.filter((i) => visible(i.href)) }))
    .filter((s) => s.items.length > 0);
}

export const ADMIN_ROLES = ['super_admin', 'school_admin', 'principal', 'vice_principal', 'hr', 'accountant'];
