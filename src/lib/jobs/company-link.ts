import type { ApplicationStatus } from "@/lib/db/types";

/**
 * Statuses that mean the user actually submitted an application. `Applied` is the
 * moment of submission; everything after it — a follow-up, a recruiter reply, an
 * interview, an offer, a rejection — can only be reached by having applied, so all
 * of them count as an application at that company. `Skipped` and `Archived` do not:
 * they are ways of dropping a role, not of pursuing it.
 */
export const APPLIED_JOB_STATUSES: ApplicationStatus[] = [
  "Applied",
  "Follow-up needed",
  "Recruiter responded",
  "Interviewing",
  "Offer",
  "Rejected",
];

const APPLIED_STATUS_SET = new Set<string>(APPLIED_JOB_STATUSES);

export function isAppliedStatus(status: string): boolean {
  return APPLIED_STATUS_SET.has(status);
}

/** The Jobs list focused on one company, showing every position and status. */
export function companyJobsHref(company: string): string {
  return `/jobs?company=${encodeURIComponent(company)}`;
}

export type CompanyJobStats = {
  /** Non-archived jobs at this company — the rows the focused Jobs list will show. */
  total: number;
  /** How many of those the user has applied to. */
  applied: number;
};

export type CompanyLink = {
  href: string;
  /** Rendered after the name as `(n)` when the user has applied here before. */
  appliedCount: number;
};

/**
 * Whether the company name on a job should be a link, and what it should say.
 *
 * A link is only worth offering when the Jobs list has something to show beyond
 * the job already on screen: another position at the same company, or a record
 * that the user applied here. A company tracked exactly once, never applied to,
 * gets plain text — the link would lead to a list containing only this page.
 */
export function companyLinkFor(company: string, stats: CompanyJobStats): CompanyLink | null {
  const name = company.trim();
  if (!name) return null;
  if (stats.applied === 0 && stats.total < 2) return null;
  return { href: companyJobsHref(name), appliedCount: stats.applied };
}
