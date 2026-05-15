export type HelpIconName =
  | "applications"
  | "bot"
  | "briefcase"
  | "file"
  | "globe"
  | "key"
  | "laptop"
  | "lock"
  | "message"
  | "search";

export type HelpStep = {
  title: string;
  body: string;
};

export type HelpSection = {
  id: string;
  title: string;
  intro?: string;
  steps?: HelpStep[];
  bullets?: string[];
  callout?: {
    title: string;
    body: string;
  };
};

export type HelpExternalLink = {
  label: string;
  href: string;
};

export type HelpPage = {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  category: string;
  readTime: string;
  icon: HelpIconName;
  image?: {
    src: string;
    alt: string;
  };
  highlights: string[];
  sections: HelpSection[];
  externalLinks?: HelpExternalLink[];
  related: string[];
};

export const helpPages: HelpPage[] = [
  {
    slug: "getting-started",
    title: "Getting started with Job Search Terminal",
    shortTitle: "Getting started",
    description: "Set up the local app, finish onboarding, and understand the core workflow before your first job scan.",
    category: "Setup",
    readTime: "8 min",
    icon: "laptop",
    image: {
      src: "/images/job-search-terminal/job-search-terminal-dashboard.png",
      alt: "Job Search Terminal dashboard with setup and activity sections",
    },
    highlights: [
      "Everything runs locally on your machine.",
      "The app needs one AI provider key, at least one resume lane, and confirmed search preferences.",
      "The Dashboard becomes your command center after setup is complete.",
    ],
    sections: [
      {
        id: "what-it-is",
        title: "What this app does",
        intro:
          "Job Search Terminal is a local-first job-search workspace. It scans supported career sources, imports manual and browser-board jobs, evaluates fit with AI, generates tailored resumes, prepares application answers, and tracks every application through the funnel.",
        bullets: [
          "No cloud account is required for the app itself.",
          "Your profile, resumes, generated documents, jobs, and application history stay on your computer.",
          "AI providers are contacted only when you ask the app to evaluate, generate, extract, research, transcribe, or polish content.",
          "The app never submits applications, sends recruiter messages, or fills external forms for you.",
        ],
      },
      {
        id: "first-run",
        title: "First-run setup",
        intro:
          "The app is useful only after it understands who you are, what roles you want, and which AI provider should power the assistant features.",
        steps: [
          {
            title: "Add one AI provider key",
            body: "Open Account -> Settings -> AI Providers, choose OpenAI, Anthropic, or Google Gemini, paste the key, save, and test the connection.",
          },
          {
            title: "Upload your base resumes",
            body: "Open Account -> Profile -> Resumes. Upload each PDF into the lane that matches its career angle, such as Leadership, IC, Operations, or Consulting.",
          },
          {
            title: "Extract your profile",
            body: "Open Account -> Profile -> Overview and run Extract with AI after at least one resume has been uploaded. Review the extracted profile before using it.",
          },
          {
            title: "Confirm preferences",
            body: "Review roles, title filters, locations, work modes, industries, constraints, and deal breakers. These choices affect scanning and scoring.",
          },
          {
            title: "Run your first scan",
            body: "Return to the Dashboard and use Scan for new jobs. New jobs appear in Jobs, where they can be filtered, evaluated, skipped, archived, or moved into the application funnel.",
          },
        ],
      },
      {
        id: "daily-loop",
        title: "The daily workflow",
        steps: [
          {
            title: "Scan or import",
            body: "Use the Dashboard scan, manual Add Job, or the browser job board scanner to bring new postings into the pipeline.",
          },
          {
            title: "Review and evaluate",
            body: "Filter the Jobs table, open promising roles, and run AI evaluation to understand fit, gaps, red flags, and recommended next action.",
          },
          {
            title: "Tailor and apply manually",
            body: "Generate a tailored resume and copy-ready application answers. Submit applications yourself on the employer or job-board site.",
          },
          {
            title: "Track follow-up",
            body: "Move jobs through statuses and set follow-up dates so the Dashboard action queue can surface what needs attention.",
          },
        ],
      },
    ],
    related: ["ai-providers", "resume-lanes", "job-search"],
  },
  {
    slug: "ai-providers",
    title: "Add and manage AI providers",
    shortTitle: "AI providers",
    description: "Create an API key, add it to the app, test the connection, and understand what each provider powers.",
    category: "Setup",
    readTime: "10 min",
    icon: "key",
    image: {
      src: "/images/job-search-terminal/job-search-terminal-ai-provider-settings.png",
      alt: "AI provider settings screen with provider cards and connection controls",
    },
    highlights: [
      "You need only one provider to start.",
      "Keys are saved locally with the app data.",
      "Use the built-in connection test before relying on AI features.",
    ],
    sections: [
      {
        id: "provider-choice",
        title: "Choose a provider",
        intro:
          "The app supports OpenAI, Anthropic, and Google Gemini through one provider layer. Pick the service where you already have access, billing, or credits. You can change the active provider later.",
        bullets: [
          "OpenAI is used for evaluation, answers, outreach, research, transcription, and generation.",
          "Anthropic is used for evaluation, answers, outreach, and research.",
          "Google Gemini is used for evaluation, answers, outreach, research, and transcription.",
          "A fallback provider can be configured if you have more than one key.",
        ],
      },
      {
        id: "get-openai-key",
        title: "Create an OpenAI API key",
        steps: [
          {
            title: "Open the OpenAI platform",
            body: "Go to the OpenAI API dashboard and sign in to the account you want billed for API usage.",
          },
          {
            title: "Create a key",
            body: "Create a new API key from the dashboard. Copy it immediately because providers typically show full secret keys only once.",
          },
          {
            title: "Add it to the app",
            body: "In Job Search Terminal, open Account -> Settings -> AI Providers, select OpenAI, paste the key, choose the model, save, and test the connection.",
          },
        ],
      },
      {
        id: "get-anthropic-key",
        title: "Create an Anthropic API key",
        steps: [
          {
            title: "Open Anthropic Console",
            body: "Create or sign into your Anthropic Console account. Anthropic's API access, billing, users, workspaces, and keys are managed through the Console.",
          },
          {
            title: "Generate the key",
            body: "Create a key in Account Settings or the relevant workspace. Keep the key private and copy it before leaving the key screen.",
          },
          {
            title: "Add it to the app",
            body: "Open Account -> Settings -> AI Providers, select Anthropic, paste the key, save, and run the connection test.",
          },
        ],
      },
      {
        id: "get-gemini-key",
        title: "Create a Google Gemini API key",
        steps: [
          {
            title: "Open Google AI Studio",
            body: "Go to Google AI Studio and open the API keys area. Google states that Gemini API keys are created and managed there.",
          },
          {
            title: "Create or choose a project",
            body: "Create a key for the Google Cloud project you want to use. If a project is missing, import or select the correct project first.",
          },
          {
            title: "Add it to the app",
            body: "Open Account -> Settings -> AI Providers, select Google Gemini, paste the key, save, and run the connection test.",
          },
        ],
      },
      {
        id: "key-safety",
        title: "Key safety",
        bullets: [
          "Treat API keys like passwords.",
          "Do not paste keys into public issues, pull requests, screenshots, shared docs, or chat transcripts.",
          "Do not commit keys to git.",
          "Rotate a key immediately if you think it leaked.",
          "Use provider billing alerts or usage limits where available.",
        ],
        callout: {
          title: "Why the app asks for a key",
          body:
            "Job Search Terminal is open source and local-first. It does not operate a hosted AI account for users. Your own provider key lets the local app call the provider directly when you choose to run AI features.",
        },
      },
      {
        id: "discovery-aggregators",
        title: "Discovery and aggregator keys",
        intro:
          "Two optional key groups power ATS source discovery and direct job aggregator scanning. Neither is required for core AI features — they extend how the app finds new sources and jobs.",
        steps: [
          {
            title: "Brave Search API key",
            body: "Enables the Search discover button in Settings → Sources. Brave Search queries ATS board patterns (site:jobs.ashbyhq.com, site:jobs.lever.co, site:boards.greenhouse.io) and merges new company slugs into your discovered sources list. Register at brave.com/search/api for a free tier of 2,000 queries per month.",
          },
          {
            title: "Adzuna App ID and API Key",
            body: "Enables the Scan with Adzuna button in Settings → Sources → Job aggregators. Adzuna pulls matching jobs from its aggregator index using your saved target roles and locations — no browser or logged-in session required. Register at developer.adzuna.com for a free tier of 2,000 queries per month.",
          },
          {
            title: "Add the keys",
            body: "Open Account → Settings → AI Provider, scroll to Discovery & Aggregators, paste your keys, and save. The Search discover button appears in Settings → Sources once the Brave key is present. The Job aggregators card with the Scan with Adzuna button appears once both Adzuna keys are present.",
          },
        ],
      },
    ],
    externalLinks: [
      { label: "OpenAI API quickstart", href: "https://platform.openai.com/docs/quickstart" },
      { label: "Anthropic API overview", href: "https://docs.anthropic.com/en/api/overview" },
      { label: "Anthropic API access help", href: "https://support.anthropic.com/en/articles/8114521-how-can-i-access-the-anthropic-api" },
      { label: "Gemini API keys", href: "https://ai.google.dev/gemini-api/docs/api-key" },
      { label: "Adzuna developer API (free tier)", href: "https://developer.adzuna.com" },
      { label: "Brave Search API (free tier)", href: "https://brave.com/search/api" },
    ],
    related: ["getting-started", "job-search", "troubleshooting"],
  },
  {
    slug: "resume-lanes",
    title: "Upload resumes and build ATS-friendly PDFs",
    shortTitle: "Resume lanes",
    description: "Use multiple resume lanes, upload clean PDFs, and understand what ATS compliance actually means.",
    category: "Profile",
    readTime: "14 min",
    icon: "file",
    image: {
      src: "/images/job-search-terminal/job-search-terminal-profile-setup.png",
      alt: "Profile setup screen with resume and profile extraction sections",
    },
    highlights: [
      "Keep one base resume per career angle.",
      "Use clean, parseable resumes for ATS-heavy applications.",
      "PDF is usually a strong default, but always follow the employer's accepted file types.",
    ],
    sections: [
      {
        id: "lanes",
        title: "What resume lanes are",
        intro:
          "A lane is a source resume for a specific career direction. Do not collapse your job search into one universal resume when you are targeting meaningfully different roles.",
        bullets: [
          "Use a Leadership lane for people-management, strategy, and executive-facing roles.",
          "Use an IC lane for hands-on product, design, engineering, research, or execution-heavy roles.",
          "Use an Operations or Program lane for delivery, systems, process, enablement, and cross-functional work.",
          "Use a Domain lane when a market, industry, or specialty needs different evidence.",
        ],
      },
      {
        id: "upload",
        title: "Upload a resume",
        steps: [
          {
            title: "Open the Resumes tab",
            body: "Go to Account -> Profile -> Resumes. Each lane has its own upload area.",
          },
          {
            title: "Rename the lane",
            body: "Give the lane a name that tells you when to use it. Examples: Product Leadership, Senior IC, Research Ops, Enterprise Design.",
          },
	          {
	            title: "Upload the PDF",
	            body: "Click Upload PDF or Replace PDF for that lane. The app extracts the text so AI evaluation and tailoring can use it.",
	          },
	          {
	            title: "Approve the builder version",
	            body: "Open Review builder for the lane, confirm the detected sections, add or remove sections if needed, then approve the version used for job-specific generation.",
	          },
	          {
	            title: "Run extraction",
	            body: "Go back to Account -> Profile -> Overview and run Extract with AI. Then review the profile tabs before scanning jobs.",
	          },
	        ],
	      },
	      {
	        id: "create-from-scratch",
	        title: "Create a resume from scratch",
	        intro:
	          "Instead of uploading a PDF, you can build a resume directly in the app. Use this approach when you want to start fresh, when you have no existing resume file, or when you want to design a resume specifically for tailoring.",
	        steps: [
	          {
	            title: "Click Create new resume",
	            body: "Open the Resumes page or go to Account -> Profile -> Resumes. Click the Create new resume button. The app generates a blank resume with starter sections.",
	          },
	          {
	            title: "Enter your name and headline",
	            body: "The header section collects your name, job title or headline, and contact information (email, phone, website, LinkedIn).",
	          },
	          {
	            title: "Add your core sections",
	            body: "The builder starts with sections for professional summary, key achievements, experience, and skills. Edit each section title and content. You can reorder, rename, hide, or delete sections as needed.",
	          },
	          {
	            title: "Use AI to improve sections",
	            body: "For any section, click Improve to let AI enhance the wording and impact while keeping your voice and facts intact.",
	          },
	          {
	            title: "Save as draft or approve",
	            body: "Click Save draft to preserve your work without committing to it. Click Approve version when you are satisfied. If you leave without saving, a confirmation dialog will ask whether to save, discard, or continue editing.",
	          },
	          {
	            title: "Refine before tailoring",
	            body: "Return to edit the approved resume using the back-up workflow. The builder is available anytime to refine sections before generating job-specific versions.",
	          },
	        ],
	      },
	      {
	        id: "builder",
	        title: "Resume builder versions",
	        bullets: [
	          "Existing uploaded resumes are converted from stored extracted text; you do not need to upload them again.",
	          "The Resumes page shows each lane in the same dashboard table pattern as Jobs, with direct review and approve actions.",
	          "The builder keeps the sections it detects from your resume and lets you rename, reorder, add, or remove sections.",
	          "The builder uses a split editor and live preview so you can check the rendered resume while editing source sections.",
	          "Custom sections such as Recognition can be kept as part of the approved lane.",
	          "A lane must have an approved builder version before it is used for tailored resume generation.",
	        ],
	      },
      {
        id: "ats-meaning",
        title: "What ATS compliant means",
        intro:
          "An applicant tracking system stores, parses, searches, and routes applications for recruiters. ATS-friendly does not mean tricking software. It means your document is easy for both machines and humans to parse.",
        bullets: [
          "Use standard section headings such as Summary, Experience, Education, Skills, Certifications, and Projects.",
          "Prefer chronological or hybrid structure. Put the most recent experience first.",
          "Use real text, not screenshots or image-only resumes.",
          "Avoid important content inside graphics, icons, tables, text boxes, headers, and footers.",
          "Use a readable font and consistent formatting.",
          "Mirror important language from the job description when it truthfully matches your experience.",
          "Keep contact information in normal body text and also fill in required application fields after upload.",
        ],
      },
      {
        id: "pdf",
        title: "Why PDF matters",
        intro:
          "PDF is often the best delivery format because it preserves layout and is not casually editable. Many ATS products accept PDF, DOC, and DOCX, but the right file type is always the one the employer requests.",
        bullets: [
          "Use PDF when the application accepts it and your PDF contains selectable text.",
          "Use DOCX if the employer asks for Word format.",
          "Do not upload scanned image PDFs. If you cannot select the text, the parser may struggle too.",
          "Name files professionally, for example Firstname-Lastname-Resume-Product-Leadership.pdf.",
          "Keep a plain ATS-friendly version even if you also maintain a more visual networking or portfolio resume.",
        ],
      },
      {
        id: "bullet-quality",
        title: "Write bullets that help scoring and hiring review",
        bullets: [
          "Start with the action you took.",
          "Name the system, product, audience, or business problem.",
          "Include measurable outcomes where you can.",
          "Connect accomplishments to the requirements in the target posting.",
          "Remove vague claims that are not supported by evidence.",
        ],
        callout: {
          title: "Best practice",
          body:
            "Use the base lane as truthful source material. Let the app tailor emphasis and wording for a specific job, then review the generated resume before exporting.",
        },
      },
    ],
    externalLinks: [
      { label: "UMSL ATS resume guide", href: "https://www.umsl.edu/career-services/resources/ats.html" },
      { label: "University of Rochester ATS overview", href: "https://careereducation.rochester.edu/blog/2022/10/03/what-is-an-applicant-tracking-system-your-questions-answered/" },
      { label: "University of Minnesota Duluth ATS tips", href: "https://career.d.umn.edu/students/resume-cover-letter/applicant-tracking-system-ats-tips" },
      { label: "USC resume format guidelines", href: "https://careers.usc.edu/resources/resume-format-guidelines/" },
    ],
    related: ["ai-providers", "evaluate-tailor", "job-search"],
  },
  {
    slug: "job-search",
    title: "Search, import, and review jobs",
    shortTitle: "Job search",
    description: "Use dashboard scans, ATS source management, Adzuna aggregator scanning, manual entry, filters, and saved presets.",
    category: "Jobs",
    readTime: "13 min",
    icon: "search",
    image: {
      src: "/images/job-search-terminal/job-search-terminal-jobs-table.png",
      alt: "Jobs table with fit scores, filters, and application statuses",
    },
    highlights: [
      "Scans use saved role, title, and location preferences.",
      "Adzuna aggregator scanning pulls jobs from its API without a browser — configure in Settings.",
      "Filters and saved presets keep the table usable as the pipeline grows.",
    ],
    sections: [
      {
        id: "dashboard-scan",
        title: "Run a scan",
        steps: [
          {
            title: "Confirm setup",
            body: "Make sure the Dashboard setup checklist is complete. The scan button is hidden until AI, resume, and preferences are ready.",
          },
          {
            title: "Start the scan",
            body: "Click Scan for new jobs from the Dashboard. The app checks enabled sources and applies your title and location constraints before inserting jobs.",
          },
          {
            title: "Read the scan summary",
            body: "The Dashboard reports companies scanned, new jobs, filtered jobs, duplicates, skipped sources, and source errors.",
          },
        ],
      },
      {
        id: "sources",
        title: "Manage job sources",
        bullets: [
          "Open Account → Settings → Sources.",
          "Enable or disable existing company sources.",
          "Add a supported career page (Ashby, Greenhouse, or Lever) when you want the scanner to watch a new company.",
          "Use title include filters for roles you want and exclude filters for titles you never want.",
          "Disable noisy or failing sources instead of deleting useful search criteria.",
          "Click Validate sources to check which career portals are still live — each row shows a live job count, Dead, or Unknown badge.",
          "Use Scan for new sources to discover new Ashby, Greenhouse, and Lever companies via Common Crawl.",
          "Use Search discover (requires Brave Search API key in AI Provider settings) to find new companies from live web search results instead of the crawl archive.",
          "Click Import all valid (N) to add all validated discovered sources in one step — no need to review each one individually.",
        ],
      },
      {
        id: "manual",
        title: "Add a job manually",
        intro:
          "Manual jobs are useful for referrals, recruiter emails, LinkedIn roles, niche job boards, or positions found outside supported ATS sources.",
        steps: [
          {
            title: "Open Jobs",
            body: "Click Jobs in the top navigation.",
          },
          {
            title: "Click Add Job",
            body: "Paste the employer, title, posting URL, location, and full job description. More posting detail produces better AI evaluation.",
          },
          {
            title: "Evaluate normally",
            body: "Manual jobs can be scored, tailored, researched, moved through the application funnel, skipped, archived, and restored just like scanned jobs.",
          },
        ],
      },
      {
        id: "aggregator",
        title: "Scan with Adzuna",
        intro:
          "Adzuna is a job aggregator that indexes listings from many sources. Unlike browser-board scanning, it requires no browser or active session — the app queries its API directly from Settings.",
        steps: [
          {
            title: "Get free credentials",
            body: "Register at developer.adzuna.com for a free App ID and API Key. The free tier covers 2,000 queries per month, which is more than enough for regular scanning.",
          },
          {
            title: "Add the keys",
            body: "Open Account → Settings → AI Provider, scroll to Discovery & Aggregators, and paste your Adzuna App ID and API Key. Save.",
          },
          {
            title: "Scan",
            body: "Go to Account → Settings → Sources. A Job aggregators card appears at the bottom. Click Scan with Adzuna — the scanner runs against your saved target roles and preferred locations and shows the import count inline when done.",
          },
        ],
        callout: {
          title: "What Adzuna covers",
          body: "Adzuna aggregates from many sources and reaches jobs that may not appear in direct ATS portals or browser-board searches. Use it alongside other scan methods for broader coverage. Jobs posted in the last 14 days, up to 50 results per title/location pair.",
        },
      },
      {
        id: "filters",
        title: "Use filters and saved presets",
        bullets: [
          "Use column menus to filter by source, company, recommendation, preference match, score, posted date, and status.",
          "Your last table sort and filter settings are restored the next time you open the app.",
          "Search across company and title when you need one role quickly.",
          "Save up to five filter presets for recurring reviews, such as Priority Remote, LinkedIn New, or Follow Up.",
          "Use Archived when you need to restore skipped or archived roles.",
        ],
      },
    ],
    externalLinks: [
      { label: "Adzuna developer API (free tier)", href: "https://developer.adzuna.com" },
      { label: "Brave Search API (free tier)", href: "https://brave.com/search/api" },
    ],
    related: ["linkedin-scanner", "ai-providers", "evaluate-tailor"],
  },
  {
    slug: "linkedin-scanner",
    title: "Browser job board scanner guide",
    shortTitle: "Job board scanner",
    description: "Set up Claude or Codex Chrome scanning, understand browser-board imports, review duplicates, and avoid unsafe actions.",
    category: "Jobs",
    readTime: "16 min",
    icon: "globe",
    image: {
      src: "/images/job-search-terminal/job-search-terminal-jobs-table.png",
      alt: "Jobs table showing imported job records and filterable source data",
    },
    highlights: [
      "Claude Desktop or Codex browses supported boards in Chrome and writes a local import file.",
      "Job Search Terminal imports the file and marks possible duplicates.",
      "The scanner reads only postings. It must never click Apply or message anyone.",
    ],
    sections: [
      {
        id: "requirements",
        title: "What you need",
        bullets: [
          "Claude Desktop with Claude in Chrome, or Codex with the Codex Chrome Extension.",
          "LinkedIn, Wellfound, Work at a Startup, Glassdoor, Indeed, or Monster open in Chrome if the board requires an active session.",
          "Job Search Terminal running locally or available to the agent.",
          "Target roles, preferred locations, work modes, and title filters saved in Job Search Terminal.",
        ],
      },
      {
        id: "criteria",
        title: "How search criteria are chosen",
        intro:
          "The agent reads the criteria from your saved profile and settings. You do not need to retype them for every scan.",
        bullets: [
          "Target roles determine the job-title searches.",
          "Preferred locations and work modes narrow where Claude searches.",
          "Positive title filters help keep relevant roles.",
          "Negative title filters skip titles you do not want.",
          "Jobs posted in the last seven days are prioritized by the scanner workflow.",
        ],
      },
      {
        id: "run",
        title: "Run a browser-board scan",
        steps: [
          {
            title: "Open Claude or Codex",
            body: "Make sure the agent is using this project folder so it can read the project instructions.",
          },
          {
            title: "Start with a simple prompt",
            body: "Ask the agent to scan LinkedIn, Wellfound, Work at a Startup, Glassdoor, Indeed, or Monster for jobs matching your saved criteria.",
          },
          {
            title: "Confirm before browsing",
            body: "The agent should summarize the saved criteria before it starts browsing a session-dependent board.",
          },
          {
            title: "Let it browse the results",
            body: "The agent opens the requested board in Chrome, searches each target title, applies visible filters, opens job details, and reads visible posting content.",
          },
          {
            title: "Review the import",
            body: "When the scan completes, the Jobs page shows an import notification and the imported jobs appear with a source badge.",
          },
        ],
      },
      {
        id: "scrolling",
        title: "How board scrolling works",
        intro:
          "Job-board results usually load as visible cards or rows. The scanner works through visible results, opens details, then continues scrolling or paging through more results.",
        bullets: [
          "The agent scans visible job cards first.",
          "For each card, the agent opens the detail pane and extracts company, title, location, platform URL, employer/ATS URL when visible, and full description.",
          "After visible cards are processed, Claude scrolls the results list to reveal more jobs.",
          "When a next page is available, Claude moves to the next page and pauses before continuing.",
          "The project instructions cap the scan to avoid aggressive browsing and stop immediately on CAPTCHA, bot detection, or login prompts.",
        ],
        callout: {
          title: "Important",
          body:
            "Job boards may restrict automated browsing or scraping. Users are responsible for complying with each board's terms.",
        },
      },
      {
        id: "duplicates",
        title: "Duplicates and imported jobs",
        bullets: [
          "Browser-board jobs enter the pipeline with status Found and recommendation Needs review.",
          "LinkedIn, Wellfound, Work at a Startup, Glassdoor, Indeed, and Monster badges identify imported jobs in the Jobs table.",
          "A Duplicate badge appears when the original posting key, URL, or company plus title and location matches an existing record.",
          "Duplicate jobs are not silently dropped; they stay visible so you can review them.",
          "Filtering by Source is the fastest way to review a fresh import.",
        ],
      },
      {
        id: "troubleshooting",
        title: "Browser-board scanner troubleshooting",
        bullets: [
          "If the scan does not start, check that target roles and preferences are saved.",
          "If no notification appears, open Jobs and refresh. The import may already be present.",
          "If a board shows CAPTCHA or bot detection, stop and wait before trying again.",
          "If every job is marked duplicate, you probably scanned the same roles recently.",
          "If imported roles are noisy, tighten title filters and reduce the target-role list.",
        ],
      },
    ],
    externalLinks: [
      { label: "LinkedIn search for jobs", href: "https://www.linkedin.com/help/linkedin/answer/a511260/search-for-jobs-on-linkedin?lang=en-US" },
      { label: "LinkedIn filter and sort job results", href: "https://www.linkedin.com/help/linkedin/answer/a507441/filter-and-sort-job-search-results?lang=en-us" },
      { label: "LinkedIn job alerts", href: "https://www.linkedin.com/help/linkedin/answer/a511279" },
      { label: "LinkedIn prohibited software and extensions", href: "https://www.linkedin.com/help/linkedin/answer/a1341387" },
    ],
    related: ["job-search", "evaluate-tailor", "privacy-data"],
  },
  {
    slug: "evaluate-tailor",
    title: "Evaluate jobs, tailor resumes, and draft answers",
    shortTitle: "Evaluate and tailor",
    description: "Use fit scoring, gap analysis, tailored resume generation, PDF export, and answer drafting.",
    category: "Apply",
    readTime: "13 min",
    icon: "bot",
    image: {
      src: "/images/job-search-terminal/job-search-terminal-resume-tailoring.png",
      alt: "Tailored resume generation screen with keyword coverage and document actions",
    },
    highlights: [
      "Evaluation explains fit, concerns, gaps, red flags, and recommendation.",
      "Tailoring starts from the best matching resume lane.",
      "Gap answers need concrete evidence before they influence a resume.",
      "Generated answers are for copy-paste; the app never submits them.",
    ],
    sections: [
      {
        id: "evaluate",
        title: "Run evaluation",
        steps: [
          {
            title: "Open a job",
            body: "Click a role from Jobs to open the job detail page.",
          },
          {
            title: "Review the overview",
            body: "Check company, title, location, source, posting freshness, current score, recommendation, salary notes, requirements, gaps, and red flags.",
          },
          {
            title: "Run AI analysis",
            body: "Open the Analysis tab and run evaluation. The app streams the reasoning so you can see how the recommendation is produced.",
          },
          {
            title: "Correct the AI if needed",
            body: "Override the score or recommendation when your judgment, private context, or networking information is better than the model's read.",
          },
          {
            title: "Address gaps with evidence",
            body: "When you save a gap answer, the app checks whether it includes where the experience happened, what you did, and what proof point supports it. Vague answers are saved as drafts and prompt a follow-up question.",
          },
        ],
      },
      {
        id: "tailor",
        title: "Generate a tailored resume",
        steps: [
	          {
	            title: "Open the Resume tab",
	            body: "The app recommends the best approved resume lane for the selected job.",
	          },
          {
            title: "Choose section handling",
            body: "For each approved section, choose whether to keep it unchanged, let AI update it, or hide it from this generated resume.",
          },
          {
            title: "Use confirmed context only",
            body: "Tailoring uses approved resume content plus gap answers and profile supplements that have enough concrete detail. Draft gap answers marked Needs detail are not used until completed.",
          },
          {
            title: "Review keyword coverage",
            body: "Coverage is a guide, not a guarantee. Use it to see whether important job-language is represented truthfully.",
          },
          {
            title: "Edit the draft",
            body: "Open the resume editor to refine summary, bullets, skills, and emphasis before exporting.",
          },
          {
            title: "Export PDF",
            body: "Download the final PDF after review. Use the employer's requested format if the application instructions specify something else.",
          },
        ],
      },
      {
        id: "answers",
        title: "Draft application answers",
        intro:
          "The Apply tab helps answer common application questions in your voice and using the job context. It is designed for manual copy-paste.",
        bullets: [
          "Paste the actual question from the application form.",
          "Review every generated answer before using it.",
          "Keep answers truthful and consistent with your resume.",
          "Do not let the app or an assistant submit the application for you.",
        ],
      },
      {
        id: "research-outreach",
        title: "Research and outreach",
        bullets: [
          "Use Research to generate company intelligence and positioning ideas.",
          "Use Outreach to draft a recruiter or hiring-manager message.",
          "Copy messages manually only after review.",
          "Keep outreach concise, specific, and relevant to the role.",
        ],
      },
    ],
    related: ["resume-lanes", "applications", "interview-prep"],
  },
  {
    slug: "applications",
    title: "Track applications and follow-ups",
    shortTitle: "Applications",
    description: "Use statuses, the table, the kanban board, follow-up dates, and archive behavior.",
    category: "Track",
    readTime: "9 min",
    icon: "applications",
    image: {
      src: "/images/job-search-terminal/job-search-terminal-applications-kanban.png",
      alt: "Applications kanban board showing jobs by status",
    },
    highlights: [
      "Statuses turn a list of jobs into an application funnel.",
      "Follow-up dates drive the action queue.",
      "Archive is reversible; delete is final.",
    ],
    sections: [
      {
        id: "statuses",
        title: "Use statuses consistently",
        bullets: [
          "Found means the job exists but has not been reviewed.",
          "Reviewed means you looked at it and kept it active.",
          "Applied means you submitted the application yourself.",
          "Follow-up means a future reminder is needed.",
          "Interviewing means the company is actively engaged.",
          "Rejected, skipped, archived, and withdrawn keep the active list clean.",
        ],
      },
      {
        id: "applications-page",
        title: "Use the Applications page",
        bullets: [
          "Table view is best for sorting, filtering, and bulk review.",
          "Kanban view is best for understanding funnel shape.",
          "Overdue indicators show when follow-up dates have passed.",
          "Saved filters help you reuse recurring views.",
        ],
      },
      {
        id: "dashboard-queue",
        title: "Keep the Dashboard useful",
        intro:
          "The Dashboard action queue depends on accurate statuses and follow-up dates. If a job needs attention, update its status instead of leaving it as Found.",
      },
      {
        id: "archive-delete",
        title: "Archive vs delete",
        bullets: [
          "Archive or skip when the role should leave the active pipeline but may need to be referenced later.",
          "Restore from Archived if the opportunity becomes relevant again.",
          "Delete only when you are sure you do not need the job, notes, generated documents, or activity history.",
        ],
      },
    ],
    related: ["job-search", "evaluate-tailor", "privacy-data"],
  },
  {
    slug: "interview-prep",
    title: "Prepare for interviews",
    shortTitle: "Interview prep",
    description: "Build a STAR story bank, practice voice answers, and connect evidence to target roles.",
    category: "Prep",
    readTime: "8 min",
    icon: "message",
    image: {
      src: "/images/job-search-terminal/job-search-terminal-interview-prep.png",
      alt: "Interview preparation screen with story bank and voice practice tools",
    },
    highlights: [
      "Stories should be specific, evidence-backed, and reusable.",
      "Voice practice turns spoken answers into structured STAR stories.",
      "Tagging stories helps you retrieve the right example quickly.",
    ],
    sections: [
      {
        id: "star",
        title: "Build STAR stories",
        bullets: [
          "Situation: what was happening and why it mattered.",
          "Task: what you owned or were expected to change.",
          "Action: what you personally did.",
          "Result: what changed, ideally with a measurable outcome.",
          "Reflection: what you learned and how you would apply it again.",
        ],
      },
      {
        id: "voice",
        title: "Practice by voice",
        steps: [
          {
            title: "Record an answer",
            body: "Use the browser microphone to answer a prompt out loud.",
          },
          {
            title: "Transcribe and parse",
            body: "The app transcribes the answer and turns it into STAR structure.",
          },
          {
            title: "Save and tag",
            body: "Review the story, edit it, and tag it with skills, themes, or target jobs.",
          },
        ],
      },
      {
        id: "use-in-interviews",
        title: "Use stories during interviews",
        bullets: [
          "Prepare examples for leadership, conflict, ambiguity, execution, learning, and impact.",
          "Keep stories concise enough to deliver in two to three minutes.",
          "Choose the story that best matches the interviewer's question, not just the one you like most.",
          "Connect the result back to the role you are interviewing for.",
        ],
      },
    ],
    related: ["evaluate-tailor", "applications", "resume-lanes"],
  },
  {
    slug: "privacy-data",
    title: "Privacy, local data, and safety rules",
    shortTitle: "Privacy and data",
    description: "Understand what stays local, what can leave the machine, backups, exports, and safety boundaries.",
    category: "Reference",
    readTime: "10 min",
    icon: "lock",
    highlights: [
      "The app is local-first and has no hosted account system.",
      "AI requests go to the provider you configure.",
      "Submitting applications and sending messages always stays manual.",
    ],
    sections: [
      {
        id: "local-first",
        title: "What stays local",
        bullets: [
          "Profile data and preferences.",
          "Uploaded resume text and lane metadata.",
          "Discovered, imported, manual, archived, and tracked jobs.",
          "Generated resumes and application answers.",
          "Application statuses, follow-up dates, and activity logs.",
        ],
      },
      {
        id: "what-leaves",
        title: "What can leave the machine",
        intro:
          "When you run an AI feature, the relevant prompt context is sent to the active provider. That can include job descriptions, resume-derived profile facts, questions, or writing samples needed for the requested task.",
        bullets: [
          "Choose a provider whose terms and data practices you accept.",
          "Do not run AI features on materials you do not want sent to that provider.",
          "Rotate provider keys if they may have been exposed.",
        ],
      },
      {
        id: "safety",
        title: "Safety boundaries",
        bullets: [
          "The app does not submit applications for you.",
          "The app does not send emails or LinkedIn messages for you.",
          "The app does not click Apply during browser-board scanning.",
          "The app preserves resumes, reports, outputs, and tracked data unless you explicitly delete them.",
        ],
      },
      {
        id: "backup",
        title: "Backups and exports",
        bullets: [
          "Use the app's data backup workflow before large cleanup or migration work.",
          "Use export when you need a readable snapshot outside the database.",
          "Keep backups private because they may contain resume and application data.",
        ],
      },
    ],
    related: ["ai-providers", "linkedin-scanner", "troubleshooting"],
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    shortTitle: "Troubleshooting",
    description: "Fix common setup, AI, resume, PDF, scanner, LinkedIn, and data issues.",
    category: "Reference",
    readTime: "12 min",
    icon: "briefcase",
    highlights: [
      "Most issues are setup, provider, source, or browser-state issues.",
      "Use the connection test before debugging AI features.",
      "For scanner noise, adjust preferences and title filters first.",
    ],
    sections: [
      {
        id: "app-start",
        title: "The app will not start",
        bullets: [
          "Make sure dependencies have been installed.",
          "If one port is busy, the development server may choose another local port.",
          "Restart the server if pages show stale or inconsistent data.",
        ],
      },
      {
        id: "ai",
        title: "AI features fail",
        bullets: [
          "Open Account -> Settings -> AI Providers.",
          "Confirm the active provider has a saved key.",
          "Run the provider connection test.",
          "Check provider billing, usage limits, model availability, and key permissions.",
          "Try a fallback provider if one is configured.",
        ],
      },
      {
        id: "resume-pdf",
        title: "Resume upload or PDF export fails",
        bullets: [
          "Upload a text-based PDF, not a scanned image.",
          "Try a simpler ATS-friendly resume if extraction is poor.",
          "Make sure Chrome or a compatible Chromium browser is installed for PDF generation.",
          "If an employer requires DOCX instead of PDF, export or convert outside the app according to the employer instructions.",
        ],
      },
      {
        id: "scan-quality",
        title: "Scans return the wrong jobs",
        bullets: [
          "Review target roles in Account -> Profile.",
          "Tighten positive and negative title filters.",
          "Review location modes and preferred locations.",
          "Disable noisy sources.",
          "Evaluate a few examples before changing too many settings at once.",
        ],
      },
      {
        id: "linkedin",
        title: "Browser-board scanner issues",
        bullets: [
          "If criteria are empty, save target roles and preferences first.",
          "If CAPTCHA or bot detection appears, stop scanning and reduce scope later.",
          "If no import notification appears, open Jobs and check whether imported jobs are already present.",
          "If all jobs are duplicates, the scan likely overlaps a previous scan.",
        ],
      },
    ],
    related: ["getting-started", "ai-providers", "linkedin-scanner"],
  },
];

export const helpPagesBySlug = new Map(helpPages.map((page) => [page.slug, page]));

export const helpCategories = Array.from(new Set(helpPages.map((page) => page.category)));

export function getRelatedPages(page: HelpPage) {
  return page.related.map((slug) => helpPagesBySlug.get(slug)).filter((item): item is HelpPage => Boolean(item));
}
