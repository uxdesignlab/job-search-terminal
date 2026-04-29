import { readFile } from "node:fs/promises";
import { notFound } from "next/navigation";
import { getGeneratedDocumentById } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

type PdfRouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: PdfRouteProps) {
  const { id } = await params;
  const document = getGeneratedDocumentById(id);

  if (!document || !document.pdfUrl) {
    notFound();
  }

  try {
    const file = await readFile(document.pdfUrl);
    return new Response(file, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${document.id}.pdf"`
      }
    });
  } catch {
    notFound();
  }
}
