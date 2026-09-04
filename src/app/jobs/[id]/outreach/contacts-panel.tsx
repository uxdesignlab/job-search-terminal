import { Badge, Card, CardDescription, CardHeader, CardTitle, Input, Select, SubmitButton } from "@/components/ui";
import { outreachRecommendation } from "@/lib/contacts/ranking";
import type { ContactRole, ContactStatus, JobContact, OutreachMessageRecord } from "@/lib/db/types";
import { MessagePanel } from "./message-panel";
import { PeopleSearchForm } from "./people-search-form";
import {
  addContactAction,
  deleteContactAction,
  forgetContactAction,
  removeFromJobAction,
  enrichContactAction,
  findPeopleAction,
  setContactStatusAction,
} from "./actions";

const ROLES: Array<{ value: ContactRole; label: string }> = [
  { value: "hiring_manager", label: "Hiring manager" },
  { value: "functional_leader", label: "Functional leader" },
  { value: "executive", label: "Executive" },
  { value: "recruiter", label: "Recruiter" },
  { value: "peer", label: "Peer / team member" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
];

// Every status is offered. An earlier version showed only the first three after
// filtering out the current one, which made "Responded" and "Not Relevant"
// unreachable from every state — §56 requires both, and responded_at could never
// be set.
const STATUSES: ContactStatus[] = ["Found", "Shortlisted", "Drafted", "Contacted", "Responded", "Not Relevant"];

const RECOMMENDATION_TONE = {
  Recommended: "success",
  Optional: "neutral",
  "Low value": "neutral",
} as const;

export function ContactsPanel({
  jobId,
  contacts,
  clayConnected,
  companyIdentifier,
  companyName,
  jobTitle,
  messagesByLink,
  reportsToTitle,
  roleKeywords,
}: {
  jobId: string;
  contacts: JobContact[];
  clayConnected: boolean;
  companyIdentifier: string;
  companyName: string;
  jobTitle: string;
  messagesByLink: Map<string, OutreachMessageRecord[]>;
  reportsToTitle: string;
  roleKeywords: string[];
}) {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
          <CardDescription>
            {contacts.length === 0
              ? "Build relationships around this opportunity. Add anyone you already know of; automatic discovery arrives with Clay contact search."
              : `${contacts.length} ${contacts.length === 1 ? "person" : "people"} linked to this role.`}
          </CardDescription>
        </CardHeader>

        <div className="mb-4">
          <PeopleSearchForm
            clayConnected={clayConnected}
            companyName={companyName}
            initialCompanyIdentifier={companyIdentifier}
            initialRoleKeywords={roleKeywords}
            jobTitle={jobTitle}
            reportsToTitle={reportsToTitle}
            searchAction={findPeopleAction.bind(null, jobId)}
          />
        </div>

        {contacts.length > 0 && (
          <ul className="grid gap-3">
            {contacts.map((contact) => {
              const band = outreachRecommendation(contact.link.relevanceScore);
              return (
                <li className="rounded-control border border-border bg-surface px-4 py-3" key={contact.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{contact.name}</p>
                      <p className="text-sm text-muted">
                        {contact.title || "Title unknown"}
                        {contact.company ? ` · ${contact.company}` : ""}
                      </p>
                      {contact.link.relevanceReasons.length > 0 && (
                        <p className="mt-1 text-xs text-muted">{contact.link.relevanceReasons.join(" · ")}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        {contact.linkedinUrl && (
                          <a className="text-accent hover:underline" href={`https://${contact.linkedinUrl}`} rel="noreferrer noopener" target="_blank">
                            LinkedIn ↗
                          </a>
                        )}
                        {contact.workEmail && (
                          <span className="text-muted">
                            {contact.workEmail}
                            {contact.emailConfidence ? ` · ${contact.emailConfidence}` : ""}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <Badge tone={RECOMMENDATION_TONE[band]}>{band}</Badge>
                      <Badge>{contact.link.status}</Badge>
                    </div>
                  </div>

                  <MessagePanel
                    contactId={contact.id}
                    contactName={contact.name}
                    jobId={jobId}
                    messages={messagesByLink.get(contact.link.id) ?? []}
                  />

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    {STATUSES.filter((status) => status !== contact.link.status).map((status) => (
                      <form action={setContactStatusAction.bind(null, jobId, contact.id, status)} key={status}>
                        <SubmitButton label={`Mark ${status}`} savedLabel="Updated" variant="quiet" />
                      </form>
                    ))}
                    {clayConnected && !contact.workEmail && contact.linkedinUrl && (
                      <form action={enrichContactAction.bind(null, jobId, contact.id)}>
                        <SubmitButton label="Find email" savedLabel="Searched" variant="quiet" />
                      </form>
                    )}
                    <form action={removeFromJobAction.bind(null, jobId, contact.id)}>
                      <SubmitButton label="Remove from this job" savedLabel="Removed" variant="quiet" />
                    </form>
                    <form action={deleteContactAction.bind(null, jobId, contact.id)}>
                      <SubmitButton label="Delete contact" savedLabel="Deleted" variant="quiet" />
                    </form>
                    <form action={forgetContactAction.bind(null, jobId, contact.id)}>
                      <SubmitButton label="Forget this person" savedLabel="Forgotten" variant="quiet" />
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a contact</CardTitle>
          <CardDescription>
            Anyone you already know of. Contacts are shared across opportunities — the same
            person linked to two roles keeps a separate status on each.
          </CardDescription>
        </CardHeader>
        <form action={addContactAction.bind(null, jobId)} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Name" name="name" placeholder="Jane Doe" required />
            <Input label="Title" name="title" placeholder="Director of Product Design" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Company" name="company" placeholder="Leave blank to use the hiring company" />
            <Select defaultValue="other" label="Relationship to this role" name="contactRole">
              {ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="LinkedIn URL" name="linkedinUrl" placeholder="https://linkedin.com/in/…" />
            <Input label="Work email" name="workEmail" placeholder="Optional" />
          </div>
          <Input label="Notes" name="notes" placeholder="How you know them, or why they matter" />
          <div><SubmitButton label="Add contact" savedLabel="Added" /></div>
        </form>
      </Card>
    </div>
  );
}
