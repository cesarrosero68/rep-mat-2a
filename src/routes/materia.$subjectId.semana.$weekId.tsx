import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Loader2, PartyPopper } from "lucide-react";
import { VideoGrid } from "@/components/VideoGrid";
import {
  contentQuery,
  orderedWeeks,
  periodsQuery,
  progressQuery,
  resolvePdfUrl,
  setCompleted,
  subjectsQuery,
  weekDocumentsQuery,
  weeksQuery,
} from "@/lib/school";

const PdfViewer = lazy(() => import("@/components/PdfViewer"));

export const Route = createFileRoute("/materia/$subjectId/semana/$weekId")({
  head: () => ({
    meta: [
      { title: "Semana — Mi Cuaderno" },
      {
        name: "description",
        content: "Lee el documento de la semana, mira los videos y marca tu avance.",
      },
      { property: "og:title", content: "Semana — Mi Cuaderno" },
      {
        property: "og:description",
        content: "Lee el documento de la semana, mira los videos y marca tu avance.",
      },
    ],
  }),
  component: WeekPage,
});

function WeekPage() {
  const { subjectId, weekId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const subjects = useQuery(subjectsQuery);
  const periods = useQuery(periodsQuery);
  const weeks = useQuery(weeksQuery);
  const contents = useQuery(contentQuery(subjectId));
  const progress = useQuery(progressQuery);

  const subject = subjects.data?.find((s) => s.id === subjectId);
  const week = weeks.data?.find((w) => w.id === weekId);
  const content = contents.data?.find((c) => c.week_id === weekId);
  const documents = useQuery(weekDocumentsQuery(content?.id));
  const docs = documents.data ?? [];
  const done =
    !!content && !!progress.data?.find((p) => p.week_content_id === content.id && p.completed);
  const color = subject?.color ?? "#6366f1";

  const flat = orderedWeeks(periods.data ?? [], weeks.data ?? []);
  const idx = flat.findIndex((w) => w.id === weekId);
  const prev = idx > 0 ? flat[idx - 1] : undefined;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : undefined;

  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [cheer, setCheer] = useState(false);

  useEffect(() => setMounted(true), []);

  const firstDocId = docs[0]?.id ?? null;
  // Al cambiar de semana o al llegar la lista de documentos, selecciona el primero.
  useEffect(() => {
    setActiveDocId(firstDocId);
  }, [weekId, firstDocId]);

  const activeDoc = docs.find((d) => d.id === activeDocId) ?? docs[0];
  // Si hay documentos en week_documents, el pdf_url/embed_url de cada uno
  // manda (pueden ser null a propósito, para un documento que es solo un
  // video o una actividad embebida). El contenido viejo en week_content solo
  // se usa como respaldo cuando todavía no existe ningún documento migrado.
  const activePdfUrl = docs.length > 0 ? (activeDoc?.pdf_url ?? null) : (content?.pdf_url ?? null);
  const activeEmbedUrl = docs.length > 0 ? (activeDoc?.embed_url ?? null) : null;
  const activeVideos =
    docs.length > 0 ? (activeDoc?.youtube_links ?? []) : (content?.youtube_links ?? []);

  useEffect(() => {
    let alive = true;
    setPdfSrc(null);
    if (activePdfUrl) {
      resolvePdfUrl(activePdfUrl).then((u) => alive && setPdfSrc(u));
    }
    return () => {
      alive = false;
    };
  }, [activePdfUrl]);

  const toggle = useMutation({
    mutationFn: async () => {
      if (!content) return;
      await setCompleted(content.id, !done);
    },
    onSuccess: () => {
      if (!done) {
        setCheer(true);
        setTimeout(() => setCheer(false), 1800);
      }
      qc.invalidateQueries({ queryKey: ["progress"] });
    },
  });

  const showTabs = docs.length > 1;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-6">
      <Link
        to="/materia/$subjectId"
        params={{ subjectId }}
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {subject?.name ?? "Materia"}
      </Link>

      <h1 className="font-display text-3xl leading-tight sm:text-4xl" style={{ color }}>
        {week?.label ?? "…"}
      </h1>

      {showTabs && (
        <div className="mt-5 flex flex-wrap gap-2">
          {docs.map((d) => {
            const isActive = d.id === (activeDoc?.id ?? docs[0]?.id);
            return (
              <button
                key={d.id}
                onClick={() => setActiveDocId(d.id)}
                className="rounded-full border-2 px-4 py-2 text-sm font-bold transition-colors"
                style={
                  isActive
                    ? { borderColor: color, backgroundColor: color, color: "#fff" }
                    : { borderColor: color, backgroundColor: "transparent", color }
                }
              >
                {d.title}
              </button>
            );
          })}
        </div>
      )}

      <section className="mt-6">
        {activeEmbedUrl ? (
          <div className="overflow-hidden rounded-3xl border-4" style={{ borderColor: color }}>
            <iframe
              src={activeEmbedUrl}
              title={activeDoc?.title ?? "Actividad interactiva"}
              className="aspect-[4/3] w-full sm:aspect-video"
              allow="fullscreen *"
              allowFullScreen
            />
          </div>
        ) : activePdfUrl ? (
          pdfSrc && mounted ? (
            <Suspense
              fallback={
                <div className="flex h-72 items-center justify-center rounded-3xl bg-muted">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <PdfViewer url={pdfSrc} />
            </Suspense>
          ) : (
            <div className="flex h-72 items-center justify-center rounded-3xl bg-muted">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          )
        ) : activeVideos.length === 0 ? (
          <p className="rounded-3xl border-2 border-dashed border-border p-8 text-center text-muted-foreground">
            Todavía no hay documento para esta semana.
          </p>
        ) : null}
      </section>

      {activeVideos.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-display text-2xl">Videos de esta semana</h2>
          <VideoGrid videos={activeVideos} />
        </section>
      )}

      {content && (
        <section className="mt-10">
          <button
            onClick={() => toggle.mutate()}
            disabled={toggle.isPending}
            className="flex w-full items-center justify-center gap-3 rounded-3xl border-4 px-6 py-6 text-xl font-bold transition-transform active:scale-[0.98]"
            style={{
              borderColor: done ? "#16a34a" : color,
              backgroundColor: done ? "#16a34a" : "transparent",
              color: done ? "#fff" : color,
            }}
          >
            <span
              className="flex size-9 items-center justify-center rounded-full border-2"
              style={{ borderColor: done ? "#fff" : color }}
            >
              {done && <Check className="size-5" />}
            </span>
            {done ? "¡Semana completada!" : "Ya completé esta semana"}
          </button>
          {cheer && (
            <p className="mt-3 flex animate-bounce items-center justify-center gap-2 text-lg font-bold text-[#16a34a]">
              <PartyPopper className="size-6" /> ¡Muy bien!
            </p>
          )}
        </section>
      )}

      <nav className="mt-10 flex items-center justify-between gap-3">
        <button
          disabled={!prev}
          onClick={() =>
            prev &&
            navigate({
              to: "/materia/$subjectId/semana/$weekId",
              params: { subjectId, weekId: prev.id },
            })
          }
          className="inline-flex items-center gap-2 rounded-2xl border-2 border-border px-4 py-3 text-sm font-semibold disabled:opacity-40"
        >
          <ArrowLeft className="size-4" /> Semana anterior
        </button>
        <button
          disabled={!next}
          onClick={() =>
            next &&
            navigate({
              to: "/materia/$subjectId/semana/$weekId",
              params: { subjectId, weekId: next.id },
            })
          }
          className="inline-flex items-center gap-2 rounded-2xl border-2 border-border px-4 py-3 text-sm font-semibold disabled:opacity-40"
        >
          Semana siguiente <ArrowRight className="size-4" />
        </button>
      </nav>
    </main>
  );
}
