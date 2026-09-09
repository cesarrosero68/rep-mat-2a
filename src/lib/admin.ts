import { supabase } from "@/integrations/supabase/client";
import type { WeekDocument, YoutubeLink } from "@/lib/school";

export type AdminContentRow = {
  id: string;
  subject_id: string;
  week_id: string;
  pdf_url: string | null;
  pdf_filename: string | null;
  youtube_links: YoutubeLink[] | null;
};

export const MAX_DOCUMENTS_PER_WEEK = 5;

export const allContentQuery = {
  queryKey: ["admin", "week_content"],
  queryFn: async (): Promise<AdminContentRow[]> => {
    const { data, error } = await supabase
      .from("week_content")
      .select("id,subject_id,week_id,pdf_url,pdf_filename,youtube_links");
    if (error) throw error;
    return (data ?? []) as AdminContentRow[];
  },
};

/** Cuenta de documentos por week_content_id, para pintar ✅/⚪ en la vista general. */
export const allDocumentCountsQuery = {
  queryKey: ["admin", "week_documents_counts"],
  queryFn: async (): Promise<Record<string, number>> => {
    const { data, error } = await supabase.from("week_documents").select("week_content_id");
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.week_content_id] = (counts[row.week_content_id] ?? 0) + 1;
    }
    return counts;
  },
};

export const adminWeekDocumentsQuery = (weekContentId: string | undefined) => ({
  queryKey: ["admin", "week_documents", weekContentId],
  queryFn: async (): Promise<WeekDocument[]> => {
    if (!weekContentId) return [];
    const { data, error } = await supabase
      .from("week_documents")
      .select("id,week_content_id,title,pdf_url,pdf_filename,youtube_links,order")
      .eq("week_content_id", weekContentId)
      .order("order");
    if (error) throw error;
    return (data ?? []) as WeekDocument[];
  },
  enabled: !!weekContentId,
});

/** Crea (o reutiliza) la fila `week_content` que agrupa materia+semana, sin tocar documentos. */
export async function ensureWeekContent(subjectId: string, weekId: string): Promise<string> {
  const { data: existing, error: findError } = await supabase
    .from("week_content")
    .select("id")
    .eq("subject_id", subjectId)
    .eq("week_id", weekId)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id;

  const { data: created, error: insertError } = await supabase
    .from("week_content")
    .insert({ subject_id: subjectId, week_id: weekId })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return created.id;
}

export async function addWeekDocument(input: {
  week_content_id: string;
  title: string;
  pdf_url?: string | null;
  pdf_filename?: string | null;
  youtube_links: YoutubeLink[];
  order: number;
}) {
  const { error } = await supabase.from("week_documents").insert(input);
  if (error) throw error;
}

/** Agrega un documento que es solo un video de YouTube, sin PDF. */
export async function addVideoOnlyDocument(input: {
  week_content_id: string;
  title: string;
  video_id: string;
  video_title: string | null;
  order: number;
}) {
  await addWeekDocument({
    week_content_id: input.week_content_id,
    title: input.title,
    pdf_url: null,
    pdf_filename: null,
    youtube_links: [{ video_id: input.video_id, title: input.video_title, position_in_doc: 1 }],
    order: input.order,
  });
}

/** Agrega un video al youtube_links de un documento YA existente (queda junto a su PDF). */
export async function addVideoToDocument(
  documentId: string,
  currentLinks: YoutubeLink[],
  video_id: string,
  video_title: string | null,
) {
  const links = [
    ...currentLinks,
    { video_id, title: video_title, position_in_doc: currentLinks.length + 1 },
  ];
  const { error } = await supabase
    .from("week_documents")
    .update({ youtube_links: links })
    .eq("id", documentId);
  if (error) throw error;
}

export async function updateWeekDocumentTitle(id: string, title: string) {
  const { error } = await supabase.from("week_documents").update({ title }).eq("id", id);
  if (error) throw error;
}

export async function deleteWeekDocument(id: string) {
  const { error } = await supabase.from("week_documents").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadPdf(file: File, subjectName: string) {
  const slug = subjectName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const path = `${slug || "general"}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
  const { error } = await supabase.storage
    .from("week-pdfs")
    .upload(path, file, { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  return path;
}

const PROCESS_PDF_TIMEOUT_MS = 30_000;

/** Llama a la Function de procesamiento (misma que se puede invocar por HTTP/SQL). */
export async function processPdf(path: string) {
  const { data } = await supabase.auth.getSession();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROCESS_PDF_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("/api/public/procesar-pdf", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(data.session?.access_token
          ? { Authorization: `Bearer ${data.session.access_token}` }
          : {}),
      },
      body: JSON.stringify({ path }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        "El PDF es muy grande o tardó demasiado en procesarse. El archivo ya quedó subido: agrega el video manualmente si lo necesitas.",
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json()) as {
    youtube_links?: YoutubeLink[];
    extracted_text_length?: number;
    error?: string;
    skipped_too_large?: boolean;
  };
  if (!res.ok) throw new Error(json.error ?? "Error procesando el PDF");
  return json;
}

/** Sube y procesa un PDF, y lo agrega como un documento nuevo de la semana (no reemplaza los existentes).
 *  Si el procesamiento automático falla o tarda demasiado, el documento igual queda guardado sin videos
 *  detectados — el admin puede agregarlos a mano después. */
export async function uploadAndAddDocument(
  file: File,
  subjectName: string,
  weekContentId: string,
  title: string,
  currentCount: number,
) {
  const path = await uploadPdf(file, subjectName);
  let result: {
    youtube_links?: YoutubeLink[];
    extracted_text_length?: number;
    skipped_too_large?: boolean;
  } = {};
  let processingError: string | null = null;
  try {
    result = await processPdf(path);
  } catch (e) {
    processingError = e instanceof Error ? e.message : "No se pudo procesar el PDF.";
  }
  await addWeekDocument({
    week_content_id: weekContentId,
    title,
    pdf_url: path,
    pdf_filename: file.name,
    youtube_links: (result.youtube_links ?? []) as YoutubeLink[],
    order: currentCount + 1,
  });
  return { ...result, processingError };
}

export async function saveWeekContent(input: {
  subject_id: string;
  week_id: string;
  pdf_url: string | null;
  pdf_filename: string | null;
  youtube_links: YoutubeLink[];
}) {
  const { error } = await supabase
    .from("week_content")
    .upsert(input, { onConflict: "subject_id,week_id" });
  if (error) throw error;
}

/** Acepta una URL completa de YouTube o ya el ID de 11 caracteres. */
export function extractYoutubeId(input: string): string | null {
  const m = input.match(
    /(?:youtube\.com\/(?:watch\?[^\s"'<>)]*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
  if (m) return m[1] ?? null;
  const trimmed = input.trim();
  return /^[A-Za-z0-9_-]{11}$/.test(trimmed) ? trimmed : null;
}
