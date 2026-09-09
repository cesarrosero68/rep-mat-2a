import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";
import type { Database } from "@/integrations/supabase/types";

type Link = { video_id: string; title: string | null; position_in_doc: number };

const YT_RE =
  /(?:youtube\.com\/(?:watch\?[^\s"'<>)]*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g;

function findLinks(text: string): Link[] {
  const seen = new Set<string>();
  const out: Link[] = [];
  for (const m of text.matchAll(YT_RE)) {
    const id = m[1]!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ video_id: id, title: null, position_in_doc: out.length + 1 });
  }
  return out;
}

async function withTitles(links: Link[]): Promise<Link[]> {
  return Promise.all(
    links.map(async (l) => {
      try {
        const r = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${l.video_id}&format=json`,
        );
        if (!r.ok) return l;
        const j = (await r.json()) as { title?: string };
        return { ...l, title: j.title ?? null };
      } catch {
        return l;
      }
    }),
  );
}

async function authorize(request: Request): Promise<boolean> {
  const secret = request.headers.get("x-admin-secret");
  if (secret && secret === process.env["LOVABLE_CRON_SECRET"]) return true;

  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || token.split(".").length !== 3) return false;
  const client = createClient<Database>(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.getClaims(token);
  return !error && !!data?.claims?.sub;
}

export const Route = createFileRoute("/api/public/procesar-pdf")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authorize(request))) {
          return Response.json({ error: "No autorizado" }, { status: 401 });
        }

        let body: {
          path?: string;
          subject_id?: string;
          week_id?: string;
          save?: boolean;
        };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400 });
        }
        if (!body.path) {
          return Response.json({ error: "Falta 'path'" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const path = body.path.replace(/^\/?week-pdfs\//, "");
        const { data: file, error: dlError } = await supabaseAdmin.storage
          .from("week-pdfs")
          .download(path);
        if (dlError || !file) {
          return Response.json(
            { error: `No se pudo leer el archivo: ${dlError?.message ?? path}` },
            { status: 404 },
          );
        }

        let text = "";
        try {
          const buf = new Uint8Array(await file.arrayBuffer());
          const doc = await getDocumentProxy(buf);
          const res = await extractText(doc, { mergePages: true });
          text = Array.isArray(res.text) ? res.text.join("\n") : res.text;
        } catch (e) {
          console.error("[procesar-pdf] extracción falló", e);
        }

        const youtube_links = await withTitles(findLinks(text));

        if (body.save && body.subject_id && body.week_id) {
          const { error } = await supabaseAdmin.from("week_content").upsert(
            {
              subject_id: body.subject_id,
              week_id: body.week_id,
              pdf_url: path,
              pdf_filename: path.split("/").pop() ?? path,
              extracted_text: text,
              youtube_links,
            },
            { onConflict: "subject_id,week_id" },
          );
          if (error) return Response.json({ error: error.message }, { status: 400 });
        }

        return Response.json({
          path,
          extracted_text_length: text.length,
          youtube_links,
          saved: !!body.save,
        });
      },
    },
  },
});
