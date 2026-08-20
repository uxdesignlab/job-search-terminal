# ATS keyword and resume-tailoring approach

Last reviewed: 2026-07-17

## What major ATS products actually do

There is no portable "ATS score" or universal 70% cutoff. Behavior depends on the
vendor, customer subscription, enabled features, recruiter query, job fields, and the
quality of the parsed resume.

| Product | Documented behavior | Product implication |
| --- | --- | --- |
| Greenhouse Recruiting | Recruiters can run full-text and Boolean searches. Talent Rediscovery supports required (AND) and preferred (OR) keywords and documents exact keyword matching for that workflow. | Preserve important literal job language when truthful, but do not treat every sentence as equally valuable. |
| Workday Recruiting / Skills Cloud | Resumes can be parsed into suggested skills. Skills Cloud connects related skills and supports skills-based candidate matching and match scores. | Extract stable skills and context, not only exact phrases; clear evidence matters. |
| Oracle Recruiting | Candidate search covers resume text and structured fields such as job title, skill, degree, employer, and license. Intelligent Matching considers profile, experience, skills, and education; newer rating features compare parsed resume information with requisition requirements. | Job title, structured experience, skills, credentials, and contextual accomplishments all matter. |
| SAP SuccessFactors Recruiting | Candidate search covers profile and resume data. Documented keyword search uses whole words and AND logic for multiple terms. | Use standard wording and parseable sections; exact whole-word presence remains useful. |
| iCIMS Talent Cloud AI | Matching uses full resume text and professional-experience fields. Job Fit combines skills and experience, and the documented score is relative to the candidate pool rather than an absolute percentage. | Experience context, titles, recency, and duration matter alongside skills. |
| Lever | The core parser extracts readable resume content into candidate fields such as name, work history, and contact information. Semantic screening scores shown in Lever can also come from configured add-ons. | Do not assume that every Lever employer uses a native automatic keyword rank; optimize for parsing and recruiter review first. |

Primary vendor references:

