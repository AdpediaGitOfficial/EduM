import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { UserPlus, ClipboardCheck, BookOpenCheck, Mail, Phone, Eye, FileEdit } from "lucide-react";
import { admitStudent } from "@/lib/admit-student.functions";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/students")({
  component: StudentsPage,
});

function StudentsPage() {
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const isTeacher = user?.primaryRole === "teacher";
  const isAdmin = user?.primaryRole === "admin";
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const admit = useServerFn(admitStudent);

  const { data: assignedClassIds } = useQuery({
    enabled: !!user && isTeacher,
    queryKey: ["teacher-class-ids", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("teacher_classes").select("class_id").eq("teacher_id", user!.id);
      return (data ?? []).map((r) => r.class_id);
    },
  });

  const { data: classes } = useQuery({
    enabled: !!user,
    queryKey: ["all-classes", isTeacher ? assignedClassIds : "all"],
    queryFn: async () => {
      let q = supabase.from("classes").select("id,name,section");
      if (isTeacher) q = q.in("id", assignedClassIds ?? []);
      return (await q).data ?? [];
    },
  });
  const { data: students } = useQuery({
    enabled: !!user && (!isTeacher || !!assignedClassIds),
    queryKey: ["students-list", isTeacher ? assignedClassIds : "all"],
    queryFn: async () => {
      let q = supabase
        .from("students")
        .select("id, admission_no, roll_no, admission_date, gender, profile_id, class_id, profiles(full_name,email), classes(name,section)")
        .order("admission_date", { ascending: false });
      if (isTeacher) {
        if (!assignedClassIds || assignedClassIds.length === 0) return [];
        q = q.in("class_id", assignedClassIds);
      }
      const { data } = await q;
      return data ?? [];
    },
  });

  const studentIds = useMemo(() => (students ?? []).map((s: any) => s.id), [students]);

  const { data: teacherExtras } = useQuery({
    enabled: isTeacher && studentIds.length > 0,
    queryKey: ["students-extras", studentIds.join(",")],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const [{ data: att }, { data: ex }, { data: fa }, { data: ps }] = await Promise.all([
        supabase.from("attendance").select("student_id,status").in("student_id", studentIds).gte("date", since),
        supabase.from("exam_results").select("student_id,marks_obtained,exams(max_marks)").in("student_id", studentIds),
        supabase.from("fee_assignments").select("student_id,status,amount_due,amount_paid").in("student_id", studentIds),
        supabase.from("parent_student").select("student_id,relationship,profiles!parent_student_parent_id_fkey(full_name,phone,email)").in("student_id", studentIds),
      ]);
      const attMap: Record<string, { total: number; present: number }> = {};
      for (const r of att ?? []) {
        const m = (attMap[r.student_id] ||= { total: 0, present: 0 });
        m.total += 1;
        if (r.status === "present" || r.status === "late") m.present += 1;
      }
      const perfMap: Record<string, { got: number; max: number }> = {};
      for (const r of (ex as any[]) ?? []) {
        const m = (perfMap[r.student_id] ||= { got: 0, max: 0 });
        m.got += Number(r.marks_obtained) || 0;
        m.max += Number(r.exams?.max_marks) || 0;
      }
      const feeMap: Record<string, string> = {};
      for (const r of fa ?? []) feeMap[r.student_id] = r.status;
      const parentMap: Record<string, { name: string; phone: string | null; email: string | null; rel: string }> = {};
      for (const r of (ps as any[]) ?? []) {
        parentMap[r.student_id] = {
          name: r.profiles?.full_name ?? "—",
          phone: r.profiles?.phone ?? null,
          email: r.profiles?.email ?? null,
          rel: r.relationship ?? "guardian",
        };
      }
      return { attMap, perfMap, feeMap, parentMap };
    },
  });

  const feeBadge = (s?: string) => {
    if (!s) return <Badge variant="secondary">—</Badge>;
    if (s === "paid") return <Badge className="bg-emerald-100 text-emerald-700 border-0">Paid</Badge>;
    if (s === "partial") return <Badge className="bg-amber-100 text-amber-700 border-0">Partial</Badge>;
    return <Badge className="bg-red-100 text-red-700 border-0">Pending</Badge>;
  };
  const perfLabel = (pct: number | null) => {
    if (pct == null) return { label: "—", cls: "text-muted-foreground" };
    if (pct >= 85) return { label: `${pct}% · A`, cls: "text-emerald-600" };
    if (pct >= 70) return { label: `${pct}% · B`, cls: "text-sky-600" };
    if (pct >= 55) return { label: `${pct}% · C`, cls: "text-amber-600" };
    return { label: `${pct}% · D`, cls: "text-red-600" };
  };
  const initials = (n?: string) => (n ?? "?").split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fullName = String(fd.get("fullName") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const admissionNo = String(fd.get("adm") || "").trim();
    const rollNo = String(fd.get("roll") || "").trim();
    if (!fullName || !email) return toast.error("Name and email are required");
    setSaving(true);
    try {
      const res = await admit({
        data: {
          fullName,
          email,
          classId: classId || null,
          admissionNo: admissionNo || null,
          rollNo: rollNo || null,
        },
      });
      toast.success(`Admitted ${fullName}. Temp password: ${res.tempPassword}`);
      setOpen(false);
      setClassId("");
      qc.invalidateQueries({ queryKey: ["students-list"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to admit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <PageHeader title="Students" subtitle={isTeacher ? "Students in your assigned classes." : "Admitted students in the school."} action={
        isAdmin && (<Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><UserPlus className="size-4" /> Admit student</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Admit student</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Full name</Label><Input name="fullName" required placeholder="e.g. Aarav Kumar" /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input name="email" type="email" required placeholder="student@example.com" /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Class</Label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger><SelectValue placeholder="Pick a class" /></SelectTrigger>
                  <SelectContent>
                    {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.section && ` · ${c.section}`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Admission #</Label><Input name="adm" placeholder="ADM-2026-001" /></div>
                <div className="space-y-1.5"><Label>Roll #</Label><Input name="roll" placeholder="01" /></div>
              </div>
              <p className="text-xs text-muted-foreground">A student login will be created automatically. A temporary password will be shown after admission — share it with the family.</p>
              <Button type="submit" className="w-full" disabled={saving}>{saving ? "Admitting…" : "Admit student"}</Button>
            </form>
          </DialogContent>
        </Dialog>)
      } />
      {isTeacher ? (
        <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card className="rounded-2xl p-4">
            <div className="text-xs text-muted-foreground">Total Assigned</div>
            <div className="font-display text-2xl font-semibold">{(students ?? []).length}</div>
          </Card>
          {(classes ?? []).map((c: any) => {
            const cnt = (students ?? []).filter((s: any) => s.class_id === c.id).length;
            return (
              <Card key={c.id} className="rounded-2xl p-4">
                <div className="text-xs text-muted-foreground">{c.name}{c.section && ` · ${c.section}`}</div>
                <div className="font-display text-2xl font-semibold">{cnt} <span className="text-xs font-normal text-muted-foreground">students</span></div>
              </Card>
            );
          })}
        </div>
        <Card className="rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-muted-foreground text-left">
                <tr>
                  <th className="p-3 font-medium">Roll</th>
                  <th className="p-3 font-medium">Student</th>
                  <th className="p-3 font-medium">Gender</th>
                  <th className="p-3 font-medium">Grade & Section</th>
                  <th className="p-3 font-medium">Attendance</th>
                  <th className="p-3 font-medium">Performance</th>
                  <th className="p-3 font-medium">Parent</th>
                  <th className="p-3 font-medium">Fee</th>
                  <th className="p-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(students ?? []).map((s: any) => {
                  const att = teacherExtras?.attMap[s.id];
                  const attPct = att && att.total ? Math.round((att.present / att.total) * 100) : null;
                  const perf = teacherExtras?.perfMap[s.id];
                  const perfPct = perf && perf.max ? Math.round((perf.got / perf.max) * 100) : null;
                  const pl = perfLabel(perfPct);
                  const parent = teacherExtras?.parentMap[s.id];
                  return (
                    <tr key={s.id} className="border-t hover:bg-muted/40">
                      <td className="p-3 font-medium text-muted-foreground">{s.roll_no || "—"}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-8"><AvatarFallback className="text-xs">{initials(s.profiles?.full_name)}</AvatarFallback></Avatar>
                          <div>
                            <div className="font-medium">{s.profiles?.full_name}</div>
                            <div className="text-xs text-muted-foreground">{s.admission_no || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 capitalize text-muted-foreground">{s.gender ?? "—"}</td>
                      <td className="p-3">{s.classes?.name}{s.classes?.section && ` · ${s.classes.section}`}</td>
                      <td className="p-3">
                        {attPct == null ? <span className="text-muted-foreground">—</span> : (
                          <span className={attPct >= 90 ? "text-emerald-600 font-medium" : attPct >= 75 ? "text-amber-600 font-medium" : "text-red-600 font-medium"}>{attPct}%</span>
                        )}
                      </td>
                      <td className={`p-3 font-medium ${pl.cls}`}>{pl.label}</td>
                      <td className="p-3">
                        {parent ? (
                          <div>
                            <div className="text-sm">{parent.name} <span className="text-[10px] uppercase text-muted-foreground">· {parent.rel}</span></div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="size-3" /> {parent.phone ?? "—"}
                            </div>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3">{feeBadge(teacherExtras?.feeMap[s.id])}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild size="icon" variant="ghost" title="View profile"><Link to="/students"><Eye className="size-4" /></Link></Button>
                          <Button asChild size="icon" variant="ghost" title="Mark attendance"><Link to="/attendance"><ClipboardCheck className="size-4" /></Link></Button>
                          <Button asChild size="icon" variant="ghost" title="Enter marks"><Link to="/gradebook"><BookOpenCheck className="size-4" /></Link></Button>
                          <Button asChild size="icon" variant="ghost" title="Assign homework"><Link to="/gradebook"><FileEdit className="size-4" /></Link></Button>
                          <Button asChild size="icon" variant="ghost" title="Message parent" disabled={!parent?.email}>
                            <a href={parent?.email ? `mailto:${parent.email}` : "#"}><Mail className="size-4" /></a>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(students ?? []).length === 0 && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No students in your assigned classes.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        </>
      ) : (
      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground text-left">
              <tr><th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Admission #</th><th className="p-3 font-medium">Class</th><th className="p-3 font-medium">Admitted</th></tr>
            </thead>
            <tbody>
              {(students ?? []).map((s: any) => (
                <tr key={s.id} className="border-t">
                  <td className="p-3 font-medium">{s.profiles?.full_name}</td>
                  <td className="p-3 text-muted-foreground">{s.admission_no || "—"}</td>
                  <td className="p-3">{s.classes ? `${s.classes.name}${s.classes.section ? ` · ${s.classes.section}` : ""}` : "—"}</td>
                  <td className="p-3 text-muted-foreground">{new Date(s.admission_date).toLocaleDateString()}</td>
                </tr>
              ))}
              {(students ?? []).length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No students admitted yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>)}
    </AppShell>
  );
}