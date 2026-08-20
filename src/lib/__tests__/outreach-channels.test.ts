import { describe, expect, it } from "vitest";
import { OUTREACH_CHANNELS, channelSpec, lengthState } from "@/lib/outreach/channels";
import type { OutreachChannel } from "@/lib/db/types";

describe("channel specs (§55)", () => {
  it("gives each channel its own target instead of one universal limit", () => {
    // The old generator capped everything at 300 because it only wrote LinkedIn
    // connection notes; an email written to that limit reads like a telegram.
    const targets = (Object.keys(OUTREACH_CHANNELS) as OutreachChannel[]).map((c) => channelSpec(c).targetChars);
    expect(new Set(targets).size).toBe(targets.length);
    expect(channelSpec("email").targetChars).toBeGreaterThan(channelSpec("linkedin_connection").targetChars);
  });

  it("only gives email a subject line", () => {
    expect(channelSpec("email").hasSubject).toBe(true);
    expect(channelSpec("linkedin_connection").hasSubject).toBe(false);
    expect(channelSpec("linkedin_message").hasSubject).toBe(false);
  });

  it("falls back to a sane channel for an unknown value", () => {
    expect(channelSpec("carrier_pigeon" as OutreachChannel)).toBe(OUTREACH_CHANNELS.linkedin_message);
  });
});

describe("length reporting", () => {
  it("warns before the connection-note limit and flags going over", () => {
    expect(lengthState("linkedin_connection", 100)).toBe("ok");
    expect(lengthState("linkedin_connection", 285)).toBe("near");
    expect(lengthState("linkedin_connection", 320)).toBe("over");
  });

  it("never reports over for channels with no practical limit", () => {
    // §55: do not encode a third party's changing limits as permanent truth.
    expect(lengthState("email", 5000)).toBe("ok");
    expect(lengthState("linkedin_message", 5000)).toBe("ok");
  });

  it("treats the boundary itself as within limit", () => {
    expect(lengthState("linkedin_connection", 300)).not.toBe("over");
    expect(lengthState("linkedin_connection", 301)).toBe("over");
  });
});
