# Getting Started

This guide explains what the app is, what you need to run it, and how to get it
running on your computer — even if you have no development background.

---

## What is this app?

**Job Search Terminal** is a local job-search dashboard that runs entirely on
your computer. It helps you:

- Discover new job postings automatically from company career pages.
- Score each job against your career profile using AI.
- Generate tailored resumes for specific roles.
- Draft application answers for copy-paste (it never submits anything on your behalf).
- Track every application through the full funnel.
- Prepare for interviews with a STAR story bank and voice practice.

Your data never leaves your machine. There are no accounts, no subscriptions,
and no cloud storage. The only time the app contacts the internet is when you
ask it to use an AI provider (OpenAI, Anthropic, or Google Gemini) to evaluate
a job or generate content.

---

## What you need

| Requirement | Details |
|---|---|
| **Computer** | Mac, Windows (WSL), or Linux |
| **Node.js** | Version 18 or later — download from [nodejs.org](https://nodejs.org) |
| **Git** | Download from [git-scm.com](https://git-scm.com) |
| **An AI API key** | At least one of: OpenAI, Anthropic, or Google Gemini (free tier available) |
| **Google Chrome** | Required for PDF generation — most computers already have it |

You do not need to know how to code. You just need to be comfortable opening a
terminal (the black or white window where you type commands).

---

## How to open a terminal

**Mac:** Press `Command + Space`, type `Terminal`, press Enter.

**Windows:** Press `Windows key`, type `PowerShell`, press Enter. (Or install
[Windows Terminal](https://aka.ms/terminal) for a better experience.)

**Linux:** Press `Ctrl + Alt + T`.

---

## Step-by-step setup

### 1. Install Node.js

Go to [nodejs.org](https://nodejs.org), download the **LTS** version, and run
the installer. Accept all defaults.

Verify it worked by opening a terminal and typing:
```
node --version
```
You should see something like `v20.11.0`.

### 2. Install Git

Go to [git-scm.com](https://git-scm.com/downloads), download the installer for
your operating system, and run it. Accept all defaults.

Verify it worked:
```
git --version
```

### 3. Download the app

In your terminal, navigate to where you want to store the app (your Desktop or
Documents folder works fine):

```bash
cd ~/Desktop
```

Then download the app:

```bash
git clone https://github.com/uxdesignlab/job-search-terminal.git
```

Once cloned, move into the project folder:

```bash
cd job-search-terminal
```

### 4. Install dependencies

This downloads everything the app needs to run:

```bash
npm install
```

It may take a minute or two. You will see a lot of text scrolling by — that is
normal.

### 5. Add your AI API key

The app needs at least one AI provider key to evaluate jobs and generate
content. You can use whichever service you have access to:

- **Google Gemini** (free tier): [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- **OpenAI:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Anthropic:** [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)

Once you have a key, you configure it inside the app itself (Settings → AI
Providers). You do not need to create any configuration files manually.

### 6. Start the app

```bash
npm run dev
```

The terminal will print something like:

```
▲ Next.js 15.x
- Local: http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The app
will be running.

### 7. First-time setup in the app

When you first open the app at http://localhost:3000, the dashboard shows a
3-step setup guide:

**Step 1: Add an AI API key**
Click the provider you want to use to expand the instructions. Pick one — you
only need one:
- **Google Gemini** (free tier): go to aistudio.google.com/apikey, sign in with
  Google, click Create API key. Copy the key.
- **OpenAI**: go to platform.openai.com/api-keys, sign in, click Create new
  secret key. Copy the key.
- **Anthropic (Claude)**: go to console.anthropic.com/settings/keys, sign in,
  click Create Key. Copy the key.

Then click "Go to Settings → AI Providers", select your provider, paste the key,
and save. Return to the Dashboard — Step 1 shows ✓.

**Step 2: Upload your resume**
Click "Go to Profile → Resumes". On the Resumes tab, each lane represents a
different resume version. For any lane, click the blue "Upload PDF" button and
select your resume file. The app extracts the text automatically.

After uploading, go to Profile → Overview and click "Extract with AI". The AI
reads your resume and populates your skills, target roles, preferences, and
experience. Review each tab (Skills & Roles, Preferences, Constraints) and make
any corrections.

**Step 3: Scan for jobs**
Return to the Dashboard. The setup wizard is gone — you're ready. Click "Scan
for new jobs" to start discovering opportunities.

---

## Everyday use

| What you want to do | Where to go |
|---|---|
| Find new jobs | Dashboard → Scan for new jobs |
| Add a job from anywhere | Jobs → Add Job button |
| See all your jobs | Jobs |
| Evaluate a job | Jobs → click a job → Evaluation tab |
| Generate a tailored resume | Jobs → click a job → Resume tab |
| Prepare application answers | Jobs → click a job → Apply tab |
| Research a company | Jobs → click a job → Research |
| Draft a recruiter message | Jobs → click a job → Outreach |
| Track your applications | Applications |
| Practice for interviews | Interview Prep |
| Update your profile | Account → Profile |
| Upload or replace a resume | Account → Profile → Resumes tab |
| Add an AI key | Account → Settings → AI Providers |
| See role fit strategy | Account → Strategy |
| Change AI provider or add sources | Account → Settings |

---

## Adding jobs from anywhere

You are not limited to the jobs the scanner finds. Any job you see on LinkedIn,
a company careers page, a job board, or hear about through a referral can be
added and evaluated with AI.

**How to add a job manually:**

1. Go to **Jobs** in the top navigation.
2. Click the **Add Job** button.
3. Fill in the details:
   - **Company** — the employer name.
   - **Job Title** — the exact title from the posting.
   - **Job URL** — the link to the posting, so you can return to it later.
   - **Job Description** — paste the full text of the job description. The more
     detail you include, the better the AI fit score.
4. Click **Submit Job**. The app creates the job and opens it immediately.

Manual jobs go through the same pipeline as scanned jobs — fit scoring, resume
tailoring, application tracking, company research, and outreach drafting all work
exactly the same way. The fit score tells you whether it is worth applying before
you invest time in a cover letter or tailored resume.

**Good sources to add jobs from manually:**
- LinkedIn job postings
- Wellfound, Work at a Startup, Glassdoor, Indeed, and Monster postings if you are not using the browser-board scanner
- Company careers pages
- Referrals and warm introductions (add what you know about the role)
- Jobs emailed to you by recruiters
- Any board the scanner doesn't cover (Dice, Handshake, etc.)

---

## Stopping and restarting

To stop the app: go to your terminal and press `Ctrl + C`.

To restart:
```bash
npm run dev
```

---

## Updating the app

When a new version is available:

```bash
git pull
npm install
npm run dev
```

---

## Backing up your data

All your data is in `data/job-search-terminal.sqlite`. Back it up at any time:

```bash
npm run data:backup
```

Backups are saved to `output/backups/`. Export a readable JSON snapshot:

```bash
npm run data:export
```

---

## Troubleshooting

**The app won't start**
- Make sure you ran `npm install` first.
- Make sure no other app is using port 3000.
- Try stopping with `Ctrl + C` and running `npm run dev` again.

**Pages show stale or missing data**
- Restart the dev server.
- Run `npm run db:check` to verify the database.

**PDF generation fails**
- Make sure Google Chrome is installed.
- On Mac, Chrome is usually at `/Applications/Google Chrome.app`. On Windows,
  it is in `C:\Program Files\Google\Chrome\Application\chrome.exe`.
- If Chrome is in an unusual location, set the environment variable:
  `CHROME_EXECUTABLE_PATH=/path/to/chrome`

**No AI results**
- Go to Settings → AI Providers and check that your key is entered and the
  correct provider is set as active. Use the "Test connection" button to verify.

---

## Reset everything and start fresh

This deletes all local data and resets to an empty local profile:

```bash
npm run db:reset
```

Use with caution — this cannot be undone unless you have a backup.

---

## Prompt for Claude Code or Codex (self-service setup)

If you want an AI coding assistant to set up and run this app with minimal
manual work, paste the following prompt into **Claude Code** or **Codex**:

---

```
Set up and run Job Search Terminal for me as a self-service local app.

Repository:
https://github.com/uxdesignlab/job-search-terminal.git

Goal:
Do the setup yourself end to end. Do not give me a list of terminal commands to
run. Use the terminal and browser tools available to you, verify each step, and
only ask me for information you cannot safely obtain or create yourself, such as
an AI API key or the local path to my resume PDF.

What to do:

1. Inspect the computer for required tools:
   - Node.js 18 or newer
   - npm
   - Git
   - Google Chrome or another Chromium browser for PDF generation

2. If a required tool is missing, try to install it using the normal package
   manager for this computer, such as Homebrew on macOS, winget on Windows, or
   apt/dnf/pacman on Linux. If installation requires administrator permission or
   an approval prompt, ask me for that approval once, then continue after it is
   granted. Do not stop at "please install this" unless there is no safe
   automated installation path.

3. Create or reuse a local project folder:
   - If the repository is already cloned, use the existing checkout.
   - If it is not cloned, clone it from the repository URL above.
   - Avoid overwriting or deleting existing user data.

4. Install project dependencies with npm.

5. Run the project's verification checks:
   - npm run lint
   - npm run typecheck
   - npm run build

6. Start the development server. If port 3000 is busy, use the next available
   local port and tell me which URL is running.

7. Open the app in a browser yourself and verify the dashboard loads. Do not
   simply tell me to open the URL.

8. Complete as much first-time setup as the app allows:
   - If no AI provider is configured, ask me for one API key, then enter it in
     Settings -> AI Providers and use the app's connection test if available.
   - If a resume is needed, ask me for the local PDF path or use the browser file
     picker if your tools support it. Upload it through Profile -> Resumes.
   - Preserve multiple resume lanes. Do not merge everything into one universal
     resume.
   - Run profile extraction from Profile -> Overview after a resume is uploaded.
   - Return to the dashboard and scan for jobs when setup is complete.

9. Safety rules:
   - Never submit job applications, send emails, or message recruiters for me.
   - Never delete resumes, generated documents, reports, backups, or tracked
     application data unless I explicitly ask.
   - Keep all data local.

10. If anything fails, read the actual error, fix what you can, retry once, and
    then explain the blocker in plain language with the exact next approval or
    input needed from me.

Finish by giving me the running local URL, what you verified, and anything still
needed from me.
```

---

## Is this the same as Career-Ops?

No. Job Search Terminal was inspired by Career-Ops, but it is a separate project with a different product direction.

Career-Ops is a powerful CLI-first, agentic job-search system. Job Search Terminal is a browser-based, local-first dashboard designed to make the workflow more approachable for people who do not want to manage everything through AI coding tools and config files.

---

## License note

Job Search Terminal is free for non-commercial use under CC BY-NC 4.0.

Commercial use requires written permission from the copyright holder.
