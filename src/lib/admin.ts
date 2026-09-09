import { supabase } from "@/integrations/supabase/client";
import type { YoutubeLink } from "@/lib/school";

export type AdminContentRow = {
  id: string;
  subject_id: string;
  week_id: string;
  pdf_url: string | null;
  pdf_filename: string | null;
  youtube_links: YoutubeLink[] | null;
};

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
