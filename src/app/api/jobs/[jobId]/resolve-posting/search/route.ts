import { NextResponse } from "next/server";
import { searchPostingCandidates } from "@/lib/scanner/email-posting-resolver";

type Props = {
  params: Promise<{ jobId: string }>;
};

export async function POST(_req: Request, { params }: Props) {
  try {
    const { jobId } = await params;
    const result = await searchPostingCandidates(jobId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
