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
    description: "Set the app up, teach it what work you want, and learn the routine you will repeat each day.",
    category: "Setup",
    readTime: "10 min",
    icon: "laptop",
    image: {
      src: "/images/job-search-terminal/job-search-terminal-dashboard.png",
      alt: "Job Search Terminal dashboard with setup and activity sections",
    },
    highlights: [
      "The app runs on your own computer. Your resumes and job list stay there.",
      "You need to connect one AI service before the app can score jobs or write resumes. Some cost money to use; Ollama is free.",
      "Once set up, the daily routine is: scan for jobs, review them, tailor a resume, apply yourself.",
    ],
    sections: [
      {
        id: "what-it-is",
        title: "What this app does",
        intro:
          "Job Search Terminal is a job-search workspace that runs on your own computer. It finds job postings, scores how well each one fits you, writes a tailored resume for the ones worth applying to, and keeps track of where every application stands.",
        bullets: [
          "You do not create an account, and there is nothing to subscribe to.",
          "Your profile, resumes, job list, and application history are saved on your computer, not on someone else's.",
          "The app contacts an AI service only when you ask it to do something — score a job, write a resume, draft an answer. It is not listening in the background.",
          "The app never applies for you. It never sends a message to a recruiter and never fills in a form on a company's website. You do that part yourself, deliberately.",
        ],
      },
      {
        id: "words",
        title: "A few words you will see",
        intro:
          "This app borrows some words from the hiring industry. You do not need to know them to use it, but they turn up on screen, so here is what they mean.",
        bullets: [
          "AI service (or provider) — the company whose artificial intelligence does the thinking: OpenAI, Anthropic, Google Gemini, or Ollama. You pick one. The app has no AI of its own.",
          "API key — a long password you get from an AI service so the app can use your account there. You copy it once and paste it into Settings. Treat it like a credit card number.",
          "ATS, or applicant tracking system — the software companies use to collect and sort applications. Greenhouse, Lever, and Ashby are common ones. When the app says it is scanning ATS sources, it means it is reading company job pages directly, the same ones you would open in a browser.",
          "Job aggregator — a site that gathers postings from many places into one list. Adzuna is one the app can read from.",
          "Scan — one round of looking for new jobs. You start it; it does not run on its own.",
          "Lane — one version of your resume, kept for one kind of role. Most people need two or three.",
        ],
      },
      {
        id: "first-run",
        title: "Setting up the first time",
        intro:
          "The app cannot help until it knows who you are and what work you are looking for. This takes about fifteen minutes and you only do it once.",
        steps: [
          {
            title: "Connect one AI service",
            body: "Open Account → Settings → AI Provider. Pick one service and follow it through. OpenAI, Anthropic, and Google Gemini each need an API key, which you get from their website — this usually costs a few dollars a month in usage. Ollama is free and runs on your own computer instead, but it takes more setting up and needs a reasonably powerful machine. Save, then press the test button to check it works. The AI providers guide walks through each one.",
          },
          {
            title: "Upload your resumes",
            body: "Open Account → Profile → Resumes. Upload a PDF for each kind of role you are going after — for example one for leadership roles and one for hands-on roles. Each of these is called a lane. One is enough to start.",
          },
          {
            title: "Let the app read your resume",
            body: "Open Account → Profile → Overview and press Extract with AI. The app reads your uploaded resume and fills in your skills, job titles, and history. Read what it came up with before you move on — it gets things wrong sometimes, and everything is editable.",
          },
          {
            title: "Say what you are looking for",
            body: "Still in Profile, go through the job titles you want, the words that should rule a job out, where you are willing to work, whether you want remote or on-site, and anything you will not accept. These answers decide which jobs the app finds and how it scores them, so it is worth being honest rather than broad.",
          },
          {
            title: "Run your first scan",
            body: "Go back to the Dashboard and press Scan for new jobs. The app checks around fifty company job pages, plus Dice, plus Adzuna if you set it up. A progress window shows what it is working through. When it finishes, the new jobs are waiting under Jobs.",
          },
        ],
        callout: {
          title: "The first scan can look disappointing",
          body: "A first scan often returns few jobs, or none. That usually means your job titles are too narrow or your locations too specific, not that the app is broken. Widen them in Profile and scan again.",
        },
      },
      {
        id: "optional-keys",
        title: "Optional: find more jobs",
        intro:
          "Two more services widen the search. Both have a free tier, and the app works without either. Skip this section until you want more jobs than the built-in sources give you.",
        steps: [
          {
            title: "Adzuna — more job listings",
            body: "Adzuna gathers postings from across the web. Sign up at developer.adzuna.com for a free App ID and API Key, worth 2,000 searches a month. Paste both into Account → Settings → AI Provider → Discovery & Aggregators. From then on every scan includes Adzuna automatically — there is nothing else to press.",
          },
          {
            title: "Brave Search — find more companies to watch",
            body: "This one does not find jobs. It finds new companies whose job pages the app can then watch. Sign up at brave.com/search/api for a free key, worth 2,000 searches a month, and paste it into the same Discovery & Aggregators section. A Search for companies button then appears in Settings → Scan sources.",
          },
        ],
        callout: {
          title: "You already have around fifty companies",
          body: "The app comes with roughly fifty companies set up and ready to scan. Settings → Scan sources has two buttons that look for more — Crawl for companies and Search for companies. Neither turns anything on by itself: they add candidates to a list, and you decide which ones to keep.",
        },
      },
      {
        id: "daily-loop",
        title: "What you do each day",
        intro:
          "Once you are set up, the same four steps repeat. Fifteen to thirty minutes is a normal session.",
        steps: [
          {
            title: "Find new jobs",
            body: "Press Scan for new jobs on the Dashboard. You can also add a job by hand with Add Job when you find one somewhere else, or use the browser scanner to pull jobs from LinkedIn and similar sites.",
          },
          {
            title: "Review what came in",
            body: "Open Jobs and narrow the list with the filters. Open anything promising and press Evaluate. The app scores the fit, names the gaps between you and the role, flags anything that looks off about the posting, and suggests what to do next.",
          },
          {
            title: "Tailor a resume and apply",
            body: "For jobs worth pursuing, generate a resume written for that posting and draft answers to their application questions. Then go to the company's own site and apply yourself. The app does not submit anything.",
          },
          {
            title: "Keep track",
            body: "Update each job's status as things move, and set a follow-up date when you are waiting on someone. The Dashboard then tells you what needs attention today so you are not keeping it in your head.",
          },
        ],
      },
    ],
    related: ["ai-providers", "job-search", "privacy-data"],
  },
  {
    slug: "ai-providers",
    title: "Add and manage AI providers",
    shortTitle: "AI providers",
    description: "Connect the AI service that scores your jobs and writes your resumes. Covers what each one costs, how to get a key, and how to set up a free local option.",
    category: "Setup",
    readTime: "12 min",
    icon: "key",
    image: {
      src: "/images/job-search-terminal/job-search-terminal-ai-provider-settings.png",
      alt: "AI provider settings screen with provider cards and connection controls",
    },
    highlights: [
      "One service is enough. You can add more later as backups.",
      "OpenAI, Anthropic, and Google Gemini charge for what you use. Ollama is free but runs on your own computer.",
      "Always press Test connection after saving. It is the only way to know it actually works.",
    ],
    sections: [
      {
        id: "provider-choice",
        title: "Choosing a service",
        intro:
          "The app has no artificial intelligence of its own. It borrows someone else's, and you decide whose. There are four to choose from, and one is enough. If you set up more than one, you put them in order and the app works down the list: the top one does the work, and if it is down or refuses, the next one takes over without asking you.",
        bullets: [
          "OpenAI — does everything the app can do, including turning your spoken interview practice into text. A common first choice.",
          "Anthropic — scores jobs, drafts answers, writes outreach messages, and researches companies.",
          "Google Gemini — the same, and it can also handle spoken practice.",
          "Ollama — free, and runs on your own computer, so nothing you feed it ever leaves the machine. It cannot do spoken practice, and it needs a reasonably powerful computer.",
          "The three paid services bill you for what you use. Scoring a single job costs a fraction of a cent; a heavy day might reach a few dollars. Set a spending limit on their website if that worries you.",
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
            body: "In Job Search Terminal, open Account → Settings → AI Provider, select OpenAI, paste the key, choose the model, save, and test the connection.",
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
            body: "Open Account → Settings → AI Provider, select Anthropic, paste the key, save, and run the connection test.",
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
            body: "Open Account → Settings → AI Provider, select Google Gemini, paste the key, save, and run the connection test.",
          },
        ],
      },
      {
        id: "setup-ollama",
        title: "Set up Ollama (free local AI, no API key)",
        intro:
          "Ollama is a free program that runs artificial intelligence on your own computer instead of someone else's. Nothing you give it leaves your machine, and it costs nothing to run. The trade-off is that it needs a fairly powerful computer, the answers are usually a little weaker than the paid services, and there are a few more steps to get going. Those steps involve typing commands into a terminal — the plain text window described in the setup guide. You only do it once.",
        steps: [
          {
            title: "Install Ollama",
            body: "Download and install Ollama from ollama.com. The installer registers the ollama command in your terminal and, on macOS and Windows, adds a menu-bar app that keeps the server running. Supported on macOS, Linux, and Windows.",
          },
          {
            title: "Pull a model",
            body: "A model is the actual artificial intelligence — Ollama is only the program that runs it, so you have to download one. Open a terminal and type: ollama pull llama3.1:8b — then wait, because it is a few gigabytes. That one suits most people and needs about 6 GB of memory free. Bigger models answer better but need more: qwen2.5:14b wants about 10 GB, llama3.1:70b about 48 GB. There are more to browse at ollama.com/library.",
          },
          {
            title: "Start the server",
            body: "Ollama has to be awake for the app to reach it. Either open the Ollama app from your applications, or type ollama serve in a terminal. Leave it running the whole time you are using Job Search Terminal. If you close the terminal or quit the Ollama app, it stops, and Job Search Terminal will report that it cannot reach it.",
          },
          {
            title: "Enable Ollama in settings",
            body: "Open Account → Settings → AI Provider and tick the box next to Ollama. A settings panel opens underneath.",
          },
          {
            title: "Confirm the base URL",
            body: "The base URL is the address the app uses to reach Ollama. It is already filled in as http://localhost:11434, which means \"this computer\". Leave it exactly as it is unless you deliberately set Ollama up on a different machine.",
          },
          {
            title: "Choose a model",
            body: "Press Choose… and the app asks Ollama which models you have downloaded. Pick the one from step 2. An empty list means either Ollama is not running or the download did not finish — go back and check both.",
          },
          {
            title: "Set priority and save",
            body: "Drag Ollama to the top of the list so it does the work by default. Anything below it is a backup for when Ollama is not running. Press Save, then Test connection — this is the step that tells you whether it genuinely works, so do not skip it.",
          },
        ],
        callout: {
          title: "Choose the right model size for your machine",
          body: "A model too big for your computer\'s memory will crawl or fail outright, so match it to your machine. Roughly: 7B–8B models want 6–8 GB free and are fine for most work; 14B models want 10–12 GB and give tidier answers; 70B models want 40–48 GB and come close to the paid services. Settings → AI Provider lists suggested models for each memory size.",
        },
      },
      {
        id: "key-safety",
        title: "Keeping your key safe",
        intro:
          "An API key is charged to your card. Anyone who gets hold of one can spend your money, so it deserves the same care as a password.",
        bullets: [
          "Never paste a key into a screenshot, a shared document, a chat, or anywhere public.",
          "If you think a key has been seen by anyone else, delete it on the service\'s website and make a new one. This is quick and free.",
          "Set a monthly spending limit on the service\'s website. Every one of them offers this, and it is the safest way to cap a surprise.",
          "The app stores your key on your own computer, alongside its other data. It is not sent anywhere except to the service it belongs to.",
        ],
        callout: {
          title: "Why the app asks for a key",
          body:
            "Job Search Terminal is free and runs on your computer. There is no company behind it paying an AI bill on your behalf, and no subscription to collect one from you. So when the app needs artificial intelligence, it uses your account at the service you chose — which is why it needs your key.",
        },
      },
      {
        id: "discovery-aggregators",
        title: "Discovery and aggregator keys",
        intro:
          "These two are optional and have nothing to do with the AI features. They widen where the app looks for work. Skip them until the built-in sources stop being enough.",
        steps: [
          {
            title: "Brave Search API key",
            body: "This one finds companies, not jobs. It searches the web for company job pages the app knows how to read, and adds what it finds to a list for you to review — it never switches a company on by itself. Sign up at brave.com/search/api for a free key worth 2,000 searches a month. A Search for companies button then appears in Settings → Scan sources.",
          },
          {
            title: "Adzuna App ID and API Key",
            body: "Adzuna gathers job postings from across the web. Once its keys are in, the app searches it using the job titles and locations from your profile — no browser, no login, nothing to click. Sign up at developer.adzuna.com for a free App ID and API Key worth 2,000 searches a month.",
          },
          {
            title: "Add the keys",
            body: "Open Account → Settings → AI Provider, scroll to Discovery & Aggregators, paste your keys, and save. The Search for companies button appears in Settings → Scan sources once the Brave key is present. The Job aggregators card with the Scan with Adzuna button appears once both Adzuna keys are present.",
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
      { label: "Ollama — download and model library", href: "https://ollama.com" },
    ],
    related: ["getting-started", "job-search", "troubleshooting"],
  },
  {
    slug: "resume-lanes",
    title: "Your resumes: uploading, building, and getting them read",
    shortTitle: "Resume lanes",
    description: "Keep a separate resume for each kind of role you want, and write them so the software companies use to sort applications can actually read them.",
    category: "Profile",
    readTime: "14 min",
    icon: "file",
    image: {
      src: "/images/job-search-terminal/job-search-terminal-profile-setup.png",
      alt: "Profile setup screen with resume and profile extraction sections",
    },
    highlights: [
      "Keep one resume for each kind of role you are going after, not one resume for everything.",
      "Plain layouts get read correctly. Columns, graphics, and text boxes often do not.",
      "PDF is usually the safest file type — but always send whatever the employer asks for.",
    ],
    sections: [
      {
        id: "lanes",
        title: "What a lane is",
        intro:
          "A lane is one of your resumes, kept for one kind of role. If you are applying for two genuinely different sorts of job — say, managing a team and doing the work yourself — one resume cannot make a strong case for both. So you keep two, and the app tailors whichever one fits the job in front of it. Two or three lanes is normal. Start with one.",
        bullets: [
          "A leadership lane, for roles where you manage people, set direction, or answer to executives.",
          "A hands-on lane, for roles where you do the work yourself — designing, building, researching, shipping.",
          "An operations or programme lane, for roles about delivery, process, and joining up work across teams.",
          "An industry lane, when a particular field expects experience you would otherwise bury.",
        ],
      },
      {
        id: "upload",
        title: "Upload a resume",
        steps: [
          {
            title: "Open the Resumes tab",
            body: "Go to Account → Profile → Resumes. Each lane has its own upload area.",
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
	            body: "Go back to Account → Profile → Overview and run Extract with AI. Then review the profile tabs before scanning jobs.",
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
	            body: "Open the Resumes page or go to Account → Profile → Resumes. Click the Create new resume button. The app generates a blank resume with starter sections.",
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
        title: "Why a plain resume gets further",
        intro:
          "Most companies collect applications through software — an applicant tracking system, usually shortened to ATS. Greenhouse, Lever, and Workday are common ones. When you upload a resume, that software tries to read it and pull out your job titles, dates, and skills. If it cannot read your layout, it fills in blanks or garbles them, and a recruiter searching for your skill may never see you. None of this is about tricking the software. It is about not confusing it.",
        bullets: [
          "Use the headings people expect: Summary, Experience, Education, Skills, Certifications, Projects.",
          "Put your most recent job first and work backwards.",
          "Make sure your resume is real text. If you cannot select a line with your cursor, neither can the software.",
          "Keep anything that matters out of graphics, icons, tables, text boxes, and page headers and footers. These are where content most often gets lost.",
          "Use one ordinary font and keep the formatting consistent.",
          "Where a job posting uses a particular word for something you have genuinely done, use their word. Never claim something you have not done to match a posting.",
          "Keep your phone and email as ordinary text, and fill in the application form fields too — do not rely on the upload alone.",
        ],
      },
      {
        id: "pdf",
        title: "Which file type to send",
        intro:
          "PDF is usually safest: it looks the same on every computer and nobody can edit it by accident. But the right file type is always the one the employer asked for. If the form says Word, send Word.",
        bullets: [
          "Send a PDF when the form accepts one — and check you can select the text in it with your cursor first.",
          "Send a Word file (.docx) when the employer asks for Word.",
          "Never send a scanned or photographed resume. To software it is a picture, and a picture contains no words it can read.",
          "Name the file so a stranger knows what it is: Jane-Smith-Resume-Product-Leadership.pdf.",
          "If you also keep a designed, visual resume for networking, keep a plain version alongside it for applications.",
        ],
      },
      {
        id: "bullet-quality",
        title: "Writing bullet points that land",
        intro:
          "This matters twice over: a recruiter reads these in about six seconds, and the app scores against them too. Vague bullets score badly and read badly.",
        bullets: [
          "Start with what you did. \"Rebuilt the checkout flow\", not \"Was responsible for checkout\".",
          "Say what it was — the product, the team, the customers, the problem. A stranger should picture it.",
          "Give a number wherever you honestly can: how much, how many, how much faster.",
          "Tie your strongest bullets to what the job posting actually asks for.",
          "Cut anything you could not back up in an interview. Those bullets cost you more than they earn.",
        ],
        callout: {
          title: "Keep your uploaded resume honest",
          body:
            "Your uploaded resume is the source of truth, so everything in it should be true and yours. The app rewrites emphasis and wording for a specific job from that material — it should never be inventing anything. Read every generated resume before you send it, and check that you recognise every claim.",
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
    description: "How the app finds jobs, how to add ones it missed, and how to keep the list manageable once it fills up.",
    category: "Jobs",
    readTime: "13 min",
    icon: "search",
    image: {
      src: "/images/job-search-terminal/job-search-terminal-jobs-table.png",
      alt: "Jobs table with fit scores, filters, and application statuses",
    },
    highlights: [
      "A scan searches using the job titles and locations you set in your profile. If it finds nothing, that is usually the place to look first.",
      "Nothing runs on its own unless you switch on automatic scans. You press the button.",
      "Once you have a few hundred jobs, save a filter you use often so you are not rebuilding it daily.",
    ],
    sections: [
      {
        id: "dashboard-scan",
        title: "Run a scan",
        steps: [
          {
            title: "Confirm setup",
            body: "The Dashboard shows a checklist of what is still missing. The scan button does not appear until you have connected an AI service, uploaded a resume, and said what you are looking for — a scan without those would have nothing to search for and nothing to score against.",
          },
          {
            title: "Start the scan",
            body: "Press Scan for new jobs on the Dashboard. The app works through the company job pages you have switched on, plus Dice, plus Adzuna if you set it up. A window shows each source moving from waiting to scanning to complete, so you can see what is slow and what failed.",
          },
          {
            title: "Read the scan summary",
            body: "When it finishes, the Dashboard tells you how many companies it checked, how many new jobs it found, how many it filtered out for not matching your titles, how many it had already seen, and which sources it could not reach. A source that fails is worth noticing — a company that has moved its job page will keep failing until you fix or remove it.",
          },
          {
            title: "Review Fresh matches",
            body: "Fresh matches sits at the top of the Dashboard and holds only what this and recent scans turned up, within the time window you chose. Jobs you added by hand stay out of it, as does anything you have already applied to or turned down — it is meant to be the new post, not the whole pile.",
          },
          {
            title: "Choose the freshness window and schedule",
            body: "Old postings are usually filled. Open Account → Settings → Sources and use the Fresh posting window card to say how far back to accept: 24 hours, 72 hours (the default), or 7 days. Every source obeys it. If you would rather the app scan by itself every six hours, switch that on under Account → Settings → Data & Backup.",
          },
        ],
      },
      {
        id: "sources",
        title: "Choosing which companies to watch",
        intro:
          "A source is one company\'s job page that the app checks on every scan. You start with around fifty and can add, remove, or switch off any of them. Three Settings tabs cover this, split up because the company list is long enough to bury anything sharing a page with it.",
        bullets: [
          "Settings → Sources holds the fresh posting window, adding a company by hand, and job aggregators. Settings → Scan sources holds the company list itself and the two buttons that look for more. Settings → Cleanup is where you clear out ones that no longer work.",
          "Open Account → Settings → Scan sources to enable or disable existing company sources.",
          "Set the Fresh posting window (24 hours, 72 hours by default, or 7 days) under Settings → Sources to control how old a posting can be before scans skip it as stale.",
          "Add a supported career page (Ashby, Greenhouse, or Lever) under Settings → Sources when you want the scanner to watch a new company.",
          "Use title include filters for roles you want and exclude filters for titles you never want.",
          "When a company floods you with irrelevant roles, switch it off rather than deleting it. Switching off is reversible; deleting loses the setup.",
          "Press Validate sources to check which company pages still work. Each row then shows how many jobs it found, or Dead if the page has gone, or Unknown if it could not tell.",
          "Crawl for companies searches a large public archive of the web for company job pages the app can read.",
          "Search for companies does the same against live web search instead, so it catches newer companies. It needs a Brave Search key, added under Settings → AI Provider.",
          "Both buttons only ever produce a list of suggestions. You choose which ones to keep — neither switches a company on by itself.",
          "The Dashboard's Last source check shows when either company search last finished. Validate sources is separate: it refreshes the Live column for the full company list.",
          "Settings → Cleanup lists companies you added that are now switched off or whose address no longer works. Remove them one at a time, or press Remove all and confirm. The app never removes a source on its own.",
        ],
      },
      {
        id: "manual",
        title: "Add a job manually",
        intro:
          "Plenty of good jobs never turn up in a scan — a friend forwards one, a recruiter emails, or it sits on a job board the app cannot read. Add those by hand and they behave exactly like scanned jobs from then on.",
        steps: [
          {
            title: "Open Jobs",
            body: "Click Jobs in the top navigation.",
          },
          {
            title: "Click Add Job",
            body: "Fill in the company, the job title, the link to the posting, the location, and the full job description. Paste the whole description, not a summary — the app scores you against the words in it, so a thin description produces a thin score.",
          },
          {
            title: "Evaluate normally",
            body: "From here it is an ordinary job. You can score it, generate a tailored resume, research the company, track it, skip it, or archive it, exactly as with anything a scan found.",
          },
        ],
      },
      {
        id: "email-alerts",
        title: "Import job alert emails",
        intro:
          "Job boards send alert emails full of postings. Rather than copying each one out by hand, save the email as a file and drop it into a folder the app watches.",
        bullets: [
          "Save the email from your mail program, then put the file into the `data/email-job-alert-imports/` folder inside the app\'s folder while the app is running. It accepts `.eml`, `.html`, and `.txt` files.",
          "The app reads the file and lists what it found, but adds nothing yet. You approve each one, or dismiss it.",
          "Anything you do not act on stays waiting. Nothing is added behind your back.",
          "Alert emails often link back to the job board rather than the employer. Open the job and press Resolve posting to go looking for the real posting.",
          "The app never connects to your mailbox. It only reads files you put in that folder yourself.",
        ],
      },
      {
        id: "aggregator",
        title: "Scan with Adzuna",
        intro:
          "Adzuna is a job aggregator that indexes listings from many sources. Unlike browser-board scanning, it requires no browser or active session — the app queries its API directly from Settings.",
        steps: [
          {
            title: "Get the free keys",
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
          body: "Adzuna aggregates from many sources and reaches jobs that may not appear in direct ATS portals or browser-board searches. Use it alongside other scan methods for broader coverage. It uses your selected fresh-posting window: 24 hours, 72 hours by default, or 7 days, with up to 50 results per title/location pair.",
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
    description: "Get jobs out of LinkedIn, Indeed, and similar sites, which the app cannot read on its own. Needs a separate AI assistant that can drive your browser.",
    category: "Jobs",
    readTime: "16 min",
    icon: "globe",
    image: {
      src: "/images/job-search-terminal/job-search-terminal-jobs-table.png",
      alt: "Jobs table showing imported job records and filterable source data",
    },
    highlights: [
      "This is the one part of the app that needs another program: an AI assistant that can use your browser.",
      "The assistant reads job postings and saves them to a file. Job Search Terminal picks that file up on its own.",
      "It only ever reads. It must never press Apply or message anyone, and you should stop it if it tries.",
    ],
    sections: [
      {
        id: "requirements",
        title: "What you need first",
        intro:
          "Sites like LinkedIn do not let other programs read their listings, so the app cannot scan them the way it scans company job pages. The way round it is to have an AI assistant look at the pages in your own browser, as if you were reading them yourself, and write down what it sees.",
        bullets: [
          "Claude Desktop with the Claude in Chrome extension, or Codex with its Chrome extension. Either one works; these are separate programs you install yourself.",
          "You already signed in to the job site in Chrome. The assistant uses your existing session and must never log in for you.",
          "Job Search Terminal running, and the assistant pointed at the app\'s folder so it can read the instructions kept there.",
          "Your job titles, locations, work preferences, and title filters filled in — the assistant reads its search terms from those rather than asking you.",
        ],
      },
      {
        id: "criteria",
        title: "What it searches for",
        intro:
          "You do not type search terms. The assistant reads them out of your profile, which means a scan is only as good as what you put there.",
        bullets: [
          "Your target job titles become the searches it runs.",
          "Your locations and remote preferences decide where it looks.",
          "Words you marked as wanted keep matching roles in.",
          "Words you marked as unwanted throw matching roles out before you ever see them.",
          "It favours jobs posted in the last seven days, because older ones are usually gone.",
        ],
      },
      {
        id: "run",
        title: "Run a browser-board scan",
        steps: [
          {
            title: "Open Claude or Codex",
            body: "Start the assistant and point it at the Job Search Terminal folder. The instructions it needs — which sites, what to collect, what it must never do — are kept in a file there.",
          },
          {
            title: "Start with a simple prompt",
            body: "Ask it in plain words: \"scan LinkedIn for jobs matching my saved criteria\". It supports LinkedIn, Wellfound, Work at a Startup, Glassdoor, Indeed, and Monster.",
          },
          {
            title: "Confirm before browsing",
            body: "Before it starts, it should tell you what it is about to search for. Read that back — if the titles or locations look wrong, fix your profile rather than letting it run.",
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
          "Imported jobs arrive marked Found and Needs review, the same as anything a scan turned up. Nothing is scored until you ask for it.",
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
    description: "Find out how well a job actually fits you, then get a resume and application answers written for that one posting.",
    category: "Apply",
    readTime: "13 min",
    icon: "bot",
    image: {
      src: "/images/job-search-terminal/job-search-terminal-resume-tailoring.png",
      alt: "Tailored resume generation screen with keyword coverage and document actions",
    },
    highlights: [
      "Scoring tells you how well you fit, what is missing, what looks off about the posting, and whether to bother.",
      "The score is an opinion, not a verdict. You can overrule it, and sometimes you should.",
      "A tailored resume rearranges and rewords what is already in your uploaded resume. It should never add anything new.",
      "Everything the app writes is for you to copy and paste. It never sends or submits a thing.",
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
            body: "The top of the page collects what is known so far: the company and title, where the job came from, how old the posting is, pay if it was stated, what the role requires, and — once you have scored it — how well you match and anything that looked off.",
          },
          {
            title: "Run AI analysis",
            body: "Open the Analysis tab and press the button to score the job. The reasoning appears as it is written rather than all at once at the end, so you can follow how it reached its answer instead of being handed a number to trust.",
          },
          {
            title: "Correct the AI if needed",
            body: "You can change the score and the recommendation yourself. Do it whenever you know something the app does not — you have met the hiring manager, you know the team, the posting is misleading. Your judgement outranks it.",
          },
          {
            title: "Address gaps with evidence",
            body: "When you save a gap answer, the app checks whether it includes where the experience happened, what you did, and what proof point supports it. Vague answers are saved as drafts and prompt a follow-up question.",
          },
        ],
        callout: {
          title: "Model attribution",
          body: "The evaluation panel shows which provider and model handled the request. If you expected Ollama but see a cloud provider name, Ollama was unreachable and the next provider in your priority chain took over automatically.",
        },
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
            title: "Review job keyword alignment",
            body: "Alignment is the app's weighted text check, not a score from the employer's ATS. Must-have language counts more than preferred wording. Add only evidence-supported phrases; for a missing requirement, select the roles where you used it, add context, and review the proposed bullet before accepting it.",
          },
          {
            title: "Edit the draft",
            body: "Open the resume editor to refine summary, bullets, skills, and emphasis before exporting. The app checks metrics and substantive claims against the approved resume lane plus confirmed gap answers and supplements.",
          },
          {
            title: "Export PDF",
            body: "Download the final PDF after review. If edits contain unsupported quantified claims, the app shows every flagged claim and where it appears. Return to the draft to fix them, or explicitly export anyway after confirming the wording is accurate. Use the employer's requested format if the application instructions specify something else.",
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
    description: "Keep track of where every application stands, so nothing you sent quietly disappears.",
    category: "Track",
    readTime: "9 min",
    icon: "applications",
    image: {
      src: "/images/job-search-terminal/job-search-terminal-applications-kanban.png",
      alt: "Applications board showing jobs grouped by status",
    },
    highlights: [
      "A status is what turns a pile of jobs into something you can actually work through.",
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
          "The table view is for working: sorting, filtering, and checking when you applied to what.",
          "The board view lays out the same jobs in columns by status. It is for stepping back — you can see at a glance whether you are applying plenty but hearing nothing, or the reverse.",
          "Anything whose follow-up date has passed is marked overdue, so a chase you meant to do does not quietly disappear.",
          "If you keep building the same filter, save it and pick it from the list next time.",
        ],
      },
      {
        id: "dashboard-queue",
        title: "Keep the Dashboard useful",
        intro:
          "The Dashboard has three lists, and each answers a different question. Fresh matches is what just came in. Apply next is what you have scored and should act on. In flight is what you are waiting to hear back about. They stay useful only if you keep statuses and follow-up dates honest — a job left at the wrong status quietly stops appearing where you need it.",
      },
      {
        id: "archive-delete",
        title: "Archive vs delete",
        bullets: [
          "Archive or skip a job to get it out of your way while keeping it. This is what you want almost every time.",
          "Anything archived can be brought back from the Archived page if the role reopens or a contact resurfaces.",
          "Delete removes the job and everything attached to it — your notes, the resumes you generated for it, and its history. It cannot be undone, so use it only for genuine mistakes and duplicates.",
        ],
      },
    ],
    related: ["job-search", "evaluate-tailor", "privacy-data"],
  },
  {
    slug: "interview-prep",
    title: "Prepare for interviews",
    shortTitle: "Interview prep",
    description: "Collect the handful of stories you will retell in every interview, and practise saying them out loud.",
    category: "Prep",
    readTime: "8 min",
    icon: "message",
    image: {
      src: "/images/job-search-terminal/job-search-terminal-interview-prep.png",
      alt: "Interview preparation screen with story bank and voice practice tools",
    },
    highlights: [
      "Most interview questions are answered from the same six or eight stories. Get those right and you are prepared for most of what comes.",
      "A story works only if it is specific and actually yours. Detail is what makes it convincing.",
      "The app can shape a rough story into a clearer one, but nothing is saved until you have read it.",
      "Tag your stories so you can find the right one under pressure rather than hunting for it.",
    ],
    sections: [
      {
        id: "star",
        title: "Build your stories",
        intro:
          "STAR is a way of structuring an answer so it lands. Interviewers are trained on it, so an answer shaped this way is easy for them to follow and score. Five parts:",
        bullets: [
          "Situation: what was happening and why it mattered.",
          "Task: what you owned or were expected to change.",
          "Action: what you personally did.",
          "Result: what changed, ideally with a measurable outcome.",
          "Reflection: what you learned and how you would apply it again.",
        ],
      },
      {
        id: "practice",
        title: "Draft, record, or add questions",
        steps: [
          {
            title: "Choose or add a question",
            body: "Open the Practice tab and pick one of the questions already there, or press to add your own — a question a company actually asked you, or one you know is coming. Your own questions are kept for next time.",
          },
          {
            title: "Type or record",
            body: "Open the practice wizard to write rough notes or record a spoken answer. You can also open the standalone story wizard without attaching it to a question.",
          },
          {
            title: "Review before saving",
            body: "The AI structures the draft into Situation, Task, Action, Result, and Reflection, then shows readiness notes before anything is saved.",
          },
          {
            title: "Edit section-by-section",
            body: "After saving, click Edit next to any section to make precise adjustments without creating duplicate stories.",
          },
        ],
      },
      {
        id: "find-stories",
        title: "Find the right story",
        bullets: [
          "Use search for title, STAR text, company, position, or tag.",
          "Filter by grouped taxonomy tags instead of separate skill/theme fields.",
          "Open the Taxonomy tab to review, add, move, archive, alias, or merge tags.",
          "Assign reusable answers to multiple applied, recruiter-responded, or interviewing positions.",
          "Switch to the Story Bank tab when you only need retrieval, review, or editing.",
          "Filter by answered questions, standalone stories, or job evaluation suggestions.",
          "Use quality filters to focus on ready stories or repair stories missing outcomes.",
          "Job-backed stories keep a link to the original role context.",
          "Raw job keywords stay available in story details, while grouped tags make large story banks easier to browse.",
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
    description: "What stays on your computer, the few things that leave it and why, how to back everything up, and what the app will never do on your behalf.",
    category: "Reference",
    readTime: "10 min",
    icon: "lock",
    highlights: [
      "Your resumes, jobs, notes, and application history sit on your own computer. There is no account and no server holding them.",
      "When you ask for something AI-powered, the relevant text goes to the service you chose. If that matters to you, use Ollama and nothing leaves at all.",
      "The app never applies for a job, never sends a message, and never fills in a form for you.",
    ],
    sections: [
      {
        id: "local-first",
        title: "What stays on your computer",
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
        title: "What leaves your computer, and when",
        intro:
          "When you ask the app to score a job or write something, it has to send the AI service enough to work with. That usually means the job description and the parts of your resume and profile that are relevant. It sends this at the moment you press the button, and not otherwise — there is no background upload and nothing is stored on their side by the app.",
        bullets: [
          "If Ollama is doing the work, nothing leaves at all — the AI is running on your own machine.",
          "OpenAI, Anthropic, and Google Gemini receive what is needed for each request. Read the data policy of whichever one you pick; they differ, and they change.",
          "If a document is genuinely sensitive, do not run a cloud AI feature on it. Use Ollama for that one, or handle it yourself.",
          "If you think anyone else has seen your key, delete it on the service\'s website and make a new one.",
          "Once a day the app asks GitHub whether a newer version of Job Search Terminal exists. It sends one code identifying a version that is already published on GitHub — nothing about you, your jobs, or your resumes, and nothing you have written yourself.",
        ],
        callout: {
          title: "Fully private with Ollama",
          body: "Put Ollama at the top of your list in Settings → AI Provider and keep it running, and every AI request — job descriptions, resume content, application answers — is handled on your own computer. Nothing at all leaves the machine.",
        },
      },
      {
        id: "version-updates",
        title: "Version and update checks",
        intro:
          "The footer on every page shows which version you are running and whether the project has moved on since you last pulled.",
        bullets: [
          "The version reads as a number and a short commit code, for example 0.11.0 · b5bcb0d. A star after the code means you have edited files in your copy.",
          "Click the version number to see what changed in each release.",
          "Once a day the app asks GitHub whether newer commits exist. The answer is cached on your machine, so pages never wait on the network.",
          "When you are behind, the footer shows an Update available badge. Open it to see exactly what changed on GitHub.",
          "To update, open a terminal in your Job Search Terminal folder and run git pull, then npm install, then restart the app.",
          "To switch the check off entirely, set JST_UPDATE_CHECK=off in the environment you start the app from. The version still shows; only the GitHub call stops.",
        ],
        callout: {
          title: "Why the check exists",
          body: "Self-hosted copies do not update themselves. Without this you would only learn about a fix by checking GitHub by hand. The check sends no personal data and can be turned off.",
        },
      },
      {
        id: "safety",
        title: "What the app will never do",
        intro:
          "These are deliberate limits, not features that have not been built yet. Applying for a job is a decision, and the app does not make decisions for you.",
        bullets: [
          "It never submits an application. It writes the material; you send it.",
          "It never emails anyone, and never sends a LinkedIn message.",
          "When an AI assistant is reading job boards in your browser, it must never press Apply or contact anyone. If you see it try, stop it.",
          "It never deletes your resumes, documents, or job history on its own. Everything stays until you remove it yourself.",
        ],
      },
      {
        id: "backup",
        title: "Backups and exports",
        bullets: [
          "Open Account → Settings → Data & Backup to create one portable archive before large cleanup, migration work, or moving machines.",
          "A portable backup includes the database, resume files referenced by your resume lanes, generated documents, source configuration, and scanner import history. Other files under assets are always ignored.",
          "You can put a password on the backup file. If you choose not to, the app makes you confirm you understand — the file contains your resumes and your saved AI keys in readable form, so anyone who gets the file gets those too.",
          "Backup creation shows a progress dialog while files are packaged locally. Keep the window open until the browser download starts.",
          "Restore validates the archive in a bounded disk staging area, shows a preview, and creates an automatic rollback backup before replacing managed local data. Unrelated files under assets stay untouched.",
          "Use export when you need a readable snapshot outside the database.",
          "Keep backups private because they may contain resume, application, and credential data.",
        ],
      },
    ],
    related: ["getting-started", "ai-providers", "troubleshooting"],
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    shortTitle: "Troubleshooting",
    description: "The things that most often go wrong, and what to do about each one.",
    category: "Reference",
    readTime: "12 min",
    icon: "briefcase",
    highlights: [
      "Most problems come down to four things: setup is incomplete, the AI service is not reachable, a company page has moved, or the browser is showing you an old copy of the page.",
      "When anything AI-related misbehaves, press Test connection first. It answers the question in seconds.",
      "If scans return junk, fix your job titles and title filters before anything else. That is nearly always the cause.",
    ],
    sections: [
      {
        id: "app-start",
        title: "The app will not start",
        bullets: [
          "If you have just downloaded an update, run npm install in a terminal in the app\'s folder before starting it. New versions sometimes need new supporting files.",
          "The app normally opens at localhost:3000. If something else on your computer is already using that address, the app picks a different one and prints it in the terminal — read the terminal text and use the address it gives you.",
          "If pages look wrong or show old information, stop the app with Ctrl + C in the terminal and start it again.",
        ],
      },
      {
        id: "ai",
        title: "AI features fail",
        bullets: [
          "Open Account → Settings → AI Provider and press Test connection. Whatever it says is the fastest clue you will get.",
          "For OpenAI, Anthropic, or Gemini: check the key is still saved, then check the service\'s own website for an unpaid bill or a spending limit you have hit. A key that worked yesterday usually stopped for one of those two reasons.",
          "For Ollama: check it is actually running, and that the model you picked is still installed. Type ollama list in a terminal to see what you have.",
          "If you set up more than one service, remember the app works down the list. If the top one is failing, the next one takes over — so features may still work while the service you expected is broken.",
        ],
      },
      {
        id: "ollama",
        title: "Ollama connection and model issues",
        bullets: [
          "If the connection test fails: run ollama serve in a terminal and try again. The server must be running before the app can reach it.",
          "If the model picker shows no models: run ollama pull llama3.1:8b (or any model) in a terminal, then reopen the picker.",
          "If evaluation errors early in a run: the model may still be loading into memory. Wait a few seconds and retry.",
          "If generation is very slow or the server stops responding: the selected model may not fit in available RAM. Try a smaller model.",
          "If you changed the Ollama port: update the base URL in Settings to match, for example http://localhost:11435.",
          "A yellow dot next to Account means the service at the top of your list cannot be reached, so the app has fallen back to the next one. If that is Ollama, check it is still running.",
          "If a cloud provider is handling requests when you expected Ollama: Ollama is in the chain but the server is not reachable. The app automatically fell over to the next provider.",
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
          "Review target roles in Account → Profile.",
          "Tighten positive and negative title filters.",
          "Review your work arrangement and locations.",
          "Disable noisy sources.",
          "Evaluate a few examples before changing too many settings at once.",
        ],
      },
      {
        id: "linkedin",
        title: "Browser-board scanner issues",
        bullets: [
          "If the assistant reports it has nothing to search for, your profile is missing job titles or locations. Fill those in first.",
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
