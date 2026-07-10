import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bus, MapPin, Gauge, Phone } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/fleet")({
  component: () => (<RequireRole roles={["admin"]}><Page /></RequireRole>),
});

function Page() {
  const [selected, setSelected] = useState<string | null>(null);

  const { data: buses } = useQuery({
    queryKey: ["fleet-buses"],
    queryFn: async () => (await supabase.from("buses").select("*").order("number")).data ?? [],
  });

  const { data: locations } = useQuery({
    queryKey: ["fleet-locations"],
    queryFn: async () => (await supabase.from("bus_locations").select("*").order("recorded_at", { ascending: false })).data ?? [],
    refetchInterval: 15000,
  });

  const latestByBus = useMemo(() => {
    const m = new Map<string, any>();
    for (const l of locations ?? []) if (!m.has(l.bus_id)) m.set(l.bus_id, l);
    return m;
  }, [locations]);

  const current = useMemo(() => (buses ?? []).find((b: any) => b.id === selected) ?? (buses ?? [])[0] ?? null, [buses, selected]);
  const currentLoc = current ? latestByBus.get(current.id) : null;

  return (
    <AppShell>
      <PageHeader title="Fleet Tracking" subtitle="Live positions of school buses. Data refreshes every 15 seconds." />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-6">
        <Card className="rounded-2xl overflow-hidden">
          <div className="p-4 border-b font-medium flex items-center gap-2">
            <Bus className="size-4" /> Buses ({(buses ?? []).length})
          </div>
          <ul className="divide-y max-h-[70vh] overflow-y-auto">
            {(buses ?? []).map((b: any) => {
              const loc = latestByBus.get(b.id);
              const active = (current?.id ?? "") === b.id;
              return (
                <li key={b.id}>
                  <button
                    onClick={() => setSelected(b.id)}
                    className={`w-full text-left p-3 flex items-center gap-3 hover:bg-muted/40 ${active ? "bg-muted/60" : ""}`}
                  >
                    <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center">
                      <Bus className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">Bus {b.number}</div>
                      <div className="text-xs text-muted-foreground truncate">{b.route_name || "No route"}</div>
                    </div>
                    <Badge className={loc ? "bg-emerald-100 text-emerald-900 border-0" : "bg-slate-100 text-slate-700 border-0"}>
                      {loc ? "Live" : "Idle"}
                    </Badge>
                  </button>
                </li>
              );
            })}
            {(buses ?? []).length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">No buses on record.</li>}
          </ul>
        </Card>

        <Card className="rounded-2xl overflow-hidden">
          {current ? (
            <>
              <div className="p-5 border-b">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Bus</div>
                <div className="text-2xl font-semibold">#{current.number}</div>
                <div className="text-sm text-muted-foreground">{current.route_name || "No route assigned"}</div>
              </div>
              <div className="grid grid-cols-2 gap-4 p-5 border-b text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Driver</div>
                  <div className="font-medium">{current.driver_name || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="size-3" /> Phone</div>
                  <div className="font-medium">{current.driver_phone || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Capacity</div>
                  <div className="font-medium">{current.capacity} seats</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><Gauge className="size-3" /> Speed</div>
                  <div className="font-medium">{currentLoc?.speed != null ? `${Number(currentLoc.speed).toFixed(0)} km/h` : "—"}</div>
                </div>
              </div>
              <div className="aspect-[16/9] bg-muted relative overflow-hidden">
                {currentLoc ? (
                  <>
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage:
                          "linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)",
                        backgroundSize: "32px 32px",
                      }}
                    />
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
                      <div className="size-4 rounded-full bg-primary shadow-lg animate-pulse" />
                      <div className="rounded-lg bg-background/95 border px-3 py-1.5 text-xs font-mono shadow">
                        {Number(currentLoc.lat).toFixed(4)}, {Number(currentLoc.lng).toFixed(4)}
                      </div>
                    </div>
                    <div className="absolute bottom-3 left-3 flex items-center gap-1 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                      <MapPin className="size-3" /> Last seen {formatDistanceToNow(new Date(currentLoc.recorded_at), { addSuffix: true })}
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
                    No location data yet for this bus.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-muted-foreground">Select a bus to view details.</div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}