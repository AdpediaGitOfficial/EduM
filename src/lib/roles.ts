export type AppRole = "admin" | "teacher" | "student" | "parent";

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administrator",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
};

export const ROLE_PRIORITY: AppRole[] = ["admin", "teacher", "student", "parent"];

export function pickPrimaryRole(roles: AppRole[]): AppRole | null {
  for (const r of ROLE_PRIORITY) if (roles.includes(r)) return r;
  return null;
}