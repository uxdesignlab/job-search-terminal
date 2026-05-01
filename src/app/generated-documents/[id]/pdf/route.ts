import { readFile } from "node:fs/promises";
import { notFound } from "next/navigation";
import { getGeneratedDocumentById } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

type PdfRouteProps = {
  params: Promise<{ id: string }>;
};

function buildPdfFilename(draftJson: string, role: string): string {
  let firstName = "";
  let lastName = "";
  try {
    const draft = JSON.parse(draftJson) as { name?: string };
    const parts = (draft.name ?? "").trim().split(/\s+/);
    firstName = parts[0] ?? "";
    lastName = parts.slice(1).join("_");
  } catch { /* fall through */ }

  const slugify = (s: string) =>
    s
      .replace(/[,.()/\\&@#!?'"]/g, "")  // strip punctuation
      .replace(/[-–—\s]+/g, "_")          // spaces/dashes → underscore
      .replace(/_+/g, "_")               // collapse multiple underscores
      .replace(/^_|_$/g, "")             // trim edges
      .slice(0, 60);                     // keep reasonable length

  const namePart = [firstName, lastName].filter(Boolean).join("_");
  const rolePart = slugify(role);
  const base = [namePart, rolePart].filter(Boolean).join("_") || "resume";
  return `${base}.pdf`;
}

export async function GET(_request: Request, { params }: PdfRouteProps) {
  const { id } = await params;
  const document = getGeneratedDocumentById(id);

  if (!document || !document.pdfUrl) {
    notFound();
  }

  try {
    const file = await readFile(document.pdfUrl);
    const filename = buildPdfFilename(document.draftJson, document.role);
    return new Response(file, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch {
    notFound();
  }
}
