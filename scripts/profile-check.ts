import assert from "node:assert/strict";
import { getResumes, getRoleDirections, getSkills, getUserProfile } from "../src/lib/db/queries";

const profile = getUserProfile();
const resumes = getResumes();
const skills = getSkills();
const roleDirections = getRoleDirections();

assert.ok(profile.careerIntent.length > 0);
assert.ok(profile.desiredIndustries.length > 0);
assert.equal(resumes.length, 5);
assert.ok(resumes.every((resume) => resume.wordCount > 100));
assert.ok(resumes.every((resume) => resume.evidence.length > 0));
assert.ok(skills.length >= 5);
assert.equal(new Set(skills.map((skill) => skill.skillName.toLowerCase())).size, skills.length);
assert.ok(roleDirections.some((direction) => direction.rationale.includes("Evidence found across resume lanes")));

console.log("Profile intelligence check passed");
