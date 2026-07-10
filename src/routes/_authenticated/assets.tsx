import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Package } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/assets")({
  component: () => (<RequireRole roles={["admin"]}><Page /></RequireRole>),
});

const STATUS_META: Record<string, string> = {
  in_use: "bg-emerald-100 text-emerald-900",
  storage: "bg-slate-100 text-slate-900",
  repair: "bg-amber-100 text-amber-900",
  retired: "bg-red-100 text-red-900",
};

function Page() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("in_use");
  const [condition, setCondition] = useState("good");

  const { data: assets } = useQuery({
    queryKey: ["assets-list"],
    queryFn: async () => (await supabase.from("assets").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (assets ?? []).filter((a: any) =>
      !t || (a.name || "").toLowerCase().includes(t) || (a.category || "").toLowerCase().includes(t) || (a.location || "").toLowerCase().includes(t)
    );
  }, [assets, q]);

  const totals = useMemo(() => {
    const t = { total: (assets ?? []).length, in_use: 0, repair: 0, retired: 0 };
    for (const a of assets ?? []) {
      if (a.status === "in_use") t.in_use++;
      else if (a.status === "repair") t.repair++;
      else if (a.status === "retired") t.retired++;
    }
    return t;
  }, [assets]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("assets").insert({
      name: String(fd.get("name") || ""),
      category: String(fd.get("category") || "") || null,
      location: String(fd.get("location") || "") || null,
      status,
      condition,
    });
    if (error) return toast.error(error.message);
    toast.success("Asset added");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["assets-list"] });
  };

  return (
    <AppShell>
      <PageHeader
        title="Asset Registry"
        subtitle="Track school assets with location, condition, and lifecycle status."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="size-4" /> New asset</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add asset</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5"><Label>Name</Label><Input name="name" required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Category</Label><Input name="category" placeholder="Furniture, IT…" /></div>
                  <div className="space-y-1.5"><Label>Location</Label><Input name="location" placeholder="Room 204" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_use">In use</SelectItem>
                        <SelectItem value="storage">Storage</SelectItem>
                        <SelectItem value="repair">Repair</SelectItem>
                        <SelectItem value="retired">Retired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Condition</Label>
                    <Select value={condition} onValueChange={setCondition}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="good">Good</SelectItem>
                        <SelectItem value="fair">Fair</SelectItem>
                        <SelectItem value="poor">Poor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full">Save</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card className="p-4 rounded-2xl"><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-semibold">{totals.total}</div></Card>
        <Card className="p-4 rounded-2xl"><div className="text-xs text-muted-foreground">In use</div><div className="text-2xl font-semibold text-emerald-600">{totals.in_use}</div></Card>
        <Card className="p-4 rounded-2xl"><div className="text-xs text-muted-foreground">In repair</div><div className="text-2xl font-semibold text-amber-600">{totals.repair}</div></Card>
        <Card className="p-4 rounded-2xl"><div className="text-xs text-muted-foreground">Retired</div><div className="text-2xl font-semibold text-red-600">{totals.retired}</div></Card>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <div className="p-4 border-b flex items-center gap-3">
          <Package className="size-4 text-muted-foreground" />
          <div className="font-medium">Assets</div>
          <div className="ml-auto relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assets…" className="pl-9" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-3">Name</th><th className="p-3">Category</th><th className="p-3">Location</th><th className="p-3">Condition</th><th className="p-3">Status</th></tr>
            </thead>
            <tbody>
              {filtered.map((a: any) => (
                <tr key={a.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 font-medium">{a.name}</td>
                  <td className="p-3">{a.category || "—"}</td>
                  <td className="p-3">{a.location || "—"}</td>
                  <td className="p-3 capitalize">{a.condition}</td>
                  <td className="p-3"><Badge className={`${STATUS_META[a.status] ?? ""} border-0 capitalize`}>{a.status.replace("_", " ")}</Badge></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No assets yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}