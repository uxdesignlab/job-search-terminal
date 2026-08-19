import type { JobRecord } from "../db/types";

/**
 * Which company a search should target (PRD v0.2.1 §40).
 *
 * Getting this wrong is worse than not searching: a domain guessed from an ATS
 * host returns real people at the wrong employer, and nothing downstream would
 * reveal the mistake.
 */

/**
 * Applicant-tracking and aggregator hosts. A job URL usually points at one of
 * these rather than the employer, so deriving a domain from the URL is only safe
 * once they are excluded.
 */
const NON_EMPLOYER_HOSTS = [
  "greenhouse.io", "lever.co", "ashbyhq.com", "workday.com", "myworkdayjobs.com",
  "smartrecruiters.com", "jobvite.com", "icims.com", "bamboohr.com", "breezy.hr",
  "recruitee.com", "workable.com", "teamtailor.com", "personio.de", "rippling.com",
  "linkedin.com", "indeed.com", "glassdoor.com", "monster.com", "dice.com",
  "wellfound.com", "angel.co", "ziprecruiter.com", "himalayas.app", "adzuna.com",
  "workatastartup.com", "builtin.com", "otta.com", "welcometothejungle.com",
  "google.com", "notion.site", "airtable.com",
];

export function isEmployerHost(host: string): boolean {
  const clean = host.toLowerCase().replace(/^www\./, "");
  return !NON_EMPLOYER_HOSTS.some((bad) => clean === bad || clean.endsWith(`.${bad}`));
}

export function domainFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return isEmployerHost(host) ? host : "";
  } catch {
    return "";
  }
}

export type CompanyResolution = {
  /** Domain or LinkedIn URL Clay can pin the employer down with. */
  identifier: string;
  source: "profile" | "job_url" | "none";
  /** True when nothing reliable was found and the user must supply it (§40). */
  needsConfirmation: boolean;
};

/**
 * §40's order: a saved company profile first, then the job URL when it is
 * genuinely the employer's own host. Clay's own company lookup is deliberately
 * not used to guess — an ambiguous match must ask rather than pick.
 */
export function resolveCompanyIdentifier(input: {
  job: Pick<JobRecord, "url">;
  profileDomain?: string;
  profileLinkedIn?: string;
}): CompanyResolution {
  const saved = (input.profileDomain ?? "").trim() || (input.profileLinkedIn ?? "").trim();
  if (saved) return { identifier: saved, source: "profile", needsConfirmation: false };

  const derived = domainFromUrl(input.job.url ?? "");
  if (derived) return { identifier: derived, source: "job_url", needsConfirmation: false };

  return { identifier: "", source: "none", needsConfirmation: true };
}
