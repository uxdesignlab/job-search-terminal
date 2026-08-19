import type { ContactRole } from "../db/types";

/**
 * Provider-neutral contact search (PRD v0.2.1 §41, §5.5).
 *
 * Clay is the first provider, not the domain model. Nothing outside a provider
 * directory may see a Clay response shape, so swapping or adding a provider
 * later is a new adapter rather than a change to contacts, ranking or outreach.
 */

export type PeopleSearchInput = {
  companyName: string;
  /** Domain or LinkedIn URL — how a provider actually pins down an employer. */
  companyIdentifier: string;
  titleKeywords: string[];
  seniorityLevels: string[];
  countries: string[];
  limit: number;
};

export type ContactCandidate = {
  providerRecordId: string;
  name: string;
  title: string;
  company: string;
  linkedinUrl: string;
  workEmail: string;
  location: string;
  suggestedRole: ContactRole;
  profileConfidence: string;
};

/** §63's states, so every failure has a distinct, honest UI. */
export type ContactProviderErrorKind =
  | "not_connected"
  | "invalid_credential"
  | "allowance_reached"
  | "rate_limited"
  | "ambiguous_company"
  | "unavailable";

export class ContactProviderError extends Error {
  constructor(readonly kind: ContactProviderErrorKind, message: string) {
    super(message);
    this.name = "ContactProviderError";
  }
}

export type EnrichmentInput = {
  name: string;
  linkedinUrl: string;
  companyDomain: string;
};

export type EnrichmentResult = {
  workEmail: string;
  emailConfidence: string;
  /** What actually produced this, so the UI never implies verification it did not do. */
  provider: string;
};

export interface ContactProvider {
  readonly name: string;
  searchPeople(input: PeopleSearchInput): Promise<ContactCandidate[]>;
  /**
   * Optional, and genuinely optional in practice: Clay exposes no direct
   * person-enrichment endpoint, only execution of a routine the user has already
   * built in their own workspace. A provider without one simply omits this.
   */
  enrichPerson?(input: EnrichmentInput): Promise<EnrichmentResult>;
}
