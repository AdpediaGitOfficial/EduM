import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  fullName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  classId: z.string().uuid().nullable().optional(),
  admissionNo: z.string().trim().max(50).optional().nullable(),
  rollNo: z.string().trim().max(50).optional().nullable(),
});

export const admitStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Only admins may admit students
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only administrators can admit students.");

    // Create the auth user (email-confirmed) with a random temp password
    const tempPassword = `Welcome-${Math.random().toString(36).slice(2, 10)}!`;
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create user");

    const userId = created.user.id;

    // Ensure student role (handle_new_user seeded a default; force 'student')
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "student" });
    if (roleErr) throw new Error(roleErr.message);

    // Insert the student record
    const { error: stuErr } = await supabaseAdmin.from("students").insert({
      profile_id: userId,
      class_id: data.classId || null,
      admission_no: data.admissionNo || null,
      roll_no: data.rollNo || null,
    });
    if (stuErr) {
      // rollback the auth user to keep state consistent
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(stuErr.message);
    }

    return { ok: true, userId, tempPassword };
  });