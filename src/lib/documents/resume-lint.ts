import type { JobKeywordSignal } from "../db/types";
import { isKeywordInText } from "./keyword-coverage";
import type { ResumeTemplateInput } from "./resume-template";

/**
 * Checks a resume against the rules a recruiter and an applicant tracking system
 * actually apply — the ones that can be decided from the text alone.
 *
 * These rules used to live only in the tailoring prompt. A prompt is a request: a
 * model can open with "Proven track record", write a 300-character bullet, or start
 * four bullets with "Led", and nothing noticed. Here they are measured, so the writer
 * can send a part back once to be fixed and the editor can show what is still wrong.
 *
 * Imported by the browser as well as the server, so it must stay free of Node APIs.
 */

/** Words a recruiter reads as puffery. Shared with the prompt so the two cannot disagree. */
export const HYPE_TERMS = [
  "visionary",
  "world-class",
  "world class",
  "rockstar",
  "rock star",
  "guru",
  "ninja",
  "unparalleled",
  "results-driven",
  "results driven",
  "synergy",
  "best-in-class",
  "game-changer",
  "game changer",
];

/** Openers that rate the candidate instead of saying what they did. */
export const SELF_ASSESSMENT_OPENERS = [
  "expert at",
  "expert in",
  "proven record",
  "proven track record",
  "deep expertise",
  "mastery of",
  "fluent in",
  "skilled at",
  "adept at",
  "passionate about",
  "seasoned",
  "highly motivated",
  "detail-oriented",
];

/** A bullet longer than this runs past two printed lines in the resume template. */
export const MAX_BULLET_CHARS = 240;
export const MAX_SUMMARY_WORDS = 90;
export const MAX_SUMMARY_SENTENCES = 4;
/**
 * A phrase reads as stuffed when it is both frequent and dense. Count alone was wrong:
 * measured on a real two-page senior resume, "accessibility" appeared ten times — once
 * per job where accessibility was the work — at about 1% of the words, which a recruiter
 * reads as the candidate's field, not as stuffing. Density alone is wrong the other way:
 * a three-line summary saying one word twice is dense but not stuffed.
 */
export const MAX_KEYWORD_REPEATS = 3;
export const MAX_KEYWORD_DENSITY = 0.025;

export type LintRule =
  | "hype"
  | "self-assessment"
  | "first-person"
  | "too-long"
  | "summary-length"
  | "repeated-opener"
  | "duplicate"
  | "empty"
  | "tacked-keyword";

export type LintIssue = {
  rule: LintRule;
  /** Which line, as an index into the part's lines; -1 for the part as a whole. */
  index: number;
  message: string;
};

export type LintPartKind = "role" | "impact" | "summary" | "skills" | "extra";

/**
 * "I" is matched only as a capital, so "i.e." does not trip it; "me" and "us" are left
 * out entirely because resumes say "US market" and "Portland, ME" far more often than
 * they slip into first person with those two words.
 */
const FIRST_PERSON_CAPITAL_I = /(^|[^A-Za-z'’])I(?=$|[^A-Za-z'’])/;
const FIRST_PERSON_WORDS = /\b(my|mine|we|our|ours)\b/i;

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function openingVerb(line: string): string {
  return normalize(line).replace(/^[^a-z]+/, "").split(" ")[0] ?? "";
}

function sentencesIn(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
}

/**
 * Problems in one part of a resume. Skills and custom sections are list items, not
 * sentences, so only the rules that make sense for a list apply to them.
 */
