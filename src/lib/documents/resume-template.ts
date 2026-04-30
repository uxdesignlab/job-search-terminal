export type ResumeTemplateInput = {
  name: string;
  headline: string;
  contactItems: string[];
  title: string;
  summary: string;
  impactHeading: string;
  impactItems: string[];
  experienceHeading: string;
  experience: Array<{
    title: string;
    organization: string;
    dateRange: string;
    bullets: string[];
  }>;
  skills: string[];
  recognition: string[];
  education: string[];
};

export function renderResumeHtml(input: ResumeTemplateInput) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.name)} - ${escapeHtml(input.title)}</title>
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

      @page {
        margin: 0.45in 0.55in;
      }
    </style>
  </head>
  <body>
    <main class="page">
      <header>
        <h1>${escapeHtml(input.name)}</h1>
        <p class="headline">${escapeHtml(input.headline)}</p>
        <p class="contact">${renderContact(input.contactItems)}</p>
      </header>

      <section class="summary">
        <h2>Summary</h2>
        <p>${escapeHtml(input.summary)}</p>
      </section>

      <section>
        <h2>${escapeHtml(input.impactHeading)}</h2>
        <ul>
          ${input.impactItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>

      <section>
        <h2>${escapeHtml(input.experienceHeading)}</h2>
        ${input.experience
          .map(
            (item) => `
          <article>
            <h3>${escapeHtml(item.title)}</h3>
            <div class="job-meta">
              <p class="organization">${escapeHtml(item.organization)}</p>
              <p class="date">${escapeHtml(item.dateRange)}</p>
            </div>
            <ul>
              ${item.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}
            </ul>
          </article>`
          )
          .join("")}
      </section>

      ${renderOptionalSection("Skills", input.skills)}
      ${renderOptionalSection("Recognition", input.recognition)}
      ${renderOptionalSection("Education", input.education)}
    </main>
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

function renderContact(items: string[]) {
  return items
    .map((item) => {
      if (item.includes("@") || item.startsWith("linkedin.") || item.startsWith("pavel.")) {
        const href = item.includes("@") ? `mailto:${item}` : `https://${item}`;
        return `<a href="${escapeAttribute(href)}">${escapeHtml(item)}</a>`;
      }

      return escapeHtml(item);
    })
    .join(" • ");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
