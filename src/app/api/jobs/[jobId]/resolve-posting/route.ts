import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { resolveEmailJobPosting } from "@/lib/scanner/email-posting-resolver";

type Props = {
  params: Promise<{ jobId: string }>;
};

export async function POST(req: Request, { params }: Props) {
  try {
    const { jobId } = await params;
    const body = await req.json().catch(() => ({})) as { url?: string };
    const url = String(body.url ?? "").trim();
    if (!url) return NextResponse.json({ error: "Posting URL is required" }, { status: 400 });
    const result = await resolveEmailJobPosting(jobId, url);
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath("/jobs");
    revalidatePath("/dashboard");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
