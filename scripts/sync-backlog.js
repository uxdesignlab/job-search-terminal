#!/usr/bin/env node
/**
 * Syncs docs/backlog.md to GitHub Issues and Milestones.
 *
 * Rules:
 *   - Items in backlog.md that have no open/closed issue → create
 *   - Items whose title or body changed → update the existing issue
 *   - Items still in backlog.md whose issue was closed → reopen
 *   - Items removed from backlog.md whose issue is still open → close
 *   - **Milestone:** lines in item bodies → create milestone if needed, assign issue
 *
 * Usage:
 *   node scripts/sync-backlog.js            # live run
 *   node scripts/sync-backlog.js --dry-run  # print what would happen
 *
 * Requires: gh CLI authenticated with repo + issues:write scope.
 * In GitHub Actions the GITHUB_TOKEN env var is used automatically.
 */

"use strict";

/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO = "uxdesignlab/job-search-terminal";
const BACKLOG_PATH = path.join(__dirname, "../docs/backlog.md");
const BACKLOG_LABEL = "backlog";
const ROADMAP_LABEL = "roadmap";
const DRY_RUN = process.argv.includes("--dry-run");

const AREA_FROM_PREFIX = {
  OB: "area: onboarding",
  RP: "area: resume-parser",
  RB: "area: resume-builder",
  DX: "area: docs",
  RF: "area: roadmap-feature",
};

const SEVERITY_LABEL = {
  blocker: "severity: blocker",
  high: "severity: high",
  medium: "severity: medium",
  low: "severity: low",
};

// ---------------------------------------------------------------------------
// Shell helpers
// ---------------------------------------------------------------------------

/** For gh issue/label/pr subcommands that accept --repo */
function run(args) {
  const full = [...args, "--repo", REPO];
  if (DRY_RUN) {
    console.log("[dry-run] gh", full.join(" "));
    return "[]";
  }
  const r = spawnSync("gh", full, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`gh ${args.slice(0, 2).join(" ")} failed:\n${r.stderr}`);
  }
  return (r.stdout ?? "").trim();
}

