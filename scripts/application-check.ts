import assert from "node:assert/strict";
import {
  getActivity,
  getApplicationAnswerDrafts,
  getApplicationByJobId,
  getFunnelStages,
  updateApplicationStatus
} from "../src/lib/db/queries";
import { prepareApplicationAnswers } from "../src/lib/applications/application-assistant";

const jobId = "northstar-principal-product-designer";
const customQuestion = "Describe a product decision you influenced with research.";

prepareApplicationAnswers(jobId, [customQuestion]);
const drafts = getApplicationAnswerDrafts(jobId);

assert.ok(drafts.length >= 6);
assert.ok(drafts.some((draft) => draft.question === customQuestion));
assert.ok(drafts.every((draft) => draft.answer.length > 80));

for (const status of ["Applied", "Follow-up needed", "Interviewing", "Rejected", "Archived", "Follow-up needed"] as const) {
  updateApplicationStatus({
    jobId,
    status,
    followUpDate: "2026-05-06",
    notes: "Phase 8 verification note"
  });
}

const application = getApplicationByJobId(jobId);
assert.ok(application);
assert.equal(application.status, "Follow-up needed");
assert.equal(application.followUpDate, "2026-05-06");

const funnel = getFunnelStages();
assert.ok(funnel.some((stage) => stage.label === "Follow-up needed" && stage.value >= 1));
assert.ok(getActivity().some((entry) => entry.action.includes("Application status updated")));

console.log("Application assistant and tracker check passed");

