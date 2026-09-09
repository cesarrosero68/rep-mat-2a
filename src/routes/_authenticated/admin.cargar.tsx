import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Trash2, UploadCloud, Youtube } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PdfViewer from "@/components/PdfViewer";
import { periodsQuery, resolvePdfUrl, subjectsQuery, weeksQuery } from "@/lib/school";
import {
  addVideoOnlyDocument,
  addVideoToDocument,
  adminWeekDocumentsQuery,
  allContentQuery,
  deleteWeekDocument,
  ensureWeekContent,
  extractYoutubeId,
  imageToPdf,
  MAX_DOCUMENTS_PER_WEEK,
  MAX_UPLOAD_BYTES,
  updateWeekDocumentTitle,
  uploadAndAddDocument,
} from "@/lib/admin";

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
        content: "Sube los documentos de una materia y semana y revisa sus videos.",
      },
      { property: "og:title", content: "Cargar contenido — Administración" },
      {
        property: "og:description",
        content: "Sube los documentos de una materia y semana y revisa sus videos.",
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
  const [busy, setBusy] = useState<string | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTargetId, setVideoTargetId] = useState<string>("__new__");
  const fileRef = useRef<HTMLInputElement>(null);

  const existing = useMemo(
    () => (content.data ?? []).find((c) => c.subject_id === subjectId && c.week_id === weekId),
    [content.data, subjectId, weekId],
  );

  const documents = useQuery(adminWeekDocumentsQuery(existing?.id));
  const docs = documents.data ?? [];
  const atLimit = docs.length >= MAX_DOCUMENTS_PER_WEEK;
  const firstDocId = docs[0]?.id ?? null;

  // Por defecto, sugiere agregar el video al primer documento (normalmente el PDF principal).
  useEffect(() => {
    setVideoTargetId(firstDocId ?? "__new__");
  }, [firstDocId]);

  async function refreshDocs() {
    await qc.invalidateQueries({ queryKey: ["admin", "week_documents"] });
    await qc.invalidateQueries({ queryKey: ["admin", "week_content"] });
    await qc.invalidateQueries({ queryKey: ["admin", "week_documents_counts"] });
  }

  async function handleFile(rawFile: File | undefined) {
    if (!rawFile) return;
    if (!subjectId || !weekId) {
      toast.error("Elige materia y semana primero.");
      return;
    }
    if (atLimit) {
      toast.error(`Ya hay ${MAX_DOCUMENTS_PER_WEEK} documentos en esta semana, el máximo.`);
      return;
    }
    const isImage = rawFile.type.startsWith("image/");
    if (!isImage && rawFile.type !== "application/pdf") {
      toast.error("Solo se admiten archivos PDF o imágenes (JPG, PNG, WEBP).");
      return;
    }

    let file = rawFile;
    try {
      if (isImage) {
        setBusy("Convirtiendo la imagen a PDF…");
        file = await imageToPdf(rawFile);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo convertir la imagen.");
      setBusy(null);
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(
        `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)}MB. Por ahora el máximo recomendado es ${MAX_UPLOAD_BYTES / 1024 / 1024}MB — comprímelo primero.`,
      );
      setBusy(null);
      return;
    }
    const subject = subjects.data?.find((s) => s.id === subjectId);
    try {
      setBusy("Preparando…");
      const weekContentId = existing?.id ?? (await ensureWeekContent(subjectId, weekId));
      setBusy("Subiendo el documento… (puede tardar un poco con archivos grandes)");
      const title =
        rawFile.name.replace(/\.(pdf|jpe?g|png|webp)$/i, "").slice(0, 60) || "Documento";
      const result = await uploadAndAddDocument(
        file,
        subject?.name ?? "general",
        weekContentId,
        title,
        docs.length,
        (phase) => setBusy(phase),
      );
      if (result.processingError) {
        toast.warning(`Documento guardado, pero: ${result.processingError}`);
      } else if (result.skipped_too_large) {
        toast.warning(
          "Documento guardado. El PDF es muy pesado para detectar videos automáticamente — agrégalos a mano si tiene alguno.",
        );
      } else if (isImage) {
        toast.success("Imagen agregada como documento (convertida a PDF).");
      } else {
        toast.success(
          `Documento agregado. ${result.youtube_links?.length ?? 0} video(s) detectado(s).`,
        );
      }
      await refreshDocs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error subiendo el archivo.");
    } finally {
      setBusy(null);
    }
  }

  async function onAddVideo() {
    if (!subjectId || !weekId) {
      toast.error("Elige materia y semana primero.");
      return;
    }
    const id = extractYoutubeId(videoUrl);
    if (!id) {
      toast.error("No reconozco ese link o ID de YouTube.");
      return;
    }
    try {
      setBusy("Agregando video…");
      if (videoTargetId === "__new__") {
        if (atLimit) {
          toast.error(`Ya hay ${MAX_DOCUMENTS_PER_WEEK} documentos en esta semana, el máximo.`);
          return;
        }
        const weekContentId = existing?.id ?? (await ensureWeekContent(subjectId, weekId));
        await addVideoOnlyDocument({
          week_content_id: weekContentId,
          title: videoTitle.trim() || "Video",
          video_id: id,
          video_title: videoTitle.trim() || null,
          order: docs.length,
        });
        toast.success("Video agregado como documento nuevo.");
      } else {
        const target = docs.find((d) => d.id === videoTargetId);
        await addVideoToDocument(
          videoTargetId,
          target?.youtube_links ?? [],
          id,
          videoTitle.trim() || null,
        );
        toast.success(`Video agregado a "${target?.title ?? "documento"}".`);
      }
      setVideoTitle("");
      setVideoUrl("");
      await refreshDocs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo agregar el video.");
    } finally {
      setBusy(null);
    }
  }

  async function onDeleteDoc(id: string) {
    if (!confirm("¿Eliminar este documento? Esta acción no se puede deshacer.")) return;
    try {
      await deleteWeekDocument(id);
      if (previewFor === id) {
        setPreviewFor(null);
        setPreviewUrl(null);
      }
      await refreshDocs();
      toast.success("Documento eliminado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar.");
    }
  }

  async function onRenameDoc(id: string, title: string) {
    try {
      await updateWeekDocumentTitle(id, title);
      await refreshDocs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo renombrar.");
    }
  }

  async function onTogglePreview(id: string, pdfUrl: string | null) {
    if (previewFor === id) {
      setPreviewFor(null);
      setPreviewUrl(null);
      return;
    }
    setPreviewFor(id);
    setPreviewUrl(null);
    if (pdfUrl) {
      const url = await resolvePdfUrl(pdfUrl);
      setPreviewUrl(url);
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

      {subjectId && weekId && (
        <>
          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Documentos de esta semana ({docs.length}/{MAX_DOCUMENTS_PER_WEEK})
              </h2>
            </div>

            {docs.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Todavía no hay documentos en esta semana. Agrega el primero abajo.
              </p>
            ) : (
              <ul className="space-y-3">
                {docs.map((d) => (
                  <li key={d.id} className="rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <Input
                        value={d.title}
                        placeholder="Título del documento (ej. Guía, Actividades)"
                        onChange={(e) => onRenameDoc(d.id, e.target.value)}
                        className="flex-1"
                      />
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {d.pdf_filename ?? "Solo video"}
                      </span>
                      {d.pdf_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onTogglePreview(d.id, d.pdf_url)}
                        >
                          {previewFor === d.id ? "Ocultar" : "Ver"}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar documento"
                        onClick={() => onDeleteDoc(d.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {d.youtube_links && d.youtube_links.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {d.youtube_links.length} video(s) en este documento.
                      </p>
                    )}
                    {previewFor === d.id && (
                      <div className="mt-3">
                        {previewUrl ? (
                          <PdfViewer url={previewUrl} />
                        ) : (
                          <div className="flex h-40 items-center justify-center rounded-lg bg-muted">
                            <Loader2 className="size-6 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6">
            <Label className="mb-2 block">
              {atLimit ? "Límite de documentos alcanzado" : "Agregar documento"}
            </Label>
            <div
              onDragOver={(e) => !atLimit && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!atLimit) handleFile(e.dataTransfer.files?.[0]);
              }}
              onClick={() => !atLimit && fileRef.current?.click()}
              aria-disabled={atLimit}
              className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center text-sm text-muted-foreground ${
                atLimit ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-accent/40"
              }`}
            >
              {busy ? (
                <>
                  <Loader2 className="size-6 animate-spin" />
                  {busy}
                </>
              ) : (
                <>
                  <UploadCloud className="size-6" />
                  {atLimit
                    ? `Ya hay ${MAX_DOCUMENTS_PER_WEEK} documentos, el máximo por semana`
                    : "Arrastra un PDF o una imagen aquí, o haz clic para elegirlo"}
                  {!atLimit && (
                    <span className="text-xs text-muted-foreground">
                      PDF, JPG, PNG o WEBP — máximo recomendado: {MAX_UPLOAD_BYTES / 1024 / 1024}MB
                      por archivo
                    </span>
                  )}
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={atLimit}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          </section>

          <section className="mt-6">
            <Label className="mb-2 block">Agregar un video</Label>
            <div className="space-y-2 rounded-lg border p-4">
              <div className="grid gap-2 sm:grid-cols-[220px_1fr]">
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={videoTargetId}
                  onChange={(e) => setVideoTargetId(e.target.value)}
                >
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>
                      Agregar a: {d.title}
                    </option>
                  ))}
                  <option value="__new__" disabled={atLimit}>
                    {atLimit ? "Límite de documentos alcanzado" : "Nuevo documento (solo video)"}
                  </option>
                </select>
                <Input
                  value={videoUrl}
                  placeholder="Link o ID de YouTube"
                  onChange={(e) => setVideoUrl(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Input
                  value={videoTitle}
                  placeholder={
                    videoTargetId === "__new__"
                      ? "Título del video (se usará como título del documento)"
                      : "Título del video (opcional)"
                  }
                  onChange={(e) => setVideoTitle(e.target.value)}
                  className="flex-1"
                />
                <Button type="button" variant="secondary" disabled={!!busy} onClick={onAddVideo}>
                  <Youtube className="size-4" /> Agregar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {docs.length > 0
                  ? "Elige a qué documento pertenece este video para que se vea junto a su PDF, o crea uno nuevo si es un video suelto."
                  : "Todavía no hay documentos en esta semana, así que el video se guardará como un documento nuevo."}
              </p>
            </div>
          </section>
        </>
      )}

      <div className="mt-8 flex justify-end gap-2">
        <Button onClick={() => navigate({ to: "/admin" })}>Listo</Button>
      </div>
    </main>
  );
}