/** For gh api calls — endpoint is a full path, no --repo flag */
function api(endpoint, extraArgs = []) {
  const full = ["api", endpoint, ...extraArgs];
  if (DRY_RUN) {
    console.log("[dry-run] gh", full.join(" "));
    return "[]";
  }
  const r = spawnSync("gh", full, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`gh api ${endpoint} failed:\n${r.stderr}`);
  }
  return (r.stdout ?? "").trim();
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseBacklog(content) {
  const items = [];
  let severity = "low";
  let inRoadmap = false;
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Track which top-level section we're in
    if (line.match(/^## Roadmap\b/i)) { inRoadmap = true; i++; continue; }
    if (line.match(/^## Backlog\b/i)) { inRoadmap = false; i++; continue; }

    // Severity sub-section headers inside Backlog
    const secMatch = line.match(/^### (Blocker|High|Medium|Low)\b/i);
    if (secMatch) { severity = secMatch[1].toLowerCase(); i++; continue; }

    // Item header — works for both ### (roadmap) and ### (backlog)
    const itemMatch = line.match(/^### ([A-Z]+-\d+) — (.+)$/);
    if (itemMatch) {
      const id = itemMatch[1];
      const title = itemMatch[2].trim();
      const bodyLines = [];
      i++;
      while (i < lines.length && !lines[i].match(/^#{2,3} /)) {
        bodyLines.push(lines[i]);
        i++;
      }
      const rawBody = bodyLines.join("\n").trim();

      // Extract **Milestone:** from body
      const milestoneMatch = rawBody.match(/^\*\*Milestone:\*\*\s*(.+)$/m);
      const milestone = milestoneMatch ? milestoneMatch[1].trim() : null;

      // Extract **Type:** from body
      const typeMatch = rawBody.match(/^\*\*Type:\*\*\s*(.+)$/m);
      const type = typeMatch ? typeMatch[1].trim() : null;

      const prefix = id.split("-")[0];
      const area = AREA_FROM_PREFIX[prefix] ?? null;
      const isRoadmap = inRoadmap || prefix === "RF";

      items.push({ id, title, rawBody, severity: isRoadmap ? null : severity, area, milestone, type, isRoadmap });
      continue;
    }

    i++;
  }

  return items;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function issueTitle(item) {
  return `[${item.id}] ${item.title}`;
}

function issueBody(item) {
  return `${item.rawBody}\n\n---\n*Synced automatically from [\`docs/backlog.md\`](../../blob/main/docs/backlog.md)*`;
}

function labelsFor(item) {
  const labels = [item.isRoadmap ? ROADMAP_LABEL : BACKLOG_LABEL];
  if (!item.isRoadmap && item.severity) {
    labels.push(SEVERITY_LABEL[item.severity] ?? "severity: low");
  }
  if (item.area) labels.push(item.area);
  return labels;
}

// ---------------------------------------------------------------------------
// Milestone helpers
// ---------------------------------------------------------------------------

function listMilestones() {
  const raw = api(`repos/${REPO}/milestones`, ["--paginate"]);
  if (DRY_RUN) return [];
  return JSON.parse(raw); // [{ number, title }]
}

function createMilestone(title) {
  if (DRY_RUN) { console.log(`[dry-run] create milestone: ${title}`); return 1; }
  const raw = api(`repos/${REPO}/milestones`, ["--method", "POST", "--field", `title=${title}`]);
  return JSON.parse(raw).number;
}

function getMilestoneNumbers(items) {
  const existing = listMilestones();
  const byTitle = {};
  for (const m of existing) byTitle[m.title] = m.number;

  const needed = new Set(items.map((i) => i.milestone).filter(Boolean));
  const result = { ...byTitle };

  for (const title of needed) {
    if (!result[title]) {
      console.log(`  + Creating milestone: ${title}`);
      result[title] = createMilestone(title);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// GitHub issue helpers
// ---------------------------------------------------------------------------

function listTrackedIssues() {
  const rawBacklog = run(["issue", "list", "--label", BACKLOG_LABEL, "--state", "all", "--json", "number,title,state,body,milestone", "--limit", "500"]);
  const rawRoadmap = run(["issue", "list", "--label", ROADMAP_LABEL, "--state", "all", "--json", "number,title,state,body,milestone", "--limit", "500"]);
  if (DRY_RUN) return [];
  const all = [...JSON.parse(rawBacklog), ...JSON.parse(rawRoadmap)];
  // Dedupe by number (an issue could have both labels)
  return Object.values(Object.fromEntries(all.map((i) => [i.number, i])));
}

function createIssue(item, milestoneNumber) {
  const labelArgs = labelsFor(item).flatMap((l) => ["--label", l]);
  const milestoneArgs = milestoneNumber ? ["--milestone", String(milestoneNumber)] : [];
  run(["issue", "create", "--title", issueTitle(item), "--body", issueBody(item), ...labelArgs, ...milestoneArgs]);
}

function updateIssue(number, item, milestoneNumber) {
  const labelArgs = labelsFor(item).flatMap((l) => ["--add-label", l]);
  const milestoneArgs = milestoneNumber ? ["--milestone", String(milestoneNumber)] : [];
  run(["issue", "edit", String(number), "--title", issueTitle(item), "--body", issueBody(item), ...labelArgs, ...milestoneArgs]);
}

function closeIssue(number) {
  run(["issue", "close", String(number), "--comment", "Removed from `docs/backlog.md` — closing automatically."]);
}

function reopenIssue(number) {
  run(["issue", "reopen", String(number)]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log(`\nSyncing ${BACKLOG_PATH} → github.com/${REPO}\n`);

  const content = fs.readFileSync(BACKLOG_PATH, "utf8");
  const items = parseBacklog(content);
  console.log(`Parsed ${items.length} items (${items.filter((i) => i.isRoadmap).length} roadmap, ${items.filter((i) => !i.isRoadmap).length} backlog)\n`);

  // Ensure all referenced milestones exist on GitHub
  const milestoneNumbers = getMilestoneNumbers(items);

  // Load existing tracked issues
  const ghIssues = listTrackedIssues();
  const byID = {};
  for (const issue of ghIssues) {
    const m = issue.title.match(/^\[([A-Z]+-\d+)\]/);
    if (m) byID[m[1]] = issue;
  }

  const activeIDs = new Set(items.map((i) => i.id));

  for (const item of items) {
    const milestoneNumber = item.milestone ? milestoneNumbers[item.milestone] : null;
    const existing = byID[item.id];

    if (!existing) {
      console.log(`  + Creating  ${item.id}: ${item.title}`);
      createIssue(item, milestoneNumber);
      continue;
    }

    const wantTitle = issueTitle(item);
    const wantBody = issueBody(item);
    const currentMilestoneTitle = existing.milestone?.title ?? null;
    const changed =
      existing.title !== wantTitle ||
      existing.body !== wantBody ||
      currentMilestoneTitle !== item.milestone;

    if (changed) {
      console.log(`  ~ Updating  #${existing.number} (${item.id})`);
      updateIssue(existing.number, item, milestoneNumber);
    } else {
      console.log(`  = No change #${existing.number} (${item.id})`);
    }

    if (existing.state === "CLOSED") {
      console.log(`  ↑ Reopening #${existing.number} (${item.id}) — still in backlog`);
      reopenIssue(existing.number);
    }
  }

  // Close issues whose IDs were removed from the file
  for (const [id, issue] of Object.entries(byID)) {
    if (!activeIDs.has(id) && issue.state === "OPEN") {
      console.log(`  × Closing   #${issue.number} (${id}) — removed from backlog/roadmap`);
      closeIssue(issue.number);
    }
  }

  console.log("\nDone.\n");
}

main();
