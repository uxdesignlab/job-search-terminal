import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.JS_BASE_URL ?? "http://localhost:3000";
const chromePath = process.env.CHROME_EXECUTABLE_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshotRoot = path.join(process.cwd(), "output", "quality", "screenshots");

const routes = [
  { path: "/dashboard", label: "Dashboard", requiredText: "Dashboard" },
  { path: "/profile", label: "Profile", requiredText: "Profile" },
  { path: "/strategy", label: "Strategy", requiredText: "Strategy" },
  { path: "/jobs", label: "Jobs", requiredText: "Jobs" },
  { path: "/jobs/northstar-principal-product-designer", label: "Job detail", requiredText: "Application tracker" },
  { path: "/applications", label: "Applications", requiredText: "Application funnel" },
  { path: "/resumes", label: "Resumes", requiredText: "Generated documents" },
  { path: "/settings", label: "Settings", requiredText: "Settings" }
];

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 }
];

type PageIssue = {
  type: string;
  detail: string;
};

mkdirSync(screenshotRoot, { recursive: true });

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true
  });

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();

      for (const route of routes) {
        const response = await page.goto(new URL(route.path, baseUrl).toString(), { waitUntil: "networkidle" });
        assert.ok(response?.ok(), `${route.label} did not return an OK response`);
        await page.waitForSelector("main");

        const bodyText = await page.locator("body").innerText();
        assert.ok(bodyText.includes(route.requiredText), `${route.label} did not render expected content`);

        const fileName = `${viewport.name}-${route.path.replaceAll("/", "-").replace(/^-/, "") || "home"}.png`;
        await page.screenshot({ fullPage: true, path: path.join(screenshotRoot, fileName) });

        const issues = await page.evaluate(runAccessibilityChecks);
        assert.deepEqual(issues, [], `${route.label} ${viewport.name} accessibility issues:\n${JSON.stringify(issues, null, 2)}`);

        await verifyKeyboardFocus(page);
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`Quality check passed. Screenshots written to ${screenshotRoot}`);
}

async function verifyKeyboardFocus(page: import("playwright-core").Page) {
  const focusIssues: string[] = [];

  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
    const result = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) {
        return null;
      }

      const style = window.getComputedStyle(element);
      const label = element.textContent?.trim() || element.getAttribute("aria-label") || element.getAttribute("name") || element.tagName;
      const hasVisibleFocus = style.outlineStyle !== "none" || style.boxShadow !== "none";
      return { label, hasVisibleFocus };
    });

    if (result && !result.hasVisibleFocus) {
      focusIssues.push(result.label);
    }
  }

  assert.deepEqual(focusIssues, [], `Focused elements without visible focus: ${focusIssues.join(", ")}`);
}

