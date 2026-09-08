import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export default function PdfViewer({ url }: { url: string }) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [width, setWidth] = useState(700);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const measure = () => {
      if (boxRef.current) setWidth(boxRef.current.clientWidth - 16);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <div className="rounded-3xl border-2 border-border bg-card p-2 shadow-sm">
      <div ref={boxRef} className="overflow-auto rounded-2xl bg-muted p-2">
        <Document
          file={url}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          loading={
            <div className="flex h-72 items-center justify-center text-muted-foreground">
              <Loader2 className="size-8 animate-spin" />
            </div>
          }
          error={
            <div className="flex h-40 items-center justify-center px-4 text-center text-muted-foreground">
              No se pudo cargar el documento.
            </div>
          }
        >
          <Page
            pageNumber={page}
            width={Math.max(240, width * scale)}
            renderAnnotationLayer={false}
            className="mx-auto [&>canvas]:mx-auto [&>canvas]:rounded-xl [&>canvas]:shadow"
          />
        </Document>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Página anterior"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-24 text-center text-sm font-semibold">
            {page} / {numPages || "…"}
          </span>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Página siguiente"
            disabled={page >= numPages}
            onClick={() => setPage((p) => Math.min(numPages, p + 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Alejar"
            onClick={() => setScale((s) => Math.max(0.6, +(s - 0.2).toFixed(1)))}
          >
            <ZoomOut />
          </Button>
          <span className="text-sm font-semibold">{Math.round(scale * 100)}%</span>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Acercar"
            onClick={() => setScale((s) => Math.min(2.5, +(s + 0.2).toFixed(1)))}
          >
            <ZoomIn />
          </Button>
        </div>
      </div>
    </div>
  );
}