- [Greenhouse full-text resume search](https://support.greenhouse.io/hc/en-us/articles/115004600186-Search-resumes-for-keywords)
- [Greenhouse Boolean candidate search](https://support.greenhouse.io/hc/en-us/articles/202360199-Search-candidates-using-Boolean-queries)
- [Greenhouse Talent Rediscovery keyword behavior](https://support.greenhouse.io/hc/en-us/articles/30184390692379-Talent-Rediscovery)
- [Workday Skills Cloud](https://www.workday.com/en-gb/products/human-capital-management/skills-cloud.html)
- [Workday skills strategy and resume parsing](https://forms.workday.com/content/dam/web/se/documents/ebooks/putting-your-skills-strategy-into-action-ebook-ense.pdf)
- [Oracle candidate search](https://docs.oracle.com/en/cloud/saas/talent-management/faush/candidate-search.html)
- [Oracle suggested-candidate criteria](https://docs.oracle.com/en/cloud/saas/talent-management/faush/understand-suggested-candidates.html)
- [Oracle AI matching ratings](https://docs.oracle.com/en/cloud/saas/talent-management/farqa/evaluate-candidate-applications-using-ai-matching-ratings.html)
- [SAP SuccessFactors candidate-search facts](https://help.sap.com/docs/successfactors-recruiting/setting-up-and-maintaining-sap-successfactors-recruiting/quick-facts-about-candidate-search?locale=en-us%2F1000)
- [iCIMS Talent Cloud AI job-fit scoring](https://community.icims.com/articles/Knowledge/Release-Notes-Winter-Release-2021-iCIMS-Talent-Cloud-AI)
- [Lever resume parsing](https://help.lever.co/hc/en-us/articles/20087345054749-Understanding-resume-parsing)

## Extraction model

> **Current state:** keyword extraction ran inside evaluation (Block E) until the Fast
> Evaluation change. It does not run today — Fast Evaluation deliberately extracts no
> keywords, and Application Preparation, which takes ownership of this work, ships in the
> next phase. Jobs evaluated before the change keep their stored keywords, and resume
> tailoring falls back to them. Newly evaluated jobs have none until Application
> Preparation exists. The model below is the contract that work must satisfy.

Extraction keeps 12-18 high-signal phrases and assigns each a priority, category,
source section, and rationale.

1. **Critical (weight 5):** exact target title and explicit basic, required, or
   must-have qualifications.
2. **Required (weight 3):** core responsibilities and repeated job-specific skills.
3. **Preferred (weight 1):** preferred qualifications and useful secondary context.

The post-processor rejects invented title variants, phrases absent from the posting,
duplicates, long sentences, employer marketing language, and generic traits. Named
tools, credentials, licenses, and frameworks remain high-value literal signals.

The editor reports **job keyword alignment**. An exact phrase earns full weight and
related wording earns half weight. This explains what the app measured without claiming
to reproduce the employer's ATS configuration.

## Work & Co Senior Design Lead review

The previous extraction produced 25 equally weighted entries. It correctly found the
title, digital-product language, user flows, visual/UI design, prototypes, portfolio,
and testing. It also over-selected low-value or difficult-to-action wording such as
"best-in-class solutions," "share work daily," and a full communication-skills phrase.
It invented "Design Lead" as a separate title variant even though extraction was meant
to remain verbatim.

Recommended priority set for this posting:

- **Critical:** Senior Design Lead; portfolio; digital product design.
- **Required:** digital products; user flows; visual design; user experience; user
  interface design; prototypes; strategy; multiple rounds of testing.
- **Preferred:** branding; coding; prototyping tools; motion and visual design;
  synthesize and present findings; articulate design rationale.

For the current Principal resume:

- Keep the truthful held titles. Do not rename a role to "Senior Design Lead."
- Label `pavel.ux.business` as the portfolio URL so the explicit portfolio requirement
  is easy for both parser and reviewer to understand.
- In the summary, prefer evidence-backed phrasing such as "hands-on product design
  leader," "digital product design," "user flows," "visual design," and "prototypes."
- Keep the 0-to-1 Team Capability Engine achievement first because it demonstrates
  concept-to-pilot ownership, product strategy, workflows, and prototyping.
- Use the DePalma and Sitecore evidence for hands-on design leadership, user flows,
  interface/interaction work, and prototype-driven decisions.
- Leave branding, coding, motion design, and repeated user testing as visible gaps until
  a portfolio case, confirmed gap response, or profile supplement provides evidence.
- Favor concise accomplishment bullets with product context and outcomes over adding
  standalone keyword lines.

## Keyword preservation

Tailoring is only worth running if it leaves the resume matching more of the posting
than it started with. Two mechanisms enforce that:

- **Before the call**, the phrases the source draft already matches exactly are named in
  the prompt as protected terms to keep verbatim, alongside the existing list of phrases
  the draft is missing.
- **After the call**, each keyword's match tier (exact / related / missing) is compared
  against the source draft. A phrase that was exact and no longer is gets repaired by
  restoring the specific line that carried it — not the whole section — so the rest of
  the rewrite survives. Related-wording matches are not defended: they belong to no
  single line, and chasing them would revert good tailoring for no ATS gain.

The constraint is a floor on wording, not a licence to leave lines alone. The prompt
says so explicitly, because the first version of it read as "change nothing" and the
model answered by handing back 24 of 25 experience bullets untouched. It also states
that returning the input unchanged is not a rewrite, and that must-have job language the
evidence supports but the draft lacks should be worked in rather than merely considered.

Self-assessment openers are banned outright in the prompt: "Expert at", "Proven record",
"Deep expertise", "Mastery of", "Fluent in", "Skilled at", "Adept at", "Passionate
about", "Seasoned". A recruiter discounts a self-rating and an ATS gains nothing from
it; the sentence should state what the candidate designed, shipped, or led. The prompt
also tells the rewrite to keep the industries, product names, and named specifics the
source states, because genericizing them costs both recruiter interest and searchable
terms.

A run that changes nothing is reported rather than passed off as tailoring. Selected
sections are compared against the source draft on the model's own output; a section
where half or more of the lines came back verbatim is named in the draft editor, and a
run where nothing changed at all is recorded as `source-only` — the same status a
provider failure produces.

## Safety and review boundary

Tailoring may reorder evidence, sharpen wording, and use supported job language. It may
not invent tools, credentials, metrics, responsibilities, or held titles. Unsupported
requirements stay visible in the editor and require user-confirmed evidence before any
rewrite is proposed.

The evidence guard enforces that boundary on checkable facts, not on vocabulary. A
rewrite is free to use any descriptive language the source resume never happened to use;
it is not free to introduce a figure, a named tool or standard, or a seniority or
credential word the evidence does not support. Named entities are detected by
capitalization rather than by a list of known tools, because the list of tools that
exist is not enumerable. Evidence spans every active resume lane plus confirmed gap
answers and supplements, so a fact recorded on one lane supports a rewrite on another.

Unconfirmed posting requirements are not auto-reverted. Being absent from the resume
does not make a phrase false, and guarding them threw away summaries over "user needs"
and "business outcomes". The keyword alignment panel lists them under **Needs confirmed
evidence before use** so the decision stays with the user.

When the guard does revert a section it is a real loss of tailoring, most visibly in the
summary — the section that carries the target title and domain language. The draft editor
names the reverted sections and the unsupported terms rather than reporting a clean audit
over untailored text, so the fix is either adding the evidence or writing the section by
hand.
