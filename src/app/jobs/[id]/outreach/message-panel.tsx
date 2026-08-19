import { Badge, Input, Select, SubmitButton, Textarea } from "@/components/ui";
import { OUTREACH_CHANNELS, channelSpec, lengthState } from "@/lib/outreach/channels";
import type { OutreachChannel, OutreachMessageRecord } from "@/lib/db/types";
import { deleteMessageAction, draftMessageAction, saveMessageEditAction } from "./actions";

/**
 * Drafts written to one person (PRD v0.2.1 §55–§56).
 *
 * There is deliberately no Send button. JST drafts, tracks and gets out of the
 * way; sending happens in the user's own inbox or LinkedIn, by the user (§5.3).
 */

const LENGTH_TONE = { ok: "neutral", near: "warning", over: "danger" } as const;

function CharCount({ channel, length }: { channel: OutreachChannel; length: number }) {
  const spec = channelSpec(channel);
  const state = lengthState(channel, length);
  return (
    <Badge tone={LENGTH_TONE[state]}>
      {length}{spec.softLimit ? ` / ${spec.softLimit}` : ""} characters
      {state === "over" ? " — too long for this channel" : ""}
    </Badge>
  );
}

export function MessagePanel({ jobId, contactId, contactName, messages }: {
  jobId: string;
  contactId: string;
  contactName: string;
  messages: OutreachMessageRecord[];
}) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <form action={draftMessageAction.bind(null, jobId, contactId)} className="flex flex-wrap items-end gap-2">
        <Select className="min-w-52" defaultValue="linkedin_message" label="Draft a message" name="channel">
          {(Object.keys(OUTREACH_CHANNELS) as OutreachChannel[]).map((channel) => (
            <option key={channel} value={channel}>{OUTREACH_CHANNELS[channel].label}</option>
          ))}
        </Select>
        <SubmitButton label={messages.length > 0 ? "Draft another" : "Draft message"} savedLabel="Drafted" variant="secondary" />
      </form>

      {messages.length > 0 && (
        <ul className="mt-3 grid gap-3">
          {messages.map((message) => {
            const spec = channelSpec(message.channel);
            return (
              <li className="rounded-control border border-border bg-panel px-3 py-3" key={message.id}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">{spec.label}</span>
                  <CharCount channel={message.channel} length={message.message.length} />
                </div>

                {/* Editable in place — a draft the user cannot change is not a draft. */}
                <form action={saveMessageEditAction.bind(null, jobId, message.id)} className="grid gap-2">
                  {spec.hasSubject && (
                    <Input defaultValue={message.subject} label="Subject" name="subject" />
                  )}
                  <Textarea
                    defaultValue={message.message}
                    label={`To ${contactName}`}
                    name="message"
                    rows={spec.hasSubject ? 8 : 5}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <SubmitButton label="Save edits" savedLabel="Saved" variant="secondary" />
                    <span className="text-xs text-muted">
                      {message.providerUsed ? `${message.providerUsed} / ${message.modelUsed}` : ""}
                    </span>
                  </div>
                </form>

                <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2">
                  <form action={deleteMessageAction.bind(null, jobId, message.id)}>
                    <SubmitButton label="Delete draft" savedLabel="Deleted" variant="quiet" />
                  </form>
                  <p className="text-xs text-muted">
                    Copy this into {spec.hasSubject ? "your email client" : "LinkedIn"} to send — Job Search
                    Terminal never sends on your behalf.
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
