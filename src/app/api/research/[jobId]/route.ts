import { researchCompanyStreaming } from "@/lib/research/llm-researcher";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        await researchCompanyStreaming(jobId, (result) => {
          send({ axis: result.axis, label: result.label, content: result.content, done: false });
        });
        send({ axis: "complete", done: true });
      } catch (err) {
        send({ axis: "error", error: err instanceof Error ? err.message : String(err), done: true });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
