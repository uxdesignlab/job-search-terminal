#!/usr/bin/env node
/**
 * Syncs docs/backlog.md to GitHub Issues.
 *
 * Rules:
 *   - Items in backlog.md that have no open/closed issue → create
 *   - Items whose title or body changed → update the existing issue
 *   - Items still in backlog.md whose issue was closed → reopen
 *   - Items removed from backlog.md whose issue is still open → close
 *
 * Usage:
 *   node scripts/sync-backlog.js            # live run
 *   node scripts/sync-backlog.js --dry-run  # print what would happen
 *
 * Requires: gh CLI authenticated with repo + issues:write scope.
 * In GitHub Actions the GITHUB_TOKEN env var is used automatically.
 */

"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO = "uxdesignlab/job-search-terminal";
const BACKLOG_PATH = path.join(__dirname, "../docs/backlog.md");
const BACKLOG_LABEL = "backlog";
const DRY_RUN = process.argv.includes("--dry-run");

const AREA_FROM_PREFIX = {
  OB: "area: onboarding",
  RP: "area: resume-parser",
  RB: "area: resume-builder",
  DX: "area: docs",
};

const SEVERITY_LABEL = {
  blocker: "severity: blocker",
  high: "severity: high",
  medium: "severity: medium",
  low: "severity: low",
};

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

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseBacklog(content) {
  const items = [];
  let severity = "low";
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const secMatch = line.match(/^## (Blocker|High|Medium|Low)\b/i);
    if (secMatch) {
      severity = secMatch[1].toLowerCase();
      i++;
      continue;
    }

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
      const body = bodyLines.join("\n").trim();
      const prefix = id.split("-")[0];
      const area = AREA_FROM_PREFIX[prefix] ?? null;
      items.push({ id, title, body, severity, area });
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
  return `${item.body}\n\n---\n*Synced automatically from [\`docs/backlog.md\`](../../blob/main/docs/backlog.md)*`;
}

function labelsFor(item) {
  const labels = [BACKLOG_LABEL, SEVERITY_LABEL[item.severity] ?? "severity: low"];
  if (item.area) labels.push(item.area);
  return labels;
}

// ---------------------------------------------------------------------------
// GitHub helpers
// ---------------------------------------------------------------------------

function listBacklogIssues() {
  const raw = run([
    "issue", "list",
    "--label", BACKLOG_LABEL,
    "--state", "all",
    "--json", "number,title,state,body",
    "--limit", "500",
  ]);
  return JSON.parse(raw);
}

function createIssue(item) {
  const labelArgs = labelsFor(item).flatMap((l) => ["--label", l]);
  run([
    "issue", "create",
    "--title", issueTitle(item),
    "--body", issueBody(item),
    ...labelArgs,
  ]);
}

function updateIssue(number, item) {
  const labelArgs = labelsFor(item).flatMap((l) => ["--add-label", l]);
  run([
    "issue", "edit", String(number),
    "--title", issueTitle(item),
    "--body", issueBody(item),
    ...labelArgs,
  ]);
}

function closeIssue(number) {
  run([
    "issue", "close", String(number),
    "--comment", "Removed from `docs/backlog.md` — closing automatically.",
  ]);
}

function reopenIssue(number) {
  run(["issue", "reopen", String(number)]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log(`\nSyncing ${BACKLOG_PATH} → github.com/${REPO}/issues\n`);

  const content = fs.readFileSync(BACKLOG_PATH, "utf8");
  const items = parseBacklog(content);
  console.log(`Parsed ${items.length} backlog items\n`);

  const ghIssues = listBacklogIssues();
  const byID = {};
  for (const issue of ghIssues) {
    const m = issue.title.match(/^\[([A-Z]+-\d+)\]/);
    if (m) byID[m[1]] = issue;
  }

  const activeIDs = new Set(items.map((item) => item.id));

  for (const item of items) {
    const existing = byID[item.id];

    if (!existing) {
      console.log(`  + Creating  ${item.id}: ${item.title}`);
      createIssue(item);
      continue;
    }

    const wantTitle = issueTitle(item);
    const wantBody = issueBody(item);
    const changed = existing.title !== wantTitle || existing.body !== wantBody;

    if (changed) {
      console.log(`  ~ Updating  #${existing.number} (${item.id})`);
      updateIssue(existing.number, item);
    } else {
      console.log(`  = No change #${existing.number} (${item.id})`);
    }

    if (existing.state === "CLOSED") {
      console.log(`  ↑ Reopening #${existing.number} (${item.id}) — still in backlog`);
      reopenIssue(existing.number);
    }
  }

  for (const [id, issue] of Object.entries(byID)) {
    if (!activeIDs.has(id) && issue.state === "OPEN") {
      console.log(`  × Closing   #${issue.number} (${id}) — removed from backlog`);
      closeIssue(issue.number);
    }
  }

  console.log("\nDone.\n");
}

main();
