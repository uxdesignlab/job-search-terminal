import type { OutreachChannel } from "../db/types";

/**
 * Channel-aware drafting limits (PRD v0.2.1 §55).
 *
 * The old generator hard-coded 300 characters for everything, because it only
 * ever wrote LinkedIn connection notes. Applying that to an email produces a
 * message that reads like a truncated telegram.
 *
 * These are *drafting targets*, not enforced truncation. §55 also warns against
 * baking a third party's changing limits in as permanent product assumptions —
 * so the character count is always shown, and nothing is silently cut.
 */
export type ChannelSpec = {
  label: string;
  /** What to aim for when drafting. */
  targetChars: number;
  /** Where the UI starts warning. Null when the platform imposes no practical limit. */
  softLimit: number | null;
  hasSubject: boolean;
  guidance: string;
};

export const OUTREACH_CHANNELS: Record<OutreachChannel, ChannelSpec> = {
  linkedin_connection: {
    label: "LinkedIn connection note",
    targetChars: 280,
    // LinkedIn has historically capped connection notes around 300 characters.
    // Treated as a warning threshold rather than a hard truth, because it has
    // changed before and is not ours to guarantee.
    softLimit: 300,
    hasSubject: false,
    guidance: "One specific reason for connecting. No pitch — there is no room for one.",
  },
  linkedin_message: {
    label: "LinkedIn message",
    targetChars: 700,
    softLimit: null,
    hasSubject: false,
    guidance: "Room for one concrete proof point. Still short enough to read on a phone.",
  },
  email: {
    label: "Email",
    targetChars: 1200,
    softLimit: null,
    hasSubject: true,
    guidance: "A subject line that survives a crowded inbox, then two short paragraphs.",
  },
};

export function channelSpec(channel: OutreachChannel): ChannelSpec {
  return OUTREACH_CHANNELS[channel] ?? OUTREACH_CHANNELS.linkedin_message;
}

export type LengthState = "ok" | "near" | "over";

/** Report length against the channel rather than one global number. */
export function lengthState(channel: OutreachChannel, length: number): LengthState {
  const { softLimit } = channelSpec(channel);
  if (softLimit === null) return "ok";
  if (length > softLimit) return "over";
  if (length > softLimit * 0.9) return "near";
  return "ok";
}
