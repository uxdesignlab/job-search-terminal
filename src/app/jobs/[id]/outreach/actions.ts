"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ContactSuppressedError,
  deleteContact,
  forgetContact,
  getCompanyContactMetadata,
  getContact,
  getJobById,
  getJobContactLink,
  deleteOutreachMessage,
  updateOutreachMessageText,
  isContactSuppressed,
  linkContactToJob,
  saveCompanyContactMetadata,
  saveContact,
  unlinkContactFromJob,
  updateJobContactStatus,
} from "@/lib/db/queries";
import { rankContact } from "@/lib/contacts/ranking";
import { generateAndSavePersonOutreach } from "@/lib/outreach/person-outreach";
import { resolveCompanyIdentifier } from "@/lib/contacts/company-domain";
import { ContactProviderError } from "@/lib/contacts/provider";
import { ClayProvider, DEFAULT_PEOPLE_LIMIT, hasEnrichmentRoutine, isAutoEnrichEnabled } from "@/lib/integrations/clay/provider";
import type { ContactRecord, OutreachChannel } from "@/lib/db/types";
import type { ContactRole, ContactStatus } from "@/lib/db/types";

function contactId(): string {
  return `contact-${crypto.randomUUID()}`;
}

export async function addContactAction(jobId: string, formData: FormData) {
  const job = getJobById(jobId);
  if (!job) redirect(`/jobs/${jobId}?tab=outreach&error=missing-job`);

  const name = ((formData.get("name") as string) ?? "").trim();
  if (!name) redirect(`/jobs/${jobId}?tab=outreach&error=name-required`);

  const role = ((formData.get("contactRole") as string) || "other") as ContactRole;
  const title = ((formData.get("title") as string) ?? "").trim();
  const [firstName = "", ...rest] = name.split(/\s+/);

  try {
    const contact = saveContact({
      id: contactId(),
      name,
      firstName,
      lastName: rest.join(" "),
      title,
      // `??` would not catch this: an empty text input submits "", not undefined,
      // so the company silently stayed blank and the "works at the hiring company"
      // signal never fired.
      company: ((formData.get("company") as string) ?? "").trim() || job.company,
      companyDomain: "",
      linkedinUrl: ((formData.get("linkedinUrl") as string) ?? "").trim(),
      workEmail: ((formData.get("workEmail") as string) ?? "").trim(),
      sourceProvider: "manual",
      sourceRecordId: "",
      profileConfidence: "",
      emailConfidence: "",
      notes: ((formData.get("notes") as string) ?? "").trim(),
    });

    // Ranked by the same deterministic rules a provider result will be, so a
    // manually added person is not a second-class record (§50).
    const ranked = rankContact({
      contact,
      role,
      job: { title: job.title, company: job.company },
    });

    linkContactToJob({
      jobId,
      contactId: contact.id,
      contactRole: role,
      relevanceScore: ranked.score,
      relevanceReasons: ranked.reasons,
    });
  } catch (error) {
    // A forgotten person must not be silently re-created. Say so, rather than
    // failing quietly or resurrecting them.
    if (error instanceof ContactSuppressedError) {
      redirect(`/jobs/${jobId}?tab=outreach&error=suppressed`);
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?tab=outreach`);
}

export async function setContactStatusAction(jobId: string, contactIdValue: string, status: ContactStatus) {
  updateJobContactStatus(jobId, contactIdValue, status);
  revalidatePath(`/jobs/${jobId}`);
}

/** Remove from this opportunity only — the person stays in the contact list. */
export async function removeFromJobAction(jobId: string, contactIdValue: string) {
  unlinkContactFromJob(jobId, contactIdValue);
  revalidatePath(`/jobs/${jobId}`);
}

export async function deleteContactAction(jobId: string, contactIdValue: string) {
  deleteContact(contactIdValue);
  revalidatePath(`/jobs/${jobId}`);
}

/** Delete and suppress, so a later search does not resurrect them. */
export async function forgetContactAction(jobId: string, contactIdValue: string) {
  forgetContact(contactIdValue);
  revalidatePath(`/jobs/${jobId}`);
}

/**
 * Find people at the hiring company (§44–§47, §71).
 *
 * Explicit user action only — §5.2. Nothing here runs on discovery, evaluation
 * or page load, because each result costs the user's Clay allowance.
 */
export async function findPeopleAction(jobId: string) {
  const job = getJobById(jobId);
  if (!job) redirect(`/jobs/${jobId}?tab=outreach&error=missing-job`);

  const saved = getCompanyContactMetadata(job.company);
  const resolved = resolveCompanyIdentifier({
    job,
    profileDomain: saved?.domain,
    profileLinkedIn: saved?.linkedinUrl,
  });

  // §40: an ambiguous company must be confirmed, never guessed. Searching the
  // wrong employer returns real people who have nothing to do with this role.
  if (resolved.needsConfirmation) {
    redirect(`/jobs/${jobId}?tab=outreach&error=needs-company`);
  }

  // Remember a domain derived from the posting so the next search skips this step.
  if (resolved.source === "job_url") {
    saveCompanyContactMetadata(job.company, { domain: resolved.identifier, intelligenceSource: "job_url" });
  }

  const provider = new ClayProvider();
  let candidates;
  try {
    // §71: company, titles, seniority and location only. The resume, private
    // notes, Story Bank and gap history never leave JST.
    candidates = await provider.searchPeople({
      companyName: job.company,
      companyIdentifier: resolved.identifier,
      titleKeywords: titleKeywordsFor(job.roleArchetype || job.title),
      seniorityLevels: [],
      countries: [],
      limit: DEFAULT_PEOPLE_LIMIT,
    });
  } catch (error) {
    if (error instanceof ContactProviderError) {
      redirect(`/jobs/${jobId}?tab=outreach&error=clay-${error.kind}`);
    }
    throw error;
  }

  let added = 0;
  const savedContacts: ContactRecord[] = [];
  for (const candidate of candidates) {
    const identity = {
      sourceProvider: "clay",
      sourceRecordId: candidate.providerRecordId,
      linkedinUrl: candidate.linkedinUrl,
      workEmail: candidate.workEmail,
    };
    // A person the user forgot must not come back through a later search.
    if (isContactSuppressed(identity)) continue;

    const contact = saveContact({
      id: `contact-${crypto.randomUUID()}`,
      name: candidate.name,
      firstName: candidate.name.split(/\s+/)[0] ?? "",
      lastName: candidate.name.split(/\s+/).slice(1).join(" "),
      title: candidate.title,
      company: candidate.company || job.company,
      companyDomain: resolved.identifier,
      linkedinUrl: candidate.linkedinUrl,
      workEmail: candidate.workEmail,
      sourceProvider: "clay",
      sourceRecordId: candidate.providerRecordId,
      profileConfidence: candidate.profileConfidence,
      emailConfidence: "",
      notes: "",
    });

    // JST ranks, not Clay (§48) — the provider finds people, JST decides who matters.
    const ranked = rankContact({
      contact,
      role: candidate.suggestedRole,
      job: { title: job.title, company: job.company },
    });
    linkContactToJob({
      jobId,
      contactId: contact.id,
      contactRole: candidate.suggestedRole,
      relevanceScore: ranked.score,
      relevanceReasons: ranked.reasons,
    });
    savedContacts.push(contact);
    added += 1;
  }

  // Opt-in: fill in emails for everyone just found, in a single routine run
  // rather than one per person. Off by default because Clay charges per person
  // enriched — batching saves round trips, not credits.
  if (added > 0 && isAutoEnrichEnabled() && hasEnrichmentRoutine()) {
    try {
      // Clay's routine declares Social Profile URL as required and rejects the
      // *entire* batch with a 400 if any item omits it. One contact without a
      // LinkedIn URL would otherwise cost everyone in the search their email.
      const enrichable = savedContacts.filter((c) => c.linkedinUrl.trim().length > 0);
      const enriched = enrichable.length > 0
        ? await provider.enrichPeople(
            enrichable.map((c) => ({ name: c.name, linkedinUrl: c.linkedinUrl, companyDomain: c.companyDomain }))
          )
        : new Map();
      for (const contact of enrichable) {
        const found = enriched.get(contact.linkedinUrl || contact.name);
        if (found?.workEmail) {
          saveContact({ ...contact, workEmail: found.workEmail, emailConfidence: found.emailConfidence });
        }
      }
    } catch (error) {
      // A failed lookup must not discard a successful search — the people are
      // already saved and usable without an email.
      console.warn("[outreach] automatic enrichment failed; contacts kept without emails:", error);
    }
  }

  revalidatePath(`/jobs/${jobId}`);
  if (added === 0) redirect(`/jobs/${jobId}?tab=outreach&error=clay-no-results`);
  // Redirect on success too, not only on failure. Without it the browser stays on
  // the POST result and a refresh re-submits the search, spending Clay allowance
  // with no user action behind it — which §5.2 forbids.
  redirect(`/jobs/${jobId}?tab=outreach`);
}

/** Function keywords for the search, derived from the role rather than the full title. */
function titleKeywordsFor(role: string): string[] {
  const cleaned = role.replace(/[^a-zA-Z ]/g, " ").toLowerCase();
  const stop = new Set(["senior", "staff", "principal", "lead", "of", "and", "the", "sr", "jr", "i", "ii", "iii"]);
  const words = cleaned.split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
  return words.length > 0 ? [words.slice(0, 3).join(" ")] : [];
}

/**
 * Find a work email for one contact (§49).
 *
 * One person at a time, on an explicit click, after the user has decided who
 * matters. Never applied across a search result set — that is the whole point of
 * keeping search and enrichment separate.
 */
export async function enrichContactAction(jobId: string, contactIdValue: string) {
  const contact = getContact(contactIdValue);
  if (!contact) redirect(`/jobs/${jobId}?tab=outreach&error=missing-contact`);

  const provider = new ClayProvider();
  if (!provider.enrichPerson) redirect(`/jobs/${jobId}?tab=outreach&error=clay-no-enrichment`);
  // The routine looks people up by profile URL; without one there is nothing to
  // send, and Clay would reject the request rather than return an empty result.
  if (!contact.linkedinUrl.trim()) redirect(`/jobs/${jobId}?tab=outreach&error=enrich-needs-linkedin`);

  try {
    const result = await provider.enrichPerson({
      name: contact.name,
      linkedinUrl: contact.linkedinUrl,
      companyDomain: contact.companyDomain,
    });

    if (!result.workEmail) {
      redirect(`/jobs/${jobId}?tab=outreach&error=enrich-no-email`);
    }

    saveContact({
      ...contact,
      workEmail: result.workEmail,
      emailConfidence: result.emailConfidence,
    });
  } catch (error) {
    if (error instanceof ContactProviderError) {
      redirect(`/jobs/${jobId}?tab=outreach&error=clay-${error.kind}`);
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?tab=outreach`);
}

/**
 * Draft a message to one person on one channel (§53).
 *
 * Explicit action, one contact at a time. Outreach never forces resume
 * generation or Application Preparation (§34) — both sharpen the message when
 * they exist, and neither is a precondition for reaching out.
 */
export async function draftMessageAction(jobId: string, contactIdValue: string, formData: FormData) {
  const contact = getContact(contactIdValue);
  const link = getJobContactLink(jobId, contactIdValue);
  if (!contact || !link) redirect(`/jobs/${jobId}?tab=outreach&error=missing-contact`);

  const channel = ((formData.get("channel") as string) || "linkedin_message") as OutreachChannel;

  try {
    await generateAndSavePersonOutreach({ jobId, contact, link, channel });
  } catch (error) {
    console.error("[outreach] draft generation failed:", error);
    redirect(`/jobs/${jobId}?tab=outreach&error=draft-failed`);
  }

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?tab=outreach`);
}

/** Save the user's edits. The draft is theirs to change before it is sent. */
export async function saveMessageEditAction(jobId: string, messageId: string, formData: FormData) {
  updateOutreachMessageText(
    messageId,
    ((formData.get("subject") as string) ?? "").trim(),
    ((formData.get("message") as string) ?? "").trim()
  );
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?tab=outreach`);
}

export async function deleteMessageAction(jobId: string, messageId: string) {
  deleteOutreachMessage(messageId);
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?tab=outreach`);
}
