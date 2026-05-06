import assert from "node:assert/strict";
import { getApplications, getDashboardMetrics, getJobs, getResumes, getUserProfile } from "../src/lib/db/queries";

const profile = getUserProfile();
const jobs = getJobs();
const applications = getApplications();
const resumes = getResumes();
const metrics = getDashboardMetrics();

assert.equal(profile.id, "pavel");
assert.equal(profile.name, "");
assert.deepEqual(profile.targetRoles, []);
assert.equal(resumes.length, 1);
assert.equal(resumes[0]?.sourceFile, "");
assert.equal(jobs.length, 0);
assert.equal(applications.length, 0);
assert.equal(metrics.length, 7);

console.log("Database check passed");
