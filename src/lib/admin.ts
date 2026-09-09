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
  pdf_url: string;
  pdf_filename: string;
  youtube_links: YoutubeLink[];
  order: number;
}) {
  const { error } = await supabase.from("week_documents").insert(input);
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

/** Llama a la Function de procesamiento (misma que se puede invocar por HTTP/SQL). */
export async function processPdf(path: string) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/public/procesar-pdf", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(data.session?.access_token
        ? { Authorization: `Bearer ${data.session.access_token}` }
        : {}),
    },
    body: JSON.stringify({ path }),
  });
  const json = (await res.json()) as {
    youtube_links?: YoutubeLink[];
    extracted_text_length?: number;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Error procesando el PDF");
  return json;
}

/** Sube y procesa un PDF, y lo agrega como un documento nuevo de la semana (no reemplaza los existentes). */
export async function uploadAndAddDocument(
  file: File,
  subjectName: string,
  weekContentId: string,
  title: string,
  currentCount: number,
) {
  const path = await uploadPdf(file, subjectName);
  const result = await processPdf(path);
  await addWeekDocument({
    week_content_id: weekContentId,
    title,
    pdf_url: path,
    pdf_filename: file.name,
    youtube_links: (result.youtube_links ?? []) as YoutubeLink[],
    order: currentCount + 1,
  });
  return result;
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
