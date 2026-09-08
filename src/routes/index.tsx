import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SubjectIcon } from "@/components/SubjectIcon";
import {
  contentQuery,
  progressQuery,
  subjectsQuery,
  weeksQuery,
  type Subject,
} from "@/lib/school";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mi Cuaderno — Clases por materia y semana" },
      {
        name: "description",
        content:
          "Estudia a tu ritmo: entra a cada materia, abre la semana, lee el PDF, mira los videos y marca tu avance.",
      },
      { property: "og:title", content: "Mi Cuaderno — Clases por materia y semana" },
      {
        property: "og:description",
        content:
          "Estudia a tu ritmo: entra a cada materia, abre la semana, lee el PDF, mira los videos y marca tu avance.",
      },
    ],
  }),
  component: Home,
});

type Stat = { total: number; done: number };

function Home() {
  const subjects = useQuery(subjectsQuery);
  const weeks = useQuery(weeksQuery);
  const progress = useQuery(progressQuery);

  const contents = useQuery({
    queryKey: ["week_content_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("week_content")
        .select("id,subject_id");
      if (error) throw error;
      return data as { id: string; subject_id: string }[];
    },
  });

  const doneIds = new Set(
    (progress.data ?? []).filter((p) => p.completed).map((p) => p.week_content_id),
  );
  const totalWeeks = weeks.data?.length ?? 0;

  const statFor = (s: Subject): Stat => {
    const mine = (contents.data ?? []).filter((c) => c.subject_id === s.id);
    return {
      total: totalWeeks,
      done: mine.filter((c) => doneIds.has(c.id)).length,
    };
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8">
      <header className="mb-8">
        <p className="text-base font-semibold text-muted-foreground">Mi cuaderno</p>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">
          ¿Qué vamos a estudiar hoy?
        </h1>
      </header>

      {subjects.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-3xl bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(subjects.data ?? []).map((s) => {
            const st = statFor(s);
            const pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
            return (
              <Link
                key={s.id}
                to="/materia/$subjectId"
                params={{ subjectId: s.id }}
                className="group rounded-3xl border-2 border-border bg-card p-5 shadow-sm transition-transform hover:-translate-y-1"
                style={{ borderColor: s.color }}
              >
                <span
                  className="mb-4 flex size-14 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: `${s.color}1f`, color: s.color }}
                >
                  <SubjectIcon name={s.icon} className="size-7" />
                </span>
                <h2 className="font-display text-xl leading-tight">{s.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {st.done}/{st.total} semanas completadas
                </p>
                <span className="mt-3 block h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: s.color }}
                  />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
