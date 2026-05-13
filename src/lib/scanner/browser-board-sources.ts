export const BROWSER_BOARD_SOURCES = [
  "linkedin",
  "wellfound",
  "workatastartup",
  "glassdoor",
  "indeed",
  "monster"
] as const;

export type BrowserBoardSource = (typeof BROWSER_BOARD_SOURCES)[number];

export type BrowserBoardScanType =
  | "linkedin-claude-scan"
  | "wellfound-browser-scan"
  | "workatastartup-browser-scan"
  | "glassdoor-browser-scan"
  | "indeed-browser-scan"
  | "monster-browser-scan";

const SOURCE_LABELS: Record<BrowserBoardSource, string> = {
  linkedin: "LinkedIn",
  wellfound: "Wellfound",
  workatastartup: "Work at a Startup",
  glassdoor: "Glassdoor",
  indeed: "Indeed",
  monster: "Monster"
};

const SOURCE_TO_SCAN_TYPE: Record<BrowserBoardSource, BrowserBoardScanType> = {
  linkedin: "linkedin-claude-scan",
  wellfound: "wellfound-browser-scan",
  workatastartup: "workatastartup-browser-scan",
  glassdoor: "glassdoor-browser-scan",
  indeed: "indeed-browser-scan",
  monster: "monster-browser-scan"
};

const SCAN_TYPE_TO_SOURCE: Record<BrowserBoardScanType, BrowserBoardSource> = {
  "linkedin-claude-scan": "linkedin",
  "wellfound-browser-scan": "wellfound",
  "workatastartup-browser-scan": "workatastartup",
  "glassdoor-browser-scan": "glassdoor",
  "indeed-browser-scan": "indeed",
  "monster-browser-scan": "monster"
};

export function isBrowserBoardSource(value: unknown): value is BrowserBoardSource {
  return typeof value === "string" && BROWSER_BOARD_SOURCES.includes(value as BrowserBoardSource);
}

export function isBrowserBoardScanType(value: unknown): value is BrowserBoardScanType {
  return typeof value === "string" && value in SCAN_TYPE_TO_SOURCE;
}

export function browserBoardSourceLabel(source: BrowserBoardSource): string {
  return SOURCE_LABELS[source];
}

export function scanTypeToBrowserBoardSource(scanType: BrowserBoardScanType): BrowserBoardSource {
  return SCAN_TYPE_TO_SOURCE[scanType];
}

export function browserBoardSourceToScanType(source: BrowserBoardSource): BrowserBoardScanType {
  return SOURCE_TO_SCAN_TYPE[source];
}

export function sourceLabelFromJobSource(source: string): string | null {
  if (source === "manual") return "Manual";
  if (isBrowserBoardScanType(source)) return browserBoardSourceLabel(scanTypeToBrowserBoardSource(source));
  return null;
}
