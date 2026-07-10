/**
 * RBAC permission matrix — SOURCE OF TRUTH (Section 2 of the build spec).
 * Seeded into the `permissions` table; editable at runtime via the
 * access-control module (per school). Scope strings are enforced in the
 * service layer, never trusted from the client.
 *
 * Actions: C=create R=read U=update D=delete E=export
 */

export type MatrixAction = 'create' | 'read' | 'update' | 'delete' | 'export';

export interface MatrixEntry {
  role: string;
  module: string;
  action: MatrixAction;
  scope?: string;
}

const CRUD: MatrixAction[] = ['create', 'read', 'update', 'delete'];
const R: MatrixAction[] = ['read'];
const CR: MatrixAction[] = ['create', 'read'];
const CRU: MatrixAction[] = ['create', 'read', 'update'];
const RE: MatrixAction[] = ['read', 'export'];

function grant(role: string, module: string, actions: MatrixAction[], scope?: string): MatrixEntry[] {
  return actions.map((action) => ({ role, module, action, ...(scope ? { scope } : {}) }));
}

// Modules with 'homework' permissions also govern 'gradebook' (spec merges them).
export const PERMISSION_MATRIX: MatrixEntry[] = [
  // ── users ──
  ...grant('super_admin', 'users', CRUD),
  ...grant('school_admin', 'users', CRUD),
  ...grant('principal', 'users', R),
  ...grant('vice_principal', 'users', R),
  ...grant('hr', 'users', CRUD, 'staff'),

  // ── students ──
  ...grant('super_admin', 'students', CRUD),
  ...grant('school_admin', 'students', CRUD),
  ...grant('principal', 'students', R),
  ...grant('vice_principal', 'students', R),
  ...grant('accountant', 'students', R),
  ...grant('teacher', 'students', R, 'own_class'),
  ...grant('parent', 'students', R, 'own_child'),
  ...grant('student', 'students', R, 'self'),

  // ── staff ──
  ...grant('super_admin', 'staff', CRUD),
  ...grant('school_admin', 'staff', CRUD),
  ...grant('principal', 'staff', R),
  ...grant('vice_principal', 'staff', R),
  ...grant('hr', 'staff', CRUD),

  // ── classes (incl. sections/subjects/timetable admin) ──
  ...grant('super_admin', 'classes', CRUD),
  ...grant('school_admin', 'classes', CRUD),
  ...grant('principal', 'classes', R),
  ...grant('vice_principal', 'classes', CRUD),
  ...grant('teacher', 'classes', R),
  // Not in the base matrix, but required by the /parent and /student timetable
  // routes (Section 5): scoped read of their own class setup.
  ...grant('parent', 'classes', R, 'own_child'),
  ...grant('student', 'classes', R, 'self'),

  // ── attendance ──
  ...grant('super_admin', 'attendance', CRUD),
  ...grant('school_admin', 'attendance', CRUD),
  ...grant('principal', 'attendance', R),
  ...grant('vice_principal', 'attendance', R),
  ...grant('teacher', 'attendance', CRUD, 'own_class'),
  ...grant('parent', 'attendance', R, 'own_child'),
  ...grant('student', 'attendance', R, 'self'),

  // ── homework / gradebook ──
  ...grant('super_admin', 'homework', R),
  ...grant('school_admin', 'homework', R),
  ...grant('principal', 'homework', R),
  ...grant('vice_principal', 'homework', R),
  ...grant('teacher', 'homework', CRUD, 'own_subjects'),
  ...grant('parent', 'homework', R, 'own_child'),
  ...grant('student', 'homework', R, 'self'),
  // student can submit homework: modelled as create on 'homework_submissions'
  ...grant('student', 'homework_submissions', CRU, 'self'),
  ...grant('teacher', 'homework_submissions', CRUD, 'own_subjects'),
  ...grant('super_admin', 'homework_submissions', R),
  ...grant('school_admin', 'homework_submissions', R),
  ...grant('principal', 'homework_submissions', R),
  ...grant('vice_principal', 'homework_submissions', R),
  ...grant('parent', 'homework_submissions', R, 'own_child'),

  // gradebook mirrors homework
  ...grant('super_admin', 'gradebook', R),
  ...grant('school_admin', 'gradebook', R),
  ...grant('principal', 'gradebook', R),
  ...grant('vice_principal', 'gradebook', R),
  ...grant('teacher', 'gradebook', CRUD, 'own_subjects'),
  ...grant('parent', 'gradebook', R, 'own_child'),
  ...grant('student', 'gradebook', R, 'self'),

  // ── fees ──
  ...grant('super_admin', 'fees', CRUD),
  ...grant('school_admin', 'fees', CRUD),
  ...grant('principal', 'fees', R),
  ...grant('accountant', 'fees', CRUD),
  ...grant('parent', 'fees', R, 'own_child'),
  ...grant('parent', 'fees', ['create'], 'pay_own_child'), // pay = create payment intent
  ...grant('student', 'fees', R, 'self'),

  // ── payments ──
  ...grant('super_admin', 'payments', CRUD),
  ...grant('school_admin', 'payments', CRUD),
  ...grant('principal', 'payments', R),
  ...grant('accountant', 'payments', CRUD),
  ...grant('parent', 'payments', R, 'own_child'),
  ...grant('parent', 'payments', ['create'], 'pay_own_child'),
  ...grant('student', 'payments', R, 'self'),

  // ── payroll ──
  ...grant('super_admin', 'payroll', R),
  ...grant('school_admin', 'payroll', R),
  ...grant('hr', 'payroll', CRUD),
  ...grant('accountant', 'payroll', R),

  // ── leave (staff leave requests; teachers manage their own) ──
  ...grant('super_admin', 'leave', CRUD),
  ...grant('school_admin', 'leave', CRUD),
  ...grant('principal', 'leave', R),
  ...grant('vice_principal', 'leave', R),
  ...grant('hr', 'leave', CRUD),
  ...grant('teacher', 'leave', CR, 'self'),

  // ── library ──
  ...grant('super_admin', 'library', CRUD),
  ...grant('school_admin', 'library', CRUD),
  ...grant('principal', 'library', R),
  ...grant('vice_principal', 'library', R),
  ...grant('teacher', 'library', R),
  ...grant('parent', 'library', R),
  ...grant('student', 'library', R),
  ...grant('student', 'library', ['create'], 'borrow'), // borrow/reserve

  // ── fleet ──
  ...grant('super_admin', 'fleet', CRUD),
  ...grant('school_admin', 'fleet', CRUD),
  ...grant('principal', 'fleet', R),
  ...grant('parent', 'fleet', R, 'own_child'),
  ...grant('student', 'fleet', R, 'self'),

  // ── assets ──
  ...grant('super_admin', 'assets', CRUD),
  ...grant('school_admin', 'assets', CRUD),
  ...grant('principal', 'assets', R),

  // ── complaints ──
  ...grant('super_admin', 'complaints', CRUD),
  ...grant('school_admin', 'complaints', CRUD),
  ...grant('principal', 'complaints', R),
  ...grant('vice_principal', 'complaints', R),
  ...grant('teacher', 'complaints', CR, 'own'),
  ...grant('parent', 'complaints', CR, 'own'),

  // ── communication (announcements, messages, notice board) ──
  ...grant('super_admin', 'communication', CRUD),
  ...grant('school_admin', 'communication', CRUD),
  ...grant('principal', 'communication', R),
  ...grant('vice_principal', 'communication', R),
  ...grant('teacher', 'communication', CR),
  ...grant('parent', 'communication', R),
  ...grant('student', 'communication', R),
  // messaging: parents/students can send chat messages to teachers & staff
  ...grant('parent', 'messages', CR, 'own'),
  ...grant('student', 'messages', CR, 'own'),
  ...grant('teacher', 'messages', CR, 'own'),
  ...grant('principal', 'messages', CR, 'own'),
  ...grant('vice_principal', 'messages', CR, 'own'),
  ...grant('hr', 'messages', CR, 'own'),
  ...grant('accountant', 'messages', CR, 'own'),
  ...grant('school_admin', 'messages', CRUD),
  ...grant('super_admin', 'messages', CRUD),

  // ── reports / analytics ──
  ...grant('super_admin', 'reports', RE),
  ...grant('school_admin', 'reports', RE),
  ...grant('principal', 'reports', RE),
  ...grant('vice_principal', 'reports', RE),
  ...grant('hr', 'reports', R, 'staff'),
  ...grant('accountant', 'reports', RE, 'finance'),
  ...grant('teacher', 'reports', R, 'own_scope'),
  // dashboards for parent/student are self-scoped analytics reads
  ...grant('parent', 'reports', R, 'own_child'),
  ...grant('student', 'reports', R, 'self'),

  // ── settings (school profile, academic year, grading…) ──
  ...grant('super_admin', 'settings', CRUD),
  ...grant('school_admin', 'settings', CRUD),
  ...grant('principal', 'settings', R),
  ...grant('vice_principal', 'settings', R),

  // ── access_control (permission matrix editor, audit, sessions, IP) ──
  ...grant('super_admin', 'access_control', CRUD),
  ...grant('school_admin', 'access_control', CRUD, 'own_school'),
];

export const ALL_MODULES = Array.from(new Set(PERMISSION_MATRIX.map((p) => p.module))).sort();
export const ALL_ROLES = [
  'super_admin',
  'school_admin',
  'principal',
  'vice_principal',
  'hr',
  'accountant',
  'teacher',
  'parent',
  'student',
];
