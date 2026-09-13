import { describe, expect, it } from "vitest";
import { OllamaProvider, inTurnForServer } from "@/lib/ai/ollama";

describe("requests to one Ollama server", () => {
  it("take turns, so parts that fall through to a local model do not pile into its queue", async () => {
    const events: string[] = [];
    let release: () => void = () => {};
    const first = inTurnForServer("http://localhost:11434/v1", async () => {
      events.push("first started");
      await new Promise<void>((resolve) => { release = resolve; });
      events.push("first finished");
    });
    const second = inTurnForServer("http://localhost:11434/v1", async () => {
      events.push("second started");
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(events).toEqual(["first started"]);
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(["first started", "first finished", "second started"]);
  });

  it("do not stall behind a request that failed", async () => {
    const failed = inTurnForServer("http://localhost:11435/v1", async () => { throw new Error("boom"); });
    await expect(failed).rejects.toThrow("boom");
    await expect(inTurnForServer("http://localhost:11435/v1", async () => "ok")).resolves.toBe("ok");
  });

  it("apply to the adapter's generations", async () => {
    let inFlight = 0;
    let peak = 0;
    const make = () => {
      const provider = new OllamaProvider({ apiKey: "ollama", model: "gemma4:12b-mlx", baseUrl: "http://localhost:11999" });
      (provider as unknown as { client: unknown }).client = {
        chat: {
          completions: {
            create: async () => {
              inFlight += 1;
              peak = Math.max(peak, inFlight);
              await new Promise((resolve) => setTimeout(resolve, 5));
              inFlight -= 1;
              return { choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }] };
            },
          },
        },
      };
      return provider;
    };
    await Promise.all([make().generateJSON([], "{}"), make().generateJSON([], "{}"), make().generateJSON([], "{}")]);
    expect(peak).toBe(1);
  });
});