function runAccessibilityChecks(): PageIssue[] {
  const issues: PageIssue[] = [];
  const mainCount = document.querySelectorAll("main").length;
  const h1Count = document.querySelectorAll("h1").length;

  if (mainCount !== 1) {
    issues.push({ type: "landmark", detail: `Expected one main landmark, found ${mainCount}` });
  }

  if (h1Count < 1) {
    issues.push({ type: "heading", detail: "Expected at least one h1" });
  }

  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")];
  let previousLevel = 0;
  for (const heading of headings) {
    const level = Number(heading.tagName.slice(1));
    if (previousLevel > 0 && level - previousLevel > 1) {
      issues.push({ type: "heading", detail: `Heading level jumps from h${previousLevel} to h${level}` });
    }
    previousLevel = level;
  }

  for (const control of [...document.querySelectorAll("input, select, textarea")]) {
    if ((control as HTMLInputElement).type === "hidden") {
      continue;
    }
    if (!accessibleName(control)) {
      issues.push({ type: "label", detail: `${control.tagName.toLowerCase()} is missing an accessible name` });
    }
  }

  for (const element of [...document.querySelectorAll("a, button")]) {
    if (!accessibleName(element)) {
      issues.push({ type: "name", detail: `${element.tagName.toLowerCase()} is missing an accessible name` });
    }
  }

  for (const element of [...document.querySelectorAll("p, span, a, button, label, th, td, h1, h2, h3")].slice(0, 600)) {
    if (!isVisible(element) || !element.textContent?.trim()) {
      continue;
    }

    const style = window.getComputedStyle(element);
    const foreground = parseColor(style.color);
    const background = effectiveBackground(element);
    if (!foreground || !background) {
      continue;
    }

    const ratio = contrastRatio(foreground, background);
    const fontSize = Number.parseFloat(style.fontSize);
    const fontWeight = Number.parseInt(style.fontWeight, 10);
    const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
    const requiredRatio = isLargeText ? 3 : 4.5;

    if (ratio < requiredRatio) {
      issues.push({
        type: "contrast",
        detail: `${element.tagName.toLowerCase()} "${element.textContent.trim().slice(0, 48)}" has ${ratio.toFixed(2)}:1 contrast`
      });
    }
  }

  return issues;

  function accessibleName(element: Element) {
    const ariaLabel = element.getAttribute("aria-label");
    const ariaLabelledBy = element.getAttribute("aria-labelledby");
    if (ariaLabel?.trim()) return ariaLabel.trim();
    if (ariaLabelledBy && document.getElementById(ariaLabelledBy)?.textContent?.trim()) return ariaLabelledBy;

    const id = element.getAttribute("id");
    if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim()) return id;
    return element.textContent?.trim() ?? "";
  }

  function isVisible(element: Element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function effectiveBackground(element: Element): [number, number, number] | null {
    let current: Element | null = element;
    let composed: [number, number, number, number] | null = null;

    while (current) {
      const color = parseColor(window.getComputedStyle(current).backgroundColor);
      if (color) {
        composed = composed ? composite(composed, color) : color;
        if (composed[3] >= 0.99) {
          return [composed[0], composed[1], composed[2]];
        }
      }
      current = current.parentElement;
    }

    const bodyColor = parseColor(window.getComputedStyle(document.body).backgroundColor);
    if (bodyColor) {
      const finalColor = composed ? composite(composed, bodyColor) : bodyColor;
      return [finalColor[0], finalColor[1], finalColor[2]];
    }

    return composed ? [composed[0], composed[1], composed[2]] : null;
  }

  function parseColor(value: string): [number, number, number, number] | null {
    const normalized = value.trim();
    if (normalized === "transparent") {
      return null;
    }

    const commaRgb = normalized.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (commaRgb) {
      return [Number(commaRgb[1]), Number(commaRgb[2]), Number(commaRgb[3]), Number(commaRgb[4] ?? 1)];
    }

    const spaceRgb = normalized.match(/rgba?\((\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\)/);
    if (spaceRgb) {
      return [Number(spaceRgb[1]), Number(spaceRgb[2]), Number(spaceRgb[3]), Number(spaceRgb[4] ?? 1)];
    }

    const srgb = normalized.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
    if (srgb) {
      return [
        Math.round(Number(srgb[1]) * 255),
        Math.round(Number(srgb[2]) * 255),
        Math.round(Number(srgb[3]) * 255),
        Number(srgb[4] ?? 1)
      ];
    }

    return null;
  }

  function composite(foreground: [number, number, number, number], background: [number, number, number, number]): [number, number, number, number] {
    const alpha = foreground[3] + background[3] * (1 - foreground[3]);
    if (alpha === 0) {
      return [0, 0, 0, 0];
    }

    return [
      Math.round((foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / alpha),
      Math.round((foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / alpha),
      Math.round((foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / alpha),
      alpha
    ];
  }

  function contrastRatio(foreground: [number, number, number, number], background: [number, number, number]) {
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return (lighter + 0.05) / (darker + 0.05);
  }

  function luminance(rgb: [number, number, number] | [number, number, number, number]) {
    const [r, g, b] = rgb.slice(0, 3).map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
}