export function lintPart(kind: LintPartKind, lines: string[], placedKeywords: string[] = []): LintIssue[] {
  const issues: LintIssue[] = [];
  const prose = kind !== "skills";
  const placed = placedKeywords.map((keyword) => normalize(keyword)).filter(Boolean);

  lines.forEach((line, index) => {
    const text = line.trim();
    if (!text) {
      issues.push({ rule: "empty", index, message: "Empty line." });
      return;
    }
    const lower = normalize(text);
    if (prose) {
      const hype = HYPE_TERMS.find((term) => lower.includes(term));
      if (hype) issues.push({ rule: "hype", index, message: `Uses "${hype}", which reads as hype rather than evidence.` });
      const opener = SELF_ASSESSMENT_OPENERS.find((phrase) =>
        lower.startsWith(phrase) || sentencesIn(lower).some((sentence) => sentence.startsWith(phrase))
      );
      if (opener) issues.push({ rule: "self-assessment", index, message: `Opens with "${opener}" — say what was done instead of rating it.` });
      if (FIRST_PERSON_CAPITAL_I.test(text) || FIRST_PERSON_WORDS.test(text)) issues.push({ rule: "first-person", index, message: "Uses first person (I, my, we). Resumes use implied third person." });
    }
    // A phrase the writer was asked to place, bolted onto the end of a sentence with a
    // connective ("… using user-centered design."), is the keyword stuffing a recruiter
    // spots first. Measured on a real summary: told not to, a 12B model did it anyway.
    if (prose && placed.length > 0) {
      const tacked = placed.find((keyword) =>
        sentencesIn(lower).some((sentence) => {
          const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`\\b(using|with|through|via|leveraging|including|and)\\s+${escaped}[.!]?$`).test(sentence);
        })
      );
      if (tacked) issues.push({ rule: "tacked-keyword", index, message: `"${tacked}" is tacked onto the end of a sentence. Work it into what the line says, or leave it out.` });
    }
    if ((kind === "role" || kind === "impact") && text.length > MAX_BULLET_CHARS) {
      issues.push({ rule: "too-long", index, message: `Runs ${text.length} characters, past two printed lines (${MAX_BULLET_CHARS}).` });
    }
  });

  if (kind === "summary" && lines[0]) {
    const words = lines[0].trim().split(/\s+/).filter(Boolean).length;
    const sentences = sentencesIn(lines[0]).length;
    if (words > MAX_SUMMARY_WORDS || sentences > MAX_SUMMARY_SENTENCES) {
      issues.push({
        rule: "summary-length",
        index: 0,
        message: `The summary is ${words} words in ${sentences} sentences; keep it to ${MAX_SUMMARY_SENTENCES} sentences and ${MAX_SUMMARY_WORDS} words so it is read in full.`,
      });
    }
  }

  if (kind === "role") {
    const seen = new Map<string, number>();
    lines.forEach((line, index) => {
      const verb = openingVerb(line);
      if (!verb) return;
      if (seen.has(verb)) {
        issues.push({ rule: "repeated-opener", index, message: `Starts with "${verb}", like line ${seen.get(verb)! + 1} in the same job.` });
      } else {
        seen.set(verb, index);
      }
    });
  }

  const seenLines = new Map<string, number>();
  lines.forEach((line, index) => {
    const key = normalize(line);
    if (!key) return;
    if (seenLines.has(key)) issues.push({ rule: "duplicate", index, message: `Repeats line ${seenLines.get(key)! + 1} word for word.` });
    else seenLines.set(key, index);
  });

  return issues;
}

export type ResumeCheckId =
  | "title-in-summary"
  | "keywords-in-body"
  | "keyword-repetition"
  | "contact-email"
  | "contact-phone"
  | "standard-headings"
  | "date-format"
  | "writing-rules";

export type ResumeCheck = {
  id: ResumeCheckId;
  label: string;
  status: "pass" | "flag";
  detail: string;
};

const STOP_WORDS = new Set(["a", "an", "and", "of", "the", "for", "to", "in", "sr", "jr", "senior", "junior", "lead", "i", "ii", "iii"]);

