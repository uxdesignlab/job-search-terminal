import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { normalizeTextForAts } from "./ats-normalize";

const defaultChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export type PdfRenderResult = {
  htmlPath: string;
  pdfPath: string;
  pageCount: number;
  sizeBytes: number;
  atsReplacements: Record<string, number>;
};

export async function renderHtmlToPdf(input: {
  html: string;
  htmlPath: string;
  pdfPath: string;
  format: "letter" | "a4";
}): Promise<PdfRenderResult> {
  await mkdir(path.dirname(input.htmlPath), { recursive: true });
  await mkdir(path.dirname(input.pdfPath), { recursive: true });

  const normalized = normalizeTextForAts(input.html);
  await writeFile(input.htmlPath, normalized.html, "utf-8");

  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? defaultChromePath,
    headless: true
  });

  try {
    const page = await browser.newPage();
    await page.setContent(await readFile(input.htmlPath, "utf-8"), {
      waitUntil: "networkidle"
    });
    await page.evaluate(() => document.fonts.ready);
    const pdfBuffer = await page.pdf({
      format: input.format,
      printBackground: true,
      margin: {
        top: "0.6in",
        right: "0.6in",
        bottom: "0.6in",
        left: "0.6in"
      },
      preferCSSPageSize: false
    });

    await writeFile(input.pdfPath, pdfBuffer);
    const pdfText = pdfBuffer.toString("latin1");
    const pageCount = (pdfText.match(/\/Type\s*\/Page[^s]/g) ?? []).length;

    return {
      htmlPath: input.htmlPath,
      pdfPath: input.pdfPath,
      pageCount,
      sizeBytes: pdfBuffer.length,
      atsReplacements: normalized.replacements
    };
  } finally {
    await browser.close();
  }
}
