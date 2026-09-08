import { supabase } from "@/integrations/supabase/client";

export type Subject = {
  id: string;
  name: string;
  color: string;
  icon: string;
  order: number;
};

export type Period = { id: string; name: string; order: number };

export type Week = {
  id: string;
  period_id: string;
  label: string;
  start_date: string | null;
  end_date: string | null;
  order: number;
};

export type YoutubeLink = {
  video_id: string;
  title?: string | null;
  position_in_doc?: number | null;
};

export type WeekContent = {
  id: string;
  subject_id: string;
  week_id: string;
  pdf_url: string | null;
  pdf_filename: string | null;
  youtube_links: YoutubeLink[] | null;
};

export type ProgressRow = {
  id: string;
  week_content_id: string;
  completed: boolean;
};

export const subjectsQuery = {
  queryKey: ["subjects"],
  queryFn: async (): Promise<Subject[]> => {
    const { data, error } = await supabase
      .from("subjects")
      .select("id,name,color,icon,order")
      .order("order");
    if (error) throw error;
    return (data ?? []) as Subject[];
  },
};

export const periodsQuery = {
  queryKey: ["periods"],
  queryFn: async (): Promise<Period[]> => {
    const { data, error } = await supabase
      .from("periods")
      .select("id,name,order")
      .order("order");
    if (error) throw error;
    return (data ?? []) as Period[];
  },
};

export const weeksQuery = {
  queryKey: ["weeks"],
  queryFn: async (): Promise<Week[]> => {
    const { data, error } = await supabase
      .from("weeks")
      .select("id,period_id,label,start_date,end_date,order")
      .order("order");
    if (error) throw error;
    return (data ?? []) as Week[];
  },
};

export const contentQuery = (subjectId: string) => ({
  queryKey: ["week_content", subjectId],
  queryFn: async (): Promise<WeekContent[]> => {
    const { data, error } = await supabase
      .from("week_content")
      .select("id,subject_id,week_id,pdf_url,pdf_filename,youtube_links")
      .eq("subject_id", subjectId);
    if (error) throw error;
    return (data ?? []) as WeekContent[];
  },
});

export const progressQuery = {
  queryKey: ["progress"],
  queryFn: async (): Promise<ProgressRow[]> => {
    const { data, error } = await supabase
      .from("progress")
      .select("id,week_content_id,completed");
    if (error) throw error;
    return (data ?? []) as ProgressRow[];
  },
};

export async function setCompleted(weekContentId: string, completed: boolean) {
  const { error } = await supabase
    .from("progress")
    .upsert(
      { week_content_id: weekContentId, completed },
      { onConflict: "week_content_id" },
    );
  if (error) throw error;
}

/** Accepts either a full https URL or a path inside the `week-pdfs` bucket. */
export async function resolvePdfUrl(pdfUrl: string): Promise<string | null> {
  if (/^https?:\/\//i.test(pdfUrl)) return pdfUrl;
  const path = pdfUrl.replace(/^\/?week-pdfs\//, "");
  const { data, error } = await supabase.storage
    .from("week-pdfs")
    .createSignedUrl(path, 60 * 60 * 6);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Weeks flattened in chronological order across periods. */
export function orderedWeeks(periods: Period[], weeks: Week[]): Week[] {
  const rank = new Map(periods.map((p) => [p.id, p.order]));
  return [...weeks].sort(
    (a, b) =>
      (rank.get(a.period_id) ?? 0) - (rank.get(b.period_id) ?? 0) ||
      a.order - b.order,
  );
}
