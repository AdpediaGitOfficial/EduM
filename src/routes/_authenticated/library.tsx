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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BookOpen, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/library")({
  component: () => (<RequireRole roles={["admin", "teacher"]}><Page /></RequireRole>),
});

function Page() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const { data: books } = useQuery({
    queryKey: ["library-books"],
    queryFn: async () => (await supabase.from("library_books").select("*").order("title")).data ?? [],
  });

  const { data: loans } = useQuery({
    queryKey: ["library-loans"],
    queryFn: async () =>
      (await supabase
        .from("library_loans")
        .select("id,issued_at,due_at,returned_at,library_books(title),students(admission_no,profiles(full_name))")
        .order("issued_at", { ascending: false })
        .limit(50)).data ?? [],
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (books ?? []).filter((b: any) =>
      !t || (b.title || "").toLowerCase().includes(t) || (b.author || "").toLowerCase().includes(t) || (b.isbn || "").toLowerCase().includes(t)
    );
  }, [books, q]);

  const totals = useMemo(() => {
    let titles = (books ?? []).length, total = 0, avail = 0;
    for (const b of books ?? []) { total += b.total_copies; avail += b.available_copies; }
    const onLoan = (loans ?? []).filter((l: any) => !l.returned_at).length;
    return { titles, total, avail, onLoan };
  }, [books, loans]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const copies = Number(fd.get("copies") || 1);
    const { error } = await supabase.from("library_books").insert({
      title: String(fd.get("title") || ""),
      author: String(fd.get("author") || "") || null,
      isbn: String(fd.get("isbn") || "") || null,
      category: String(fd.get("category") || "") || null,
      total_copies: copies,
      available_copies: copies,
    });
    if (error) return toast.error(error.message);
    toast.success("Book added");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["library-books"] });
  };

  return (
    <AppShell>
      <PageHeader
        title="Library"
        subtitle="Book catalog and circulation activity."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="size-4" /> New book</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add book</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5"><Label>Title</Label><Input name="title" required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Author</Label><Input name="author" /></div>
                  <div className="space-y-1.5"><Label>ISBN</Label><Input name="isbn" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Category</Label><Input name="category" placeholder="Fiction, Science…" /></div>
                  <div className="space-y-1.5"><Label>Copies</Label><Input name="copies" type="number" min={1} defaultValue={1} /></div>
                </div>
                <Button type="submit" className="w-full">Save</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card className="p-4 rounded-2xl"><div className="text-xs text-muted-foreground">Titles</div><div className="text-2xl font-semibold">{totals.titles}</div></Card>
        <Card className="p-4 rounded-2xl"><div className="text-xs text-muted-foreground">Total copies</div><div className="text-2xl font-semibold">{totals.total}</div></Card>
        <Card className="p-4 rounded-2xl"><div className="text-xs text-muted-foreground">Available</div><div className="text-2xl font-semibold text-emerald-600">{totals.avail}</div></Card>
        <Card className="p-4 rounded-2xl"><div className="text-xs text-muted-foreground">On loan</div><div className="text-2xl font-semibold text-amber-600">{totals.onLoan}</div></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        <Card className="rounded-2xl overflow-hidden">
          <div className="p-4 border-b flex items-center gap-3">
            <BookOpen className="size-4 text-muted-foreground" />
            <div className="font-medium">Catalog</div>
            <div className="ml-auto relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search books…" className="pl-9" />
            </div>
          </div>
          <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
                <tr><th className="p-3">Title</th><th className="p-3">Author</th><th className="p-3">Category</th><th className="p-3">Avail / Total</th></tr>
              </thead>
              <tbody>
                {filtered.map((b: any) => (
                  <tr key={b.id} className="border-t hover:bg-muted/40">
                    <td className="p-3 font-medium">{b.title}</td>
                    <td className="p-3">{b.author || "—"}</td>
                    <td className="p-3">{b.category || "—"}</td>
                    <td className="p-3 font-mono text-xs">{b.available_copies} / {b.total_copies}</td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No books yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="rounded-2xl overflow-hidden">
          <div className="p-4 border-b font-medium">Recent loans</div>
          <ul className="divide-y max-h-[65vh] overflow-y-auto">
            {(loans ?? []).map((l: any) => {
              const overdue = !l.returned_at && new Date(l.due_at) < new Date();
              return (
                <li key={l.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium truncate">{l.library_books?.title}</div>
                    <Badge className={l.returned_at ? "bg-slate-100 text-slate-700 border-0" : overdue ? "bg-red-100 text-red-900 border-0" : "bg-amber-100 text-amber-900 border-0"}>
                      {l.returned_at ? "Returned" : overdue ? "Overdue" : "On loan"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {l.students?.profiles?.full_name} · issued {format(new Date(l.issued_at), "dd MMM")} · due {format(new Date(l.due_at), "dd MMM")}
                  </div>
                </li>
              );
            })}
            {(loans ?? []).length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">No loans recorded.</li>}
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}