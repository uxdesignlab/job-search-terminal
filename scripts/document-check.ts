import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getGeneratedDocumentById } from "../src/lib/db/queries";
import { keywordCoverageDetailsForText } from "../src/lib/documents/keyword-coverage";
import { generateTailoredResume } from "../src/lib/documents/resume-generator";

async function main() {
  const result = await generateTailoredResume("northstar-principal-product-designer");
  const document = getGeneratedDocumentById(result.id);

  assert.ok(document);
  assert.ok(document.content.includes("Jane Doe"));
  assert.ok(document.content.includes("City, State"));
  assert.ok(document.content.includes("Summary"));
  assert.ok(document.content.includes("Selected Impact"));
  assert.ok(document.content.includes("Professional Experience"));
  assert.ok(!document.content.includes("Core Competencies"));
  assert.ok(!document.content.includes("Projects"));
  assert.ok(document.pdfUrl.endsWith(".pdf"));
  assert.ok(document.htmlUrl.endsWith(".html"));
  assert.ok(document.keywordCoverage >= 0);
  assert.ok(document.tailoringPlan.length >= 4);

  const pdf = await readFile(document.pdfUrl);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");

  const strictKeywordCheck = keywordCoverageDetailsForText("Led usability testing for clinical workflows.", [
    "usability testing",
    "department of veterans affairs",
    "clinical workflows",
  ]);
  assert.deepEqual(strictKeywordCheck.covered, ["usability testing", "clinical workflows"]);
  assert.deepEqual(strictKeywordCheck.missing, ["department of veterans affairs"]);

  console.log("Document generation check passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
