import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Lock } from "lucide-react";
import { SubjectIcon } from "@/components/SubjectIcon";
import {
  contentQuery,
  periodsQuery,
  progressQuery,
  subjectsQuery,
  weeksQuery,
} from "@/lib/school";

export const Route = createFileRoute("/materia/$subjectId/")({
  head: () => ({
    meta: [
      { title: "Materia — Mi Cuaderno" },
      {
        name: "description",
        content: "Todas las semanas de la materia, organizadas por periodo.",
      },
      { property: "og:title", content: "Materia — Mi Cuaderno" },
      {
        property: "og:description",
        content: "Todas las semanas de la materia, organizadas por periodo.",
      },
    ],
  }),
  component: SubjectPage,
});

function SubjectPage() {
  const { subjectId } = Route.useParams();
  const subjects = useQuery(subjectsQuery);
  const periods = useQuery(periodsQuery);
  const weeks = useQuery(weeksQuery);
  const contents = useQuery(contentQuery(subjectId));
  const progress = useQuery(progressQuery);

  const subject = subjects.data?.find((s) => s.id === subjectId);
  const contentByWeek = new Map((contents.data ?? []).map((c) => [c.week_id, c]));
  const doneIds = new Set(
    (progress.data ?? []).filter((p) => p.completed).map((p) => p.week_content_id),
  );
  const color = subject?.color ?? "#6366f1";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Materias
      </Link>

      <header className="mb-6 flex items-center gap-4">
        <span
          className="flex size-14 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${color}1f`, color }}
        >
          <SubjectIcon name={subject?.icon ?? "BookOpen"} className="size-7" />
        </span>
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">
          {subject?.name ?? "…"}
        </h1>
      </header>

      <div className="space-y-8">
        {(periods.data ?? []).map((p) => (
          <section key={p.id}>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {p.name}
            </h2>
            <ul className="space-y-2">
              {(weeks.data ?? [])
                .filter((w) => w.period_id === p.id)
                .map((w) => {
                  const c = contentByWeek.get(w.id);
                  const done = c ? doneIds.has(c.id) : false;
                  if (!c) {
                    return (
                      <li
                        key={w.id}
                        className="flex items-center justify-between rounded-2xl border-2 border-dashed border-border px-4 py-3 text-muted-foreground"
                      >
                        <span className="text-base font-semibold">{w.label}</span>
                        <span className="flex items-center gap-1 text-xs font-semibold">
                          <Lock className="size-3.5" /> Próximamente
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={w.id}>
                      <Link
                        to="/materia/$subjectId/semana/$weekId"
                        params={{ subjectId, weekId: w.id }}
                        className="flex items-center justify-between rounded-2xl border-2 bg-card px-4 py-3 shadow-sm transition-transform hover:-translate-y-0.5"
                        style={{ borderColor: done ? "#16a34a" : color }}
                      >
                        <span className="text-base font-semibold">{w.label}</span>
                        {done ? (
                          <span className="flex size-7 items-center justify-center rounded-full bg-[#16a34a] text-white">
                            <Check className="size-4" />
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-muted-foreground">
                            Abrir
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
