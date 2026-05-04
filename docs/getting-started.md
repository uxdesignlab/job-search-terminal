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
- Company careers pages
- Referrals and warm introductions (add what you know about the role)
- Jobs emailed to you by recruiters
- Any board the scanner doesn't cover (Wellfound, Dice, Handshake, etc.)

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

This deletes all local data and resets to demo data:

```bash
npm run db:reset
```

Use with caution — this cannot be undone unless you have a backup.

---

## Prompt for Claude Code or Codex (no-dev setup)

If you want an AI coding assistant to set up and run this app for you
automatically, paste the following prompt into **Claude Code** or **Codex**:

---

```
I want you to set up and run the Job Search Terminal app on my computer.

Here is what I need you to do:

1. Check whether Node.js (v18+) and Git are installed. If either is missing,
   tell me what to install and where to download it, then stop and wait for me
   to install it before continuing.

2. Clone the repository from GitHub:
   git clone https://github.com/uxdesignlab/job-search-terminal.git

3. Change into the project directory:
   cd job-search-terminal

4. Install dependencies:
   npm install

5. Start the development server:
   npm run dev

6. Tell me to open http://localhost:3000 in my browser.

7. Walk me through the first-time setup steps in plain language:
   a. The dashboard shows a 3-step setup wizard. Start with Step 1: Add an AI API key.
      - Click the provider you want (Gemini has a free tier) to expand the instructions.
      - Get a key from the provider's website (the app shows the direct link).
      - Click "Go to Settings → AI Providers", paste the key, and save.
   b. Return to the Dashboard. Step 1 should show ✓. Click "Go to Profile → Resumes".
   c. On the Resumes tab, click "Upload PDF" on any lane and select your resume file.
   d. Go to Profile → Overview and click "Extract with AI" to populate your profile.
   e. Review the Skills & Roles, Preferences, and Constraints tabs — edit anything the AI got wrong.
   f. Return to the Dashboard and click "Scan for new jobs".

If any step fails, read the error message carefully, explain what went wrong in
plain language, and suggest the fix before continuing.

Do not skip steps. Do not assume anything is already set up unless you have
verified it. Ask me if you are unsure about anything.
```

---

Replace `YOUR_USERNAME/job-search-terminal` in the prompt with the actual
GitHub URL before pasting it.

---

## Is this the same as Career-Ops?

No. Job Search Terminal was inspired by Career-Ops, but it is a separate project with a different product direction.

Career-Ops is a powerful CLI-first, agentic job-search system. Job Search Terminal is a browser-based, local-first dashboard designed to make the workflow more approachable for people who do not want to manage everything through AI coding tools and config files.

---

## License note

Job Search Terminal is free for non-commercial use under CC BY-NC 4.0.

Commercial use requires written permission from the copyright holder.
