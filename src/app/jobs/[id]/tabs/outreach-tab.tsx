import type {
  JobContact,
  OutreachDraftRecord,
  OutreachMessageRecord,
} from "@/lib/db/types";
import { ContactsPanel } from "../outreach/contacts-panel";
import { OutreachClient } from "../outreach/outreach-client";

const OUTREACH_ERRORS: Record<string, string> = {
  "name-required": "A name is required to add a contact.",
  "missing-job": "That job could not be found.",
  suppressed: "You previously chose to forget this person. Clear the forgotten list in Settings before adding them again.",
  "needs-company": "This company has no saved domain, and the job link points at a job board rather than the employer. Add the company's domain before searching so results come from the right organisation.",
  "invalid-company-identifier": "Use the employer's own website, domain, or LinkedIn company page. Job-board links cannot identify the hiring company.",
  "missing-role-keywords": "Add at least one role keyword before searching for people.",
  // §63: each provider failure needs a different response from the user, so each
  // gets its own message rather than a single "Clay error".
  "clay-not_connected": "Connect Clay in Settings → Integrations before searching for people.",
  "clay-invalid_credential": "Clay rejected the API key. Re-check it in Settings → Integrations.",
  "clay-allowance_reached": "Your Clay search allowance is used up for this period. Add contacts manually, or try again after it resets.",
  "clay-rate_limited": "Clay rate-limited the request. Wait a moment and try again.",
  "clay-ambiguous_company": "Not enough is known about this company to search. Add its domain first.",
  "clay-unavailable": "Clay could not be reached. Everything else in Job Search Terminal is unaffected.",
  "clay-no-results": "Clay returned nobody new for this company. You can still add people manually.",
  "missing-contact": "That contact could not be found.",
  "clay-no-enrichment": "Enrichment is not available for this provider.",
  "enrich-no-email": "The Clay routine ran but returned no email for this person.",
  "enrich-needs-linkedin": "This contact has no LinkedIn URL, which the email lookup needs. Add one and try again.",
  "draft-failed": "The message could not be drafted. Check your AI provider in Settings and try again.",
};

type Props = {
  clayConnected: boolean;
  companyIdentifier: string;
  companyName: string;
  contacts: JobContact[];
  id: string;
  jobTitle: string;
  outreachDrafts: OutreachDraftRecord[];
  outreachError: string | undefined;
  outreachMessages: Map<string, OutreachMessageRecord[]>;
  reportsToTitle: string;
  roleKeywords: string[];
};

export function OutreachTab({
  clayConnected,
  companyIdentifier,
  companyName,
  contacts,
  id,
  jobTitle,
  outreachDrafts,
  outreachError,
  outreachMessages,
  reportsToTitle,
  roleKeywords,
}: Props) {
  return (
    <div className="grid gap-8">
      {outreachError ? (
        <p className="rounded-control border border-danger/35 bg-danger/10 px-4 py-2 text-sm text-danger" role="alert">
          {OUTREACH_ERRORS[outreachError] ?? "Something went wrong."}
        </p>
      ) : null}

      <ContactsPanel
        clayConnected={clayConnected}
        companyIdentifier={companyIdentifier}
        companyName={companyName}
        contacts={contacts}
        jobId={id}
        jobTitle={jobTitle}
        messagesByLink={outreachMessages}
        reportsToTitle={reportsToTitle}
        roleKeywords={roleKeywords}
      />

      {outreachDrafts.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-ink">Previous generic drafts</h2>
          <p className="mb-4 text-xs text-muted">
            Written before outreach targeted real people. Kept readable; new drafts are
            written per contact.
          </p>
          <OutreachClient jobId={id} saved={outreachDrafts} />
        </section>
      )}
    </div>
  );
}
