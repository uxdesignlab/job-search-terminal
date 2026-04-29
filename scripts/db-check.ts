import assert from "node:assert/strict";
import { getApplications, getDashboardMetrics, getJobById, getJobs, getResumes, getUserProfile } from "../src/lib/db/queries";

const profile = getUserProfile();
const jobs = getJobs();
const applications = getApplications();
const resumes = getResumes();
const metrics = getDashboardMetrics();
const detailJob = getJobById("northstar-principal-product-designer");

assert.equal(profile.id, "pavel");
assert.equal(resumes.length, 5);
assert.equal(jobs.length, 5);
assert.equal(applications.length, 4);
assert.equal(metrics.length, 6);
assert.ok(detailJob);
assert.equal(detailJob.company, "Northstar AI");
assert.ok(applications.some((application) => application.company === "SignalWorks"));

console.log("Database check passed");
