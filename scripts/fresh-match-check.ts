import { dedupeFreshMatches, filterFreshScanMatches } from "../src/lib/jobs/fresh-match-dedupe";

const jobs = [
  {
    company: "AIOS (YC W20/S21)",
    title: "Head of Product Design at AIOS - Remote, $125k-250k/yr inc equity",
    url: "https://jobs.ashbyhq.com/Aios/3e414401?utm_source=indeed",
    originalPostingKey: "indeed:123",
    isDuplicate: false,
  },
  {
    company: "Aios",
    title: "Head of Product Design at AIOS — Remote, $125k-250k/yr inc equity",
    url: "https://jobs.ashbyhq.com/Aios/3e414401",
    originalPostingKey: "",
    isDuplicate: false,
  },
  {
    company: "Different Company",
    title: "Head of Product Design",
    url: "https://example.com/jobs/1",
    originalPostingKey: "",
    isDuplicate: false,
  },
  {
    company: "Another Company",
    title: "Design Director",
    url: "https://example.com/jobs/2",
    originalPostingKey: "",
    isDuplicate: true,
  },
];

const deduped = dedupeFreshMatches(jobs);
if (deduped.length !== 2) throw new Error(`Expected 2 fresh matches, received ${deduped.length}.`);
if (deduped.some((job) => job.isDuplicate)) throw new Error("Known duplicate rows must be hidden from Fresh matches.");
if (!deduped.some((job) => job.company === "Different Company")) throw new Error("Distinct employers must remain visible.");

const scanJobs = [
  {
    id: "fresh-scan",
    company: "New Company",
    title: "Staff Product Designer",
    url: "https://example.com/jobs/fresh",
    originalPostingKey: "",
    isDuplicate: false,
    source: "adzuna-api-scan",
    status: "Found",
    firstSeenDate: "2026-05-31",
    datePosted: "2026-05-31T08:00:00Z",
    fitScore: 0,
  },
  {
    id: "unknown-posting-date",
    company: "Unknown Date Company",
    title: "Design Lead",
    url: "https://example.com/jobs/unknown-date",
    originalPostingKey: "",
    isDuplicate: false,
    source: "careerops",
    status: "Found",
    firstSeenDate: "2026-05-31",
    datePosted: null,
    fitScore: 0,
  },
  {
    id: "applied-job",
    company: "Applied Company",
    title: "Product Designer",
    url: "https://example.com/jobs/applied",
    originalPostingKey: "",
    isDuplicate: false,
    source: "careerops",
    status: "Found",
    firstSeenDate: "2026-05-31",
    datePosted: "2026-05-31T09:00:00Z",
    fitScore: 0,
  },
  {
    id: "rejected-job",
    company: "Rejected Company",
    title: "Design Manager",
    url: "https://example.com/jobs/rejected",
    originalPostingKey: "",
    isDuplicate: false,
    source: "careerops",
    status: "Rejected",
    firstSeenDate: "2026-05-31",
    datePosted: "2026-05-31T10:00:00Z",
    fitScore: 0,
  },
  {
    id: "manual-job",
    company: "Manual Company",
    title: "UX Designer",
    url: "https://example.com/jobs/manual",
    originalPostingKey: "",
    isDuplicate: false,
    source: "manual",
    status: "Found",
    firstSeenDate: "2026-05-31",
    datePosted: "2026-05-31T11:00:00Z",
    fitScore: 0,
  },
  {
    id: "old-unknown-date",
    company: "Old Company",
    title: "Product Design Lead",
    url: "https://example.com/jobs/old",
    originalPostingKey: "",
    isDuplicate: false,
    source: "careerops",
    status: "Found",
    firstSeenDate: "2026-05-20",
    datePosted: null,
    fitScore: 0,
  },
];

const filtered = filterFreshScanMatches(scanJobs, new Set(["applied-job"]), 72, new Date("2026-05-31T12:00:00Z"));
if (filtered.map((job) => job.id).join(",") !== "fresh-scan,unknown-posting-date") {
  throw new Error(`Expected only fresh scan discoveries, received ${filtered.map((job) => job.id).join(",")}.`);
}

console.log("Fresh matches check passed: only new, unprocessed scan discoveries are shown and duplicates stay hidden.");
