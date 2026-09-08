import { useState } from "react";
import { Play } from "lucide-react";
import type { YoutubeLink } from "@/lib/school";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function VideoGrid({ videos }: { videos: YoutubeLink[] }) {
  const [active, setActive] = useState<YoutubeLink | null>(null);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v, i) => (
          <button
            key={`${v.video_id}-${i}`}
            onClick={() => setActive(v)}
            className="group overflow-hidden rounded-2xl border-2 border-border bg-card text-left shadow-sm transition-transform hover:-translate-y-1"
          >
            <div className="relative aspect-video bg-muted">
              <img
                src={`https://img.youtube.com/vi/${v.video_id}/hqdefault.jpg`}
                alt={v.title ?? "Video de la semana"}
                loading="lazy"
                className="size-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-110">
                  <Play className="size-6 fill-current" />
                </span>
              </span>
            </div>
            <p className="p-4 text-base font-semibold leading-snug">
              {v.title || `Video ${i + 1}`}
            </p>
          </button>
        ))}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-3xl p-3">
          <DialogTitle className="px-1 text-lg">
            {active?.title || "Video"}
          </DialogTitle>
          {active && (
            <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
              <iframe
                className="size-full"
                src={`https://www.youtube.com/embed/${active.video_id}?autoplay=1&rel=0`}
                title={active.title ?? "Video"}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
