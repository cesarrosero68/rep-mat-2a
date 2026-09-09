import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { periodsQuery, subjectsQuery, weeksQuery } from "@/lib/school";
import { allContentQuery, allDocumentCountsQuery } from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Avance de carga — Administración" },
      {
        name: "description",
        content: "Matriz de materias y semanas con contenido cargado.",
      },
      { property: "og:title", content: "Avance de carga — Administración" },
      {
        property: "og:description",
        content: "Matriz de materias y semanas con contenido cargado.",
      },
    ],
  }),
  component: AdminOverview,
});

function AdminOverview() {
  const navigate = useNavigate();
  const subjects = useQuery(subjectsQuery);
  const periods = useQuery(periodsQuery);
  const weeks = useQuery(weeksQuery);
  const content = useQuery(allContentQuery);
  const docCounts = useQuery(allDocumentCountsQuery);

  const subjectList = subjects.data ?? [];
  const periodList = periodsQuery && (periods.data ?? []);
  const weekList = weeks.data ?? [];
  const counts = docCounts.data ?? {};
  // Una celda cuenta como cargada si su week_content tiene al menos un documento.
  const loaded = new Set(
    (content.data ?? [])
      .filter((c) => (counts[c.id] ?? 0) > 0)
      .map((c) => `${c.subject_id}|${c.week_id}`),
  );
  const total = subjectList.length * weekList.length;

  return (
    <main className="mx-auto w-full max-w-[1400px] px-6 py-8 font-sans">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Panel de administración</h1>
          <p className="text-sm text-muted-foreground">
            {loaded.size} de {total} celdas materia × semana con contenido cargado
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link to="/admin/cargar">Cargar contenido</Link>
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            Salir
          </Button>
        </div>
      </header>

      <div className="overflow-auto rounded-lg border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60">
              <th className="sticky left-0 z-10 border-b border-r bg-muted/60 p-2 text-left">
                Materia
              </th>
              {(periodList || []).map((p) =>
                weekList
                  .filter((w) => w.period_id === p.id)
                  .map((w, i, arr) => (
                    <th
                      key={w.id}
                      title={`${p.name} · ${w.label}`}
                      className={`border-b p-1 text-[10px] font-medium ${
                        i === arr.length - 1 ? "border-r-2 border-r-foreground/30" : ""
                      }`}
                    >
                      <span className="block whitespace-nowrap">{w.label}</span>
                      {i === 0 && (
                        <span className="block text-[9px] uppercase text-muted-foreground">
                          {p.name}
                        </span>
                      )}
                    </th>
                  )),
              )}
            </tr>
          </thead>
          <tbody>
            {subjectList.map((s) => {
              const done = weekList.filter((w) => loaded.has(`${s.id}|${w.id}`)).length;
              return (
                <tr key={s.id} className="hover:bg-muted/30">
                  <th className="sticky left-0 z-10 border-b border-r bg-card p-2 text-left font-medium">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.name}
                      <span className="text-xs text-muted-foreground">
                        {done}/{weekList.length}
                      </span>
                    </span>
                  </th>
                  {(periodList || []).map((p) =>
                    weekList
                      .filter((w) => w.period_id === p.id)
                      .map((w) => {
                        const has = loaded.has(`${s.id}|${w.id}`);
                        return (
                          <td key={w.id} className="border-b p-0 text-center">
                            <Link
                              to="/admin/cargar"
                              search={{ subject: s.id, week: w.id }}
                              className="block px-2 py-2 hover:bg-accent"
                              title={`${s.name} · ${w.label}`}
                            >
                              {has ? "✅" : "⚪"}
                            </Link>
                          </td>
                        );
                      }),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
