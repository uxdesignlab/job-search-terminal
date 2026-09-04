"use client";

import { useState } from "react";
import { Badge, Input, SubmitButton } from "@/components/ui";
import {
  buildPeopleSearchPlan,
  parsePeopleSearchKeywords,
  PEOPLE_SHORTLIST_LIMIT,
} from "@/lib/contacts/search-details";

type Props = {
  clayConnected: boolean;
  companyName: string;
  initialCompanyIdentifier: string;
  initialRoleKeywords: string[];
  jobTitle: string;
  reportsToTitle: string;
  searchAction: (formData: FormData) => void | Promise<void>;
};

export function PeopleSearchForm({
  clayConnected,
  companyName,
  initialCompanyIdentifier,
  initialRoleKeywords,
  jobTitle,
  reportsToTitle,
  searchAction,
}: Props) {
  const [companyIdentifier, setCompanyIdentifier] = useState(initialCompanyIdentifier);
  const [roleKeywords, setRoleKeywords] = useState(initialRoleKeywords.join(", "));

  const hasCompany = companyName.trim().length > 0;
  const hasIdentifier = companyIdentifier.trim().length > 0;
  const parsedRoleKeywords = parsePeopleSearchKeywords(roleKeywords);
  const hasKeywords = parsedRoleKeywords.length > 0;
  const searchPlan = buildPeopleSearchPlan({ jobTitle, reportsToTitle, roleKeywords: parsedRoleKeywords });
  const ready = clayConnected && hasCompany && hasIdentifier && hasKeywords;
  const missing = [
    !clayConnected ? "a Clay API connection" : "",
    !hasCompany ? "the company name" : "",
    !hasIdentifier ? "the company website or LinkedIn page" : "",
    !hasKeywords ? "the role focus" : "",
  ].filter(Boolean);

  return (
    <form action={searchAction} className="grid gap-4 border-b border-border pb-5">
      <div>
        <h3 className="text-sm font-semibold text-ink">Before Clay searches</h3>
        <p className="mt-1 text-xs leading-5 text-muted">
          Job Search Terminal runs three focused Clay API searches and saves no more than five contacts.
          Clay receives the company identifier and title searches shown here. The job description,
          resume, notes, and answers stay in Job Search Terminal.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-control border border-border bg-surface px-3 py-2">
          <dt className="text-xs font-medium text-muted">Clay API connection</dt>
          <dd className="mt-1 flex items-center justify-between gap-3 text-sm text-ink">
            <span>{clayConnected ? "Connected" : "Not connected"}</span>
            <Badge tone={clayConnected ? "success" : "warning"}>{clayConnected ? "Ready" : "Required"}</Badge>
          </dd>
          {!clayConnected ? (
            <a className="mt-2 inline-block text-xs text-accent hover:underline" href="/settings?tab=integrations">
              Connect Clay in Settings → Integrations
            </a>
          ) : null}
        </div>

        <div className="rounded-control border border-border bg-surface px-3 py-2">
          <dt className="text-xs font-medium text-muted">Company</dt>
          <dd className="mt-1 flex items-center justify-between gap-3 text-sm text-ink">
            <span>{hasCompany ? companyName : "Missing from this job"}</span>
            <Badge tone={hasCompany ? "success" : "warning"}>{hasCompany ? "Ready" : "Required"}</Badge>
          </dd>
          {!hasCompany ? <p className="mt-2 text-xs text-warning">Add the company under Overview → Edit job details.</p> : null}
        </div>

        <div className="rounded-control border border-border bg-surface px-3 py-2">
          <dt className="text-xs font-medium text-muted">Shortlist</dt>
          <dd className="mt-1 flex items-center justify-between gap-3 text-sm text-ink">
            <span>Up to {PEOPLE_SHORTLIST_LIMIT} contacts</span>
            <Badge>2 · 2 · 1</Badge>
          </dd>
        </div>
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          error={hasIdentifier ? undefined : "Required before you can search."}
          hint="Use the employer's own website, domain, or LinkedIn company page — not a job-board link."
          label="Company website or LinkedIn page"
          name="companyIdentifier"
          onChange={(event) => setCompanyIdentifier(event.target.value)}
          placeholder="example.com"
          required
          value={companyIdentifier}
        />
        <Input
          error={hasKeywords ? undefined : "Add the function this position belongs to."}
          hint="Use functions, not exact titles. Separate related areas with commas, for example: user experience, product design."
          label="Role focus"
          name="roleKeywords"
          onChange={(event) => setRoleKeywords(event.target.value)}
          placeholder="user experience"
          required
          value={roleKeywords}
        />
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold text-ink">Who Clay will look for</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {searchPlan.map((lane) => (
            <div className="rounded-control border border-border px-3 py-2" key={lane.id}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-medium text-ink">{lane.label}</span>
                <Badge>{lane.limit}</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">{lane.description}</p>
              <p className="mt-1 text-xs leading-5 text-muted">Titles: {lane.titleKeywords.join(", ")}</p>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton
          aria-describedby="people-search-readiness"
          disabled={!ready}
          label="Find relevant people"
          pendingLabel="Searching Clay…"
          savedLabel="Searched"
          variant="secondary"
        />
        <p aria-live="polite" className={`text-xs ${ready ? "text-muted" : "text-warning"}`} id="people-search-readiness">
          {ready
            ? "Ready. Three targeted searches can take a few minutes, return up to five people, and may use allowance for five Clay search results."
            : `Complete ${missing.join(", ")} before searching.`}
        </p>
      </div>
    </form>
  );
}
