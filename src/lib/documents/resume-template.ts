export type ResumeTemplateInput = {
  name: string;
  location: string;
  portfolio: string;
  title: string;
  summary: string;
  competencies: string[];
  proofPoints: string[];
  projects: string[];
  education: string[];
  skills: string[];
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
        --ink: #111827;
        --muted: #4b5563;
        --rule: #d1d5db;
        --accent: #164e63;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: #ffffff;
        color: var(--ink);
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11px;
        line-height: 1.45;
      }

      h1, h2, h3, p, ul {
        margin: 0;
      }

      h1 {
        font-size: 24px;
        line-height: 1.1;
        letter-spacing: 0;
      }

      h2 {
        border-top: 1px solid var(--rule);
        color: var(--accent);
        font-size: 12px;
        letter-spacing: 0.05em;
        margin-top: 16px;
        padding-top: 9px;
        text-transform: uppercase;
      }

      h3 {
        font-size: 12px;
        margin-top: 10px;
      }

      .contact {
        color: var(--muted);
        margin-top: 6px;
      }

      .summary {
        margin-top: 12px;
      }

      .grid {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
      }

      .chip {
        border: 1px solid var(--rule);
        border-radius: 4px;
        padding: 3px 6px;
      }

      ul {
        padding-left: 16px;
        margin-top: 7px;
      }

      li + li {
        margin-top: 4px;
      }

      a {
        color: var(--accent);
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(input.name)}</h1>
      <p class="contact">${escapeHtml(input.location)} | <a href="${escapeAttribute(input.portfolio)}">${escapeHtml(input.portfolio)}</a></p>
    </header>

    <section class="summary">
      <h2>Professional Summary</h2>
      <p>${escapeHtml(input.summary)}</p>
    </section>

    <section>
      <h2>Core Competencies</h2>
      <div class="grid">
        ${input.competencies.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}
      </div>
    </section>

    <section>
      <h2>Work Experience</h2>
      <h3>Evidence-backed leadership highlights</h3>
      <ul>
        ${input.proofPoints.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>

    <section>
      <h2>Projects</h2>
      <ul>
        ${input.projects.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>

    <section>
      <h2>Education & Certifications</h2>
      <ul>
        ${input.education.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>

    <section>
      <h2>Skills</h2>
      <ul>
        ${input.skills.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>
  </body>
</html>`;
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
