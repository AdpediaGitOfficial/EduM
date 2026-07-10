import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useState } from "react";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/classes")({
  component: () => (<RequireRole roles={["admin"]}><ClassesPage /></RequireRole>),
});

function ClassesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await supabase.from("classes").select("*").order("name")).data ?? [],
  });
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("classes").insert({
      name: String(fd.get("name")),
      section: String(fd.get("section") || ""),
      academic_year: String(fd.get("year") || "2025-2026"),
    });
    if (error) return toast.error(error.message);
    toast.success("Class added");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["classes"] });
  };
  return (
    <AppShell>
      <PageHeader title="Classes" subtitle="Sections running this academic year." action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="size-4" /> New class</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New class</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5"><Label>Name</Label><Input name="name" required placeholder="Grade 5" /></div>
              <div className="space-y-1.5"><Label>Section</Label><Input name="section" placeholder="A" /></div>
              <div className="space-y-1.5"><Label>Academic year</Label><Input name="year" defaultValue="2025-2026" required /></div>
              <Button type="submit" className="w-full">Save</Button>
            </form>
          </DialogContent>
        </Dialog>
      } />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(classes ?? []).map((c) => (
          <Card key={c.id} className="p-5 rounded-2xl">
            <div className="font-display text-lg font-semibold">{c.name}{c.section && <span className="text-muted-foreground"> · {c.section}</span>}</div>
            <div className="text-xs text-muted-foreground mt-1">{c.academic_year}</div>
          </Card>
        ))}
        {(classes ?? []).length === 0 && <p className="text-sm text-muted-foreground">No classes yet.</p>}
      </div>
    </AppShell>
  );
}