export type ResumeTemplateInput = {
  name: string;
  headline: string;
  contactItems: string[];
  title: string;
  summaryHeading?: string;
  summary: string;
  impactHeading: string;
  impactItems: string[];
  experienceHeading: string;
  experience: Array<{
    title: string;
    organization: string;
    location?: string;
    dateRange: string;
    bullets: string[];
	  }>;
  skillsHeading?: string;
  skills: string[];
  recognitionHeading?: string;
  recognition: string[];
  extraSections?: Array<{
    id?: string;
    title: string;
    items: string[];
  }>;
  educationHeading?: string;
  education: Array<{
    degree: string;
    school: string;
    focus?: string;
  }>;
};

export function renderResumeHtml(input: ResumeTemplateInput) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="author" content="${escapeHtml(input.name)}" />
    <meta name="description" content="${escapeHtml(input.name)} — tailored resume" />
    <title>${escapeHtml(input.name)} — Resume</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #2f3a40;
        --muted: #34424a;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: #ffffff;
        color: var(--ink);
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11.5px;
        line-height: 1.38;
      }

      .page {
        max-width: 760px;
        margin: 48px auto 56px;
      }

      h1, h2, h3, p, ul {
        margin: 0;
      }

      h1 {
        font-size: 27px;
        font-weight: 400;
        line-height: 1.1;
        letter-spacing: 0;
        text-align: center;
      }

      h2 {
        font-size: 20px;
        font-weight: 400;
        line-height: 1.2;
        margin-top: 20px;
      }

      h3 {
        font-size: 16px;
        font-weight: 400;
        line-height: 1.25;
        margin-top: 13px;
      }

      .headline,
      .contact {
        color: var(--muted);
        margin-top: 5px;
        text-align: center;
      }

      .summary p {
        margin-top: 5px;
      }

      .job-meta {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        margin-top: 3px;
      }

      .organization {
        font-style: normal;
      }

      .date {
        white-space: nowrap;
      }

      ul {
        margin-top: 6px;
        padding-left: 24px;
      }

      li + li {
        margin-top: 3px;
      }

      a {
        color: #0057b8;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <main class="page">
    <div class="page">
      <header>
        <h1>${escapeHtml(input.name)}</h1>
        ${input.headline ? `<p class="headline">${escapeHtml(input.headline)}</p>` : ""}
        <p class="contact">${renderContact(input.contactItems)}</p>
      </header>

      <section>
        <h2>${escapeHtml(input.summaryHeading || "Professional Summary")}</h2>
        <p>${escapeHtml(input.summary)}</p>
      </section>

      ${renderOptionalSection(input.impactHeading || "Key Achievements", input.impactItems)}

      <section class="experience">
        <h2>${escapeHtml(input.experienceHeading || "Professional Experience")}</h2>
        ${input.experience
          .map(
            (item) => `          <div class="job-entry">
            <h3>${escapeHtml(item.title)}</h3>
            <p class="job-meta">
              <span class="organization">${[item.organization, item.location].filter((s): s is string => Boolean(s)).map(escapeHtml).join(" · ")}</span>
              ${item.dateRange ? `<span class="date">${escapeHtml(item.dateRange)}</span>` : ""}
            </p>
            <ul>
              ${item.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}
            </ul>
          </div>`
          )
          .join("")}
      </section>

      ${renderOptionalSection(input.skillsHeading || "Skills", input.skills)}
      ${renderOptionalSection(input.recognitionHeading || "Awards and Recognition", input.recognition)}
      ${(input.extraSections ?? []).map((section) => renderOptionalSection(section.title, section.items)).join("")}
      ${renderEducation(input.education, input.educationHeading)}
    </div>
  </body>
</html>`;
}

function renderOptionalSection(title: string, items: string[]) {
  if (items.length === 0) {
    return "";
  }

  return `
      <section>
        <h2>${escapeHtml(title)}</h2>
        <ul>
          ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>`;
}

function renderEducation(items: ResumeTemplateInput["education"], heading?: string) {
  if (items.length === 0) return "";
  return `
      <section>
        <h2>${escapeHtml(heading || "Education")}</h2>
        ${items
          .map(
            (item) => `
        <div class="edu-entry">
          <h3>${escapeHtml(item.degree)}</h3>
          <p>${escapeHtml(item.school)}</p>
          ${item.focus ? `<p>${escapeHtml(item.focus)}</p>` : ""}
        </div>`
          )
          .join("\n")}
      </section>`;
}

function safeHref(url: string): string {
  // Only allow http/https/mailto schemes in href attributes.
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return url;
  return "#";
}

function renderContact(items: string[]) {
  return items.map((item) => {
    if (item.includes("@")) {
      return `<a href="${safeHref(`mailto:${item}`)}">${escapeHtml(item)}</a>`;
    }
    if (/^https?:\/\//i.test(item) || /^www\./i.test(item) || item.includes("linkedin.com")) {
      const url = item.startsWith("http") ? item : `https://${item}`;
      return `<a href="${safeHref(url)}">${escapeHtml(item)}</a>`;
    }
    // Bare domain like "pavel.ux.business" — no spaces, has at least one dot
    if (/^[a-z0-9]([a-z0-9-]*\.)+[a-z]{2,}$/i.test(item)) {
      return `<a href="${safeHref(`https://${item}`)}">${escapeHtml(item)}</a>`;
    }
    return escapeHtml(item);
  }).join(" | ");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
