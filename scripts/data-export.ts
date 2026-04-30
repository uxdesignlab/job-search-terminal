import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getRawDatabase, migrateDatabase } from "../src/lib/db/client";

const exportDirectory = path.join(process.cwd(), "output", "exports");
const exportPath = path.join(exportDirectory, `js-export-${timestamp()}.json`);

mkdirSync(exportDirectory, { recursive: true });

const database = getRawDatabase();
migrateDatabase(database);

const exportData = {
  exportedAt: new Date().toISOString(),
  profile: database.prepare("select * from user_profile").all(),
  skills: database.prepare("select * from skill_inventory").all(),
  roleDirections: database.prepare("select * from role_directions").all(),
  resumes: database.prepare("select * from resumes").all(),
  jobs: database.prepare("select * from jobs").all(),
  evaluations: database.prepare("select * from evaluations").all(),
  generatedDocuments: database.prepare("select * from generated_documents").all(),
  applications: database.prepare("select * from applications").all(),
  applicationAnswerDrafts: database.prepare("select * from application_answer_drafts").all(),
  activityLog: database.prepare("select * from activity_log").all()
};

database.close();

writeFileSync(exportPath, `${JSON.stringify(exportData, null, 2)}\n`);

console.log(`Data export written: ${exportPath}`);

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}

