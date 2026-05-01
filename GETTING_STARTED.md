# Getting Started — Complete Setup Guide for Non-Technical Users

This guide assumes you have never used GitHub, the terminal, or any developer tools before. Follow every step in order and you will have the app running on your computer.

---

## What You Are Installing

This app runs entirely on your own computer — nothing is stored in the cloud. To run it you need three free tools:

| Tool | What it does |
|------|-------------|
| **Git** | Downloads the project code from GitHub |
| **Node.js** | Runs the app (like a local server on your machine) |
| **A terminal** | The text window you type commands into |

You do not need to know how to code. You only need to type a handful of commands, copy-pasted exactly from this guide.

---

## Step 1 — Open the Terminal

The terminal is a text window where you type commands.

**Mac:**
1. Press `Command ⌘ + Space` to open Spotlight
2. Type `Terminal` and press Enter
3. A white or black window opens — that is your terminal

**Windows:**
1. Press `Windows key + R`
2. Type `cmd` and press Enter
3. A black window opens — that is your terminal

Keep this window open for the rest of the guide. Every time this guide says "run this command", it means: click in that window, type the command, press Enter, and wait until it finishes.

---

## Step 2 — Install Git

Git is the tool that downloads code from GitHub.

### Check if you already have it

Run this command:

```
git --version
```

If you see something like `git version 2.x.x` — Git is already installed. Skip to Step 3.

If you see an error, install it:

**Mac:**
A popup may appear asking you to install "Command Line Developer Tools". Click **Install** and wait for it to finish (5–10 minutes).

If no popup appears, go to https://git-scm.com/download/mac, download the installer, run it, and follow the prompts.

**Windows:**
Go to https://git-scm.com/download/win, click the top download link, run the installer, and click **Next** on every screen (the defaults are fine).

After installing, close and reopen your terminal, then run `git --version` again to confirm.

---

## Step 3 — Install Node.js

Node.js is what actually runs the app. You need version 18 or higher.

### Check if you already have it

Run this command:

```
node --version
```

If you see `v18.x.x`, `v20.x.x`, `v22.x.x` or higher — Node.js is already installed. Skip to Step 4.

If you see an error or a version lower than 18:

1. Go to https://nodejs.org
2. Click the button labeled **LTS** (the left one — it says "Recommended For Most Users")
3. Download the installer for your operating system
4. Run it and click **Next** on every screen
5. When it finishes, close and reopen your terminal
6. Run `node --version` again — you should now see `v20.x.x` or similar

---

## Step 4 — Download the Project

This step copies all the project files to your computer.

### Choose where to save it

First decide which folder you want to save the project in. A good default is your home folder. To go there, run:

```
cd ~
```

(`cd` means "change directory" — it moves you to a different folder.)

If you want to save it somewhere specific, like your Desktop:

**Mac:**
```
cd ~/Desktop
```

**Windows:**
```
cd %USERPROFILE%\Desktop
```

### Download the code

Now run:

```
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
```

Replace `YOUR_USERNAME/YOUR_REPO_NAME` with the actual GitHub repository address the owner gave you. For example:

```
git clone https://github.com/janedoe/job-search-dashboard.git
```

This creates a new folder with all the project files. Wait until it says "done."

### Move into the project folder

```
cd job-search-dashboard
```

(Use whatever folder name was created — it matches the repo name.)

You are now inside the project. Every command for the rest of this guide must be run from inside this folder. If you open a new terminal window, run `cd ~/Desktop/job-search-dashboard` (or wherever you saved it) before running anything else.

---

## Step 5 — Install Project Dependencies

The project uses a long list of code packages that need to be downloaded. Run:

```
npm install
```

This takes 1–5 minutes. You will see a lot of text scrolling by — that is normal. Wait until you see your cursor return (a blinking line ready for the next command).

If you see warnings like `npm warn deprecated` — those are normal, ignore them.

If you see `npm error` (not `npm warn`) — take a screenshot and reach out to the person who shared this project with you.

---

## Step 6 — Set Up the Database

The app stores everything in a local database file. Create it by running:

```
npm run db:migrate
```

You should see output mentioning migrations being applied. This only needs to be done once.

---

## Step 7 — Add Your Resume Files

The app needs your resume PDFs to tailor resumes to job postings.

1. Find your resume PDF files on your computer
2. Copy them into the `assets` folder inside the project folder

