import { supabase } from "@/integrations/supabase/client";
import type { WeekDocument, YoutubeLink } from "@/lib/school";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Convierte una imagen suelta (jpg/png/webp) en un PDF de una sola página,
 *  del mismo tamaño que la imagen, para poder reutilizar el mismo visor de
 *  PDF y el mismo flujo de carga que ya existe. Corre en el navegador, sin
 *  necesitar backend ni servicios externos. */
export async function imageToPdf(file: File): Promise<File> {
  const { jsPDF } = await import("jspdf");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("No se pudo abrir la imagen"));
    el.src = dataUrl;
  });

  // Convierte a JPEG para mantener el PDF liviano, incluso si el original
  // era PNG (con pérdida de transparencia, que no aplica a fotos/capturas).
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen en este navegador.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.85);

  const widthPt = (img.naturalWidth / 96) * 72;
  const heightPt = (img.naturalHeight / 96) * 72;
  const pdf = new jsPDF({
    orientation: widthPt >= heightPt ? "landscape" : "portrait",
    unit: "pt",
    format: [widthPt, heightPt],
  });
  pdf.addImage(jpegDataUrl, "JPEG", 0, 0, widthPt, heightPt);
  const blob = pdf.output("blob");
  const name = file.name.replace(/\.(jpe?g|png|webp)$/i, "") + ".pdf";
  return new File([blob], name, { type: "application/pdf" });
}

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
      .select("id,week_content_id,title,pdf_url,pdf_filename,embed_url,youtube_links,order")
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
  embed_url?: string | null;
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

/** Dominios cuya URL de embed conocemos, para validar antes de guardar y evitar iframes rotos. */
const ALLOWED_EMBED_HOSTS = [
  "wordwall.net",
  "view.genially.com",
  "genially.com",
  "kahoot.it",
  "quizizz.com",
];

export function isAllowedEmbedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return ALLOWED_EMBED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Agrega un documento que es un juego/actividad interactiva embebida (Wordwall, Genially, etc.),
 *  sin PDF ni video — se muestra dentro de un iframe. */
export async function addEmbedDocument(input: {
  week_content_id: string;
  title: string;
  embed_url: string;
  order: number;
}) {
  await addWeekDocument({
    week_content_id: input.week_content_id,
    title: input.title,
    pdf_url: null,
    pdf_filename: null,
    embed_url: input.embed_url,
    youtube_links: [],
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

const UPLOAD_TIMEOUT_MS = 45_000;
// Supabase recomienda no superar ~6MB con el método de subida estándar (el
// que usa este formulario); por encima de eso, la subida se vuelve lenta y
// poco confiable y puede quedarse "colgada" sin devolver ni éxito ni error.
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

async function raceTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Tiempo agotado: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function uploadPdf(file: File, subjectName: string) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)}MB. Por ahora el máximo recomendado es ${MAX_UPLOAD_BYTES / 1024 / 1024}MB — comprime el PDF (por ejemplo con un compresor de PDF en línea) o divídelo en partes más pequeñas.`,
    );
  }
  const slug = subjectName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const path = `${slug || "general"}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
  let uploadError: { message: string } | null;
  try {
    const { error } = await raceTimeout(
      supabase.storage
        .from("week-pdfs")
        .upload(path, file, { contentType: "application/pdf", upsert: true }),
      UPLOAD_TIMEOUT_MS,
      "subir el archivo",
    );
    uploadError = error;
  } catch (e) {
    throw new Error(
      e instanceof Error && e.message.startsWith("Tiempo agotado")
        ? "La subida tardó demasiado y se canceló. Intenta con un PDF más liviano (comprímelo primero)."
        : e instanceof Error
          ? e.message
          : "Error subiendo el archivo.",
    );
  }
  if (uploadError) throw uploadError;
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
  onPhase?: (phase: string) => void,
) {
  const path = await uploadPdf(file, subjectName);
  onPhase?.("Leyendo el PDF y buscando videos…");
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