function titleCoreTerms(title: string): string[] {
  return normalize(title)
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

function countPhrase(text: string, phrase: string): number {
  const haystack = ` ${normalize(text).replace(/[^a-z0-9+#]+/g, " ")} `;
  const needle = ` ${normalize(phrase).replace(/[^a-z0-9+#]+/g, " ").trim()} `;
  if (needle.trim().length === 0) return 0;
  return haystack.split(needle).length - 1;
}

const STANDARD_EXPERIENCE = /\b(experience|employment|work history|career history)\b/i;
const STANDARD_SKILLS = /\b(skills|competencies|expertise|tools|technologies)\b/i;

const DATE_SHAPES: Array<[string, RegExp]> = [
  ["Month Year", /^[A-Za-z]{3,9}\.? \d{4}$/],
  ["MM/YYYY", /^\d{1,2}\/\d{4}$/],
  ["YYYY", /^\d{4}$/],
];

function dateShape(value: string): string {
  const trimmed = value.trim();
  if (/^(present|current|now)$/i.test(trimmed)) return "present";
  return DATE_SHAPES.find(([, pattern]) => pattern.test(trimmed))?.[0] ?? "other";
}

/**
 * The draft as it will print: sections the user removed are emptied.
 *
 * The editor's Remove takes a section out of `sectionOrder` and leaves its content in
 * place, and the renderer prints only what the order names. Checking every stored array
 * let text that is not on the exported resume satisfy a check — removing the only
 * section that said "service design" still reported the phrase as shown in context.
 * The order mirrors `renderResumeHtml`'s default when the draft carries none.
 */
export function printedSections(draft: ResumeTemplateInput): ResumeTemplateInput {
  const order = new Set(draft.sectionOrder ?? [
    "summary", "impact", "experience", "skills", "recognition",
    ...(draft.extraSections ?? []).map((section) => section.id ?? "").filter(Boolean),
  ]);
  return {
    ...draft,
    summary: order.has("summary") ? draft.summary : "",
    impactItems: order.has("impact") ? draft.impactItems : [],
    experience: order.has("experience") ? draft.experience : [],
    skills: order.has("skills") ? draft.skills : [],
    recognition: order.has("recognition") ? draft.recognition : [],
    extraSections: (draft.extraSections ?? []).filter((section) => section.id !== undefined && order.has(section.id)),
  };
}

/**
 * The whole-document report shown in the editor as "ATS & recruiter checks".
 *
 * `supportedKeywords` are the posting phrases the candidate's evidence backs. Only
 * those are expected in the body: asking for a phrase the evidence does not support
 * would be asking the user to add a false claim.
 */
export function checkResume(
  fullDraft: ResumeTemplateInput,
  keywordSignals: JobKeywordSignal[],
  supportedKeywords: string[],
  targetTitle: string
): ResumeCheck[] {
  const draft = printedSections(fullDraft);
  const checks: ResumeCheck[] = [];
  const supported = new Set(supportedKeywords.map((keyword) => keyword.toLowerCase()));

  const opening = `${draft.headline}\n${draft.summary}`;
  const core = titleCoreTerms(targetTitle);
  const coreFound = core.filter((term) => countPhrase(opening, term) > 0);
  const titleSupported = supported.has(targetTitle.toLowerCase()) || core.length === 0;
  checks.push({
    id: "title-in-summary",
    label: "Target role named near the top",
    status: core.length === 0 || coreFound.length >= Math.min(2, core.length) ? "pass" : "flag",
    detail: core.length === 0 || coreFound.length >= Math.min(2, core.length)
      ? "The headline or summary uses the role's own words, which is the first thing a recruiter and a title search look for."
      : titleSupported
        ? `The headline and summary do not use the words of "${targetTitle}". Your evidence supports it — say it once, plainly.`
        : `The headline and summary do not use the words of "${targetTitle}". Use the closest honest description your resume supports rather than the title itself.`,
  });

  const body = [draft.summary, ...draft.impactItems, ...draft.experience.flatMap((entry) => entry.bullets), ...(draft.extraSections ?? []).flatMap((section) => section.items)].join("\n");
  const skillsText = draft.skills.join("\n");
  const mustHave = keywordSignals.filter((signal) =>
    signal.category !== "title" && signal.priority !== "preferred" && supported.has(signal.keyword.toLowerCase())
  );
  const onlyInSkills = mustHave.filter((signal) => !isKeywordInText(body, signal.keyword) && isKeywordInText(skillsText, signal.keyword));
  const absent = mustHave.filter((signal) => !isKeywordInText(body, signal.keyword) && !isKeywordInText(skillsText, signal.keyword));
  checks.push({
    id: "keywords-in-body",
    label: "Key job language shown in context",
    status: onlyInSkills.length === 0 && absent.length === 0 ? "pass" : "flag",
    detail: onlyInSkills.length === 0 && absent.length === 0
      ? mustHave.length === 0
        ? "No must-have phrases are backed by your evidence yet, so there is nothing to place."
        : "Every must-have phrase your evidence supports appears in the summary or a bullet, not just in a skills list."
      : [
        onlyInSkills.length > 0 ? `Only in Skills: ${onlyInSkills.map((signal) => `"${signal.keyword}"`).join(", ")}. A bullet showing where you used it counts for more.` : "",
        absent.length > 0 ? `Missing: ${absent.map((signal) => `"${signal.keyword}"`).join(", ")}.` : "",
      ].filter(Boolean).join(" "),
  });

  const allText = [opening, body, skillsText].join("\n");
  const totalWords = Math.max(1, allText.split(/\s+/).filter(Boolean).length);
  const repeated = keywordSignals
    .filter((signal) => signal.category !== "title")
    .map((signal) => {
      const count = countPhrase(allText, signal.keyword);
      const phraseWords = Math.max(1, signal.keyword.trim().split(/\s+/).length);
      return { keyword: signal.keyword, count, density: (count * phraseWords) / totalWords };
    })
    .filter((entry) => entry.count > MAX_KEYWORD_REPEATS && entry.density > MAX_KEYWORD_DENSITY);
  checks.push({
    id: "keyword-repetition",
    label: "No keyword stuffing",
    status: repeated.length === 0 ? "pass" : "flag",
    detail: repeated.length === 0
      ? "No job phrase is repeated so often, for the length of the resume, that it reads as stuffed."
      : `Repeated often enough for this length to read as stuffing: ${repeated.map((entry) => `"${entry.keyword}" (${entry.count}×)`).join(", ")}. Keep it where it describes real work and cut the rest.`,
  });

  const contact = draft.contactItems.join("\n");
  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(contact);
  checks.push({
    id: "contact-email",
    label: "Email address",
    status: hasEmail ? "pass" : "flag",
    detail: hasEmail ? "An email address is in the contact line." : "No email address in the contact line. Most applicant systems expect one and some reject a resume without it.",
  });
  const hasPhone = /\+?\d[\d\s().-]{7,}\d/.test(contact);
  checks.push({
    id: "contact-phone",
    label: "Phone number",
    status: hasPhone ? "pass" : "flag",
    detail: hasPhone ? "A phone number is in the contact line." : "No phone number in the contact line. Recruiters often call before they email.",
  });

  const odd: string[] = [];
  if (draft.experience.length > 0 && !STANDARD_EXPERIENCE.test(draft.experienceHeading)) odd.push(`"${draft.experienceHeading}"`);
  if (draft.skills.length > 0 && draft.skillsHeading && !STANDARD_SKILLS.test(draft.skillsHeading)) odd.push(`"${draft.skillsHeading}"`);
  checks.push({
    id: "standard-headings",
    label: "Section names a system recognises",
    status: odd.length === 0 ? "pass" : "flag",
    detail: odd.length === 0
      ? "Experience and skills sit under headings applicant systems recognise."
      : `${odd.join(" and ")} may not be recognised. A heading that contains "Experience" or "Skills" is the safe choice.`,
  });

  const shapes = new Set(
    draft.experience
      .flatMap((entry) => entry.dateRange.split(/\s*[-–—]\s*|\s+to\s+/i))
      .map(dateShape)
      .filter((shape) => shape !== "present")
  );
  checks.push({
    id: "date-format",
    label: "Dates written one way",
    status: shapes.size <= 1 ? "pass" : "flag",
    detail: shapes.size <= 1
      ? "Every job's dates use the same format."
      : "Job dates mix formats. Pick one, for example Jan 2021 – Present, and use it for every job.",
  });

  const partIssues = [
    ...lintPart("summary", draft.summary ? [draft.summary] : []).map((issue) => ({ ...issue, where: "Summary" })),
    ...lintPart("impact", draft.impactItems).map((issue) => ({ ...issue, where: draft.impactHeading })),
    ...draft.experience.flatMap((entry) => lintPart("role", entry.bullets).map((issue) => ({ ...issue, where: `${entry.title}${entry.organization ? `, ${entry.organization}` : ""}` }))),
  ];
  checks.push({
    id: "writing-rules",
    label: "Plain, specific writing",
    status: partIssues.length === 0 ? "pass" : "flag",
    detail: partIssues.length === 0
      ? "No hype, self-rating, first person, over-long bullets, or repeated openings."
      : partIssues.slice(0, 5).map((issue) => `${issue.where}${issue.index >= 0 ? ` line ${issue.index + 1}` : ""}: ${issue.message}`).join(" ")
        + (partIssues.length > 5 ? ` And ${partIssues.length - 5} more.` : ""),
  });

  return checks;
}