For example, if you saved the project on your Desktop:
- Mac: `/Users/YourName/Desktop/job-search-dashboard/assets/`
- Windows: `C:\Users\YourName\Desktop\job-search-dashboard\assets\`

You can have multiple resume files — one for each career angle (leadership, IC, operations, etc.).

After copying the files, you will name and configure them inside the app.

---

## Step 8 — Start the App

Run:

```
npm run dev
```

You will see output ending in something like:

```
▲ Next.js 15.x.x
- Local:    http://localhost:3000
```

The app is now running. **Do not close this terminal window** — closing it stops the app.

---

## Step 9 — Open the App in Your Browser

Open any web browser (Chrome, Safari, Firefox, Edge) and go to:

```
http://localhost:3000
```

You should see the Job Search Dashboard. 

---

## Step 10 — First-Time Setup Inside the App

### 10a — Configure your profile

1. Click **Profile** in the top navigation
2. Scroll down to **Edit profile strategy**
3. Fill in your current search goal, target roles, constraints, deal-breakers, location preferences, and remote preference
4. Click **Save profile**

### 10b — Name your resume lanes

1. On the Profile page, scroll to **Resume lanes**
2. Each PDF you added to the `assets` folder may appear here if it was already seeded, or may need to be uploaded
3. Click the **✎** (pencil) icon next to a resume name to rename it
4. Use descriptive names that reflect the career angle, for example:
   - `Executive / Leadership`
   - `IC / Product Design`
   - `Design Operations`
5. Press Enter to save

If a resume is not showing up, click **Re-upload PDF** and select the file from your `assets` folder.

### 10c — Add an AI key (optional but recommended)

The app works without AI, but AI makes evaluations, resume tailoring, outreach, and research dramatically better.

**To get a free/paid API key:**
- **Anthropic (Claude)** — https://console.anthropic.com → sign up → API Keys → Create Key
- **Google (Gemini)** — https://aistudio.google.com → Get API Key (free tier available)
- **OpenAI (GPT)** — https://platform.openai.com → API keys → Create new secret key

**To add the key in the app:**
1. Click **Account** in the top navigation
2. Click **Settings**
3. Select your AI provider
4. Paste your API key into the key field
5. Click **Test connection** — you should see a green checkmark
6. Click **Save**

### 10d — Configure job scan sources

1. Click **Account → Settings**
2. Scroll to **Scan sources**
3. Toggle on the companies you want to track
4. To add a company not in the list, click **Add source** and enter the company name and their careers page URL

### 10e — Run your first scan

1. Click **Dashboard** in the navigation
2. Click **Scan for jobs**
3. Wait 30–120 seconds while the scanner checks career portals
4. New jobs appear in the **Jobs** list

---

## Stopping and Restarting the App

**To stop:** Go to the terminal window running the app and press `Control + C`.

**To start again:** Open the terminal, navigate to the project folder, and run `npm run dev` again.

```
cd ~/Desktop/job-search-dashboard
npm run dev
```

---

## Keeping Your Data Safe

All your data is in one file: `data/js.sqlite` inside the project folder.

**Back it up regularly:**

```
npm run data:backup
```

This copies the database to `output/backups/` with a timestamp. You can also manually copy `data/js.sqlite` to an external drive, Dropbox, or iCloud at any time.

**Never delete this file.** If it is lost, all your jobs, evaluations, applications, and resumes are gone.

---

## Getting Updates

When a new version of the project is available:

1. Stop the app (`Control + C` in the terminal)
2. Run:

```
git pull
npm install
npm run db:migrate
npm run dev
```

This downloads the latest changes, updates packages, applies any new database changes, and restarts the app.

---

## Troubleshooting

### The app won't start — "Cannot find module" error

Run `npm install` again, then try `npm run dev`.

### The app won't start — "Port 3000 is already in use"

Something else is using that port. Either:
- Close other apps that might be running on port 3000
- Or change the port: `npm run dev -- --port 3001` then go to http://localhost:3001

### I see a white screen or "Application error"

Open the terminal and look for a red error message. Take a screenshot and share it with the person who gave you the project.

### PDF generation doesn't work

The app uses Chromium (a browser) to create PDFs. It should install automatically. If it doesn't:

```
npx playwright install chromium
```

### The database is corrupted or empty after an update

Restore from your backup:

```
cp output/backups/js-backup-YYYY-MM-DD.sqlite data/js.sqlite
```

Replace `YYYY-MM-DD` with the date of your most recent backup.

### I accidentally deleted something

If you have a backup, restore it as shown above. If not, the data cannot be recovered — this is why regular backups matter.

### Nothing shows up after scanning

Check that:
1. The companies in your scan sources are enabled (Account → Settings → Scan sources)
2. Your `config/portals.yml` has the companies listed with valid `api` and `board` values
3. You have an internet connection

---

## Everyday Usage Flow

Here is a suggested workflow once everything is set up:

1. **Every few days** — Click **Scan for jobs** on the Dashboard to find new postings
2. **Review new jobs** — Go to **Jobs**, sort by Fit Score, open promising ones
3. **Evaluate** — Click **Re-evaluate with AI** on any job to get the full A–G analysis
4. **Generate resume** — For strong fits, click **Generate tailored resume**, pick your base resume, edit the draft, create the PDF
5. **Apply** — Apply manually on the company's site, then mark the job **Applied** in the app
6. **Track** — Go to **Applications** to see everything in progress and upcoming follow-ups
7. **Prep** — Use **Interview Prep** to manage your STAR stories before interviews
8. **Outreach** — Use the **Outreach** tab on a job to get message drafts for LinkedIn

---

## Folder Structure (for reference)

```
job-search-dashboard/
├── assets/          ← Put your resume PDFs here
├── config/
│   └── portals.yml  ← Companies to scan
├── data/
│   └── js.sqlite    ← YOUR DATABASE — back this up!
├── output/
│   ├── *.pdf        ← Generated tailored resumes
│   └── backups/     ← Database backups
├── src/             ← App source code (do not edit unless you know what you're doing)
├── DOCUMENTATION.md ← Full feature documentation
└── GETTING_STARTED.md ← This file
```

---

## Getting Help

If something is broken and this guide does not cover it:

1. Copy the exact error message from the terminal
2. Note what you were trying to do when it broke
3. Share both with the person who gave you the project

For questions about features, refer to `DOCUMENTATION.md` in the same folder as this file.
