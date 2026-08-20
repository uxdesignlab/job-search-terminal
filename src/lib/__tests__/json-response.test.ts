import { describe, expect, it } from "vitest";
import { parseJsonResponse, unwrapJson } from "@/lib/ai/json-response";

describe("unwrapJson", () => {
  it("unwraps a ```json fence", () => {
    // What gemma4:12b-mlx actually returns, despite being told not to. Before this
    // was handled, the whole answer was reported as "invalid JSON" over one backtick.
    expect(unwrapJson('```json\n{"fitScore": 87}\n```')).toBe('{"fitScore": 87}');
  });

  it("unwraps a bare fence, which Anthropic's own pattern used to miss", () => {
    expect(unwrapJson('```\n{"fitScore": 87}\n```')).toBe('{"fitScore": 87}');
  });

  it("leaves plain JSON alone, object or array", () => {
    expect(unwrapJson('{"a":1}')).toBe('{"a":1}');
    expect(unwrapJson(' [1,2] ')).toBe("[1,2]");
  });

  it("digs an object out of prose as a last resort", () => {
    expect(unwrapJson('Here is the evaluation:\n{"a":1}\nHope that helps.')).toBe('{"a":1}');
  });
});

describe("parseJsonResponse", () => {
  it("parses what it unwrapped", () => {
    expect(parseJsonResponse<{ fitScore: number }>('```json\n{"fitScore": 87}\n```', "Ollama")).toEqual({ fitScore: 87 });
  });

  it("says invalid JSON, which is what marks the failure retryable", () => {
    // isMalformedJsonResponse and the chain's failover both match on this wording.
    const error = (() => {
      try {
        parseJsonResponse("not json at all", "Ollama");
        return null;
      } catch (e) {
        return e as Error;
      }
    })();
    expect(error?.message).toMatch(/^Ollama returned invalid JSON \(/);
    expect(error?.message).toContain("Preview: not json at all");
  });

  it("names the expected shape when one was given", () => {
    try {
      parseJsonResponse("{", "Anthropic", '{"fitScore": 0}');
    } catch (e) {
      expect((e as Error).message).toContain('expected shape {"fitScore": 0}');
    }
  });

  it("truncates a long preview rather than replaying the whole answer", () => {
    const error = (() => {
      try {
        parseJsonResponse("x".repeat(900), "Gemini");
        return null;
      } catch (e) {
        return e as Error;
      }
    })();
    expect(error?.message.length).toBeLessThan(420);
    expect(error?.message.endsWith("…")).toBe(true);
  });
});
