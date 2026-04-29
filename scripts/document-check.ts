import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getGeneratedDocumentById } from "../src/lib/db/queries";
import { generateTailoredResume } from "../src/lib/documents/resume-generator";

async function main() {
  const result = await generateTailoredResume("northstar-principal-product-designer");
  const document = getGeneratedDocumentById(result.id);

  assert.ok(document);
  assert.ok(document.content.includes("Professional Summary"));
  assert.ok(document.content.includes("Core Competencies"));
  assert.ok(document.pdfUrl.endsWith(".pdf"));
  assert.ok(document.htmlUrl.endsWith(".html"));
  assert.ok(document.keywordCoverage >= 0);
  assert.ok(document.tailoringPlan.length >= 4);

  const pdf = await readFile(document.pdfUrl);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");

  console.log("Document generation check passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
