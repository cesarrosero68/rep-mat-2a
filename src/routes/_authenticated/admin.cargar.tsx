import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PdfViewer from "@/components/PdfViewer";
import {
  periodsQuery,
  resolvePdfUrl,
  subjectsQuery,
  weeksQuery,
  type YoutubeLink,
} from "@/lib/school";
import { allContentQuery, processPdf, saveWeekContent, uploadPdf } from "@/lib/admin";

type Search = { subject?: string | undefined; week?: string | undefined };

export const Route = createFileRoute("/_authenticated/admin/cargar")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    subject: typeof s["subject"] === "string" ? s["subject"] : undefined,
    week: typeof s["week"] === "string" ? s["week"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Cargar contenido — Administración" },
      {
        name: "description",
        content: "Sube el PDF de una materia y semana y revisa sus videos.",
      },
      { property: "og:title", content: "Cargar contenido — Administración" },
      {
        property: "og:description",
        content: "Sube el PDF de una materia y semana y revisa sus videos.",
      },
    ],
  }),
  component: AdminUpload,
});

function AdminUpload() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const subjects = useQuery(subjectsQuery);
  const periods = useQuery(periodsQuery);
  const weeks = useQuery(weeksQuery);
  const content = useQuery(allContentQuery);

  const [subjectId, setSubjectId] = useState(search.subject ?? "");
  const [weekId, setWeekId] = useState(search.week ?? "");
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [links, setLinks] = useState<YoutubeLink[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const existing = useMemo(
    () => (content.data ?? []).find((c) => c.subject_id === subjectId && c.week_id === weekId),
    [content.data, subjectId, weekId],
  );

  useEffect(() => {
    setPdfPath(existing?.pdf_url ?? null);
    setPdfName(existing?.pdf_filename ?? null);
    setLinks(existing?.youtube_links ?? []);
  }, [subjectId, weekId, existing]);

  useEffect(() => {
    let alive = true;
    setPreviewUrl(null);
    if (pdfPath) {
      resolvePdfUrl(pdfPath).then((u) => alive && setPreviewUrl(u));
    }
    return () => {
      alive = false;
    };
  }, [pdfPath]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!subjectId || !weekId) {
      toast.error("Elige materia y semana primero.");
      return;
    }
    const subject = subjects.data?.find((s) => s.id === subjectId);
    try {
      setBusy("Subiendo el PDF…");
      const path = await uploadPdf(file, subject?.name ?? "general");
      setPdfPath(path);
      setPdfName(file.name);
      setBusy("Leyendo el PDF y buscando videos…");
      const result = await processPdf(path);
      setLinks(result.youtube_links ?? []);
      toast.success(`${result.youtube_links?.length ?? 0} video(s) detectado(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error subiendo el archivo.");
    } finally {
      setBusy(null);
    }
  }

  async function onSave() {
    if (!subjectId || !weekId) {
      toast.error("Elige materia y semana.");
      return;
    }
    if (existing && !confirm("Esta semana ya tiene contenido, se va a reemplazar.")) return;
    try {
      setBusy("Guardando…");
      await saveWeekContent({
        subject_id: subjectId,
        week_id: weekId,
        pdf_url: pdfPath,
        pdf_filename: pdfName,
        youtube_links: links.map((l, i) => ({ ...l, position_in_doc: i + 1 })),
      });
      await qc.invalidateQueries({ queryKey: ["admin", "week_content"] });
      toast.success("Contenido guardado.");
      navigate({ to: "/admin" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8 font-sans">
      <Link
        to="/admin"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Volver al panel
      </Link>
      <h1 className="mb-6 text-2xl font-semibold">Cargar contenido</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="materia">Materia</Label>
          <select
            id="materia"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">Selecciona…</option>
            {(subjects.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="semana">Semana</Label>
          <select
            id="semana"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={weekId}
            onChange={(e) => setWeekId(e.target.value)}
          >
            <option value="">Selecciona…</option>
            {(periods.data ?? []).map((p) => (
              <optgroup key={p.id} label={p.name}>
                {(weeks.data ?? [])
                  .filter((w) => w.period_id === p.id)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {existing && (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Esta semana ya tiene contenido cargado
          {existing.pdf_filename ? ` (${existing.pdf_filename})` : ""}. Al guardar se reemplazará.
        </p>
      )}

      <section className="mt-6">
        <Label className="mb-2 block">Archivo PDF</Label>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => fileRef.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center text-sm text-muted-foreground hover:bg-accent/40"
        >
          {busy ? (
            <>
              <Loader2 className="size-6 animate-spin" />
              {busy}
            </>
          ) : (
            <>
              <UploadCloud className="size-6" />
              Arrastra el PDF aquí o haz clic para elegirlo
              {pdfName && <span className="font-medium text-foreground">{pdfName}</span>}
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      </section>

      {previewUrl && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Vista previa</h2>
          <PdfViewer url={previewUrl} />
        </section>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Videos detectados ({links.length})</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setLinks((l) => [...l, { video_id: "", title: "", position_in_doc: l.length + 1 }])
            }
          >
            <Plus className="size-4" /> Agregar video
          </Button>
        </div>
        <ul className="space-y-3">
          {links.map((l, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border p-3">
              {l.video_id ? (
                <img
                  src={`https://img.youtube.com/vi/${l.video_id}/default.jpg`}
                  alt={l.title ?? "Miniatura del video"}
                  className="h-12 w-20 rounded object-cover"
                />
              ) : (
                <span className="h-12 w-20 rounded bg-muted" />
              )}
              <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_180px]">
                <Input
                  value={l.title ?? ""}
                  placeholder="Título del video"
                  onChange={(e) =>
                    setLinks((arr) =>
                      arr.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                    )
                  }
                />
                <Input
                  value={l.video_id}
                  placeholder="ID de YouTube"
                  onChange={(e) =>
                    setLinks((arr) =>
                      arr.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              video_id:
                                e.target.value.match(
                                  /(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/,
                                )?.[1] ?? e.target.value.trim(),
                            }
                          : x,
                      ),
                    )
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Eliminar video"
                onClick={() => setLinks((arr) => arr.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
          {links.length === 0 && (
            <li className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Todavía no hay videos. Se detectan al subir el PDF, o agrégalos a mano.
            </li>
          )}
        </ul>
      </section>

      <div className="mt-8 flex justify-end gap-2">
        <Button variant="outline" asChild>
          <Link to="/admin">Cancelar</Link>
        </Button>
        <Button onClick={onSave} disabled={!!busy}>
          Guardar
        </Button>
      </div>
    </main>
  );
}
