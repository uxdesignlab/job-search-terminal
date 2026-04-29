import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { getRawDatabase, migrateDatabase, getDatabasePath } from "../src/lib/db/client";
import { seedDatabaseIfEmpty } from "../src/lib/db/seed";
import { extractEvidence, normalizeResumeText, skillSignals, wordCount } from "../src/lib/profile/intelligence";

type ResumeRow = {
  id: string;
  name: string;
  source_file: string;
};

async function main() {
  const database = getRawDatabase();
  migrateDatabase(database);
  seedDatabaseIfEmpty(database);

  const resumes = database.prepare("select id, name, source_file from resumes order by name").all() as ResumeRow[];

  const updateResume = database.prepare(`
    update resumes set
      extracted_text = @extractedText,
      extracted_at = @extractedAt,
      word_count = @wordCount,
      evidence_json = @evidenceJson,
      status = @status
    where id = @id
  `);

  const upsertSkill = database.prepare(`
    insert or replace into skill_inventory (
      id, user_profile_id, skill_name, skill_category, evidence_source,
      strength_level, market_relevance, user_interest_level, use_preference
    ) values (
      @id, 'pavel', @skillName, @skillCategory, @evidenceSource,
      @strengthLevel, @marketRelevance, @userInterestLevel, @usePreference
    )
  `);

  const deleteDuplicateSkills = database.prepare(`
    delete from skill_inventory
    where lower(skill_name) = lower(@skillName)
      and id != @id
  `);

  const allEvidence = new Map<string, { category: string; sources: string[] }>();

  for (const resume of resumes) {
    const filePath = path.join(process.cwd(), resume.source_file);
    const buffer = readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    const text = normalizeResumeText(parsed.text);
    const evidence = extractEvidence(text);

    updateResume.run({
      id: resume.id,
      extractedText: text,
      extractedAt: new Date().toISOString(),
      wordCount: wordCount(text),
      evidenceJson: JSON.stringify(evidence.map((item) => `${item.skill}: ${item.snippet}`)),
      status: "extracted"
    });

    for (const item of evidence) {
      const existing = allEvidence.get(item.skill) ?? { category: item.category, sources: [] };
      existing.sources.push(resume.name);
      allEvidence.set(item.skill, existing);
    }
  }

  for (const signal of skillSignals) {
    const evidence = allEvidence.get(signal.name);
    if (!evidence) {
      continue;
    }

    const skillId = signal.name.toLowerCase().replaceAll(" ", "-");

    deleteDuplicateSkills.run({
      id: skillId,
      skillName: signal.name
    });

    upsertSkill.run({
      id: skillId,
      skillName: signal.name,
      skillCategory: evidence.category,
      evidenceSource: [...new Set(evidence.sources)].join(", "),
      strengthLevel: evidence.sources.length > 1 ? "Strong" : "Emerging",
      marketRelevance: "High",
      userInterestLevel: signal.name === "AI product strategy" ? "Use more" : "Maintain",
      usePreference: signal.name === "AI product strategy" || signal.name === "Executive storytelling" ? "use_more" : "maintain"
    });
  }

  const roleEvidenceSummary = [...allEvidence.keys()].slice(0, 6).join(", ");

  database
    .prepare(
      `update role_directions set
        rationale = rationale || ' Evidence found across resume lanes: ' || @roleEvidenceSummary
      where rationale not like '%Evidence found across resume lanes:%'`
    )
    .run({ roleEvidenceSummary });

  database
    .prepare(
      `insert into activity_log (id, entity_type, entity_id, action, timestamp, details_json)
       values (@id, 'profile', 'pavel', 'Resume text extracted and profile intelligence refreshed', @timestamp, @detailsJson)`
    )
    .run({
      id: `profile-extract-${Date.now()}`,
      timestamp: new Date().toISOString(),
      detailsJson: JSON.stringify({ resumes: resumes.length, skills: allEvidence.size })
    });

  database.close();

  console.log(`Profile intelligence extracted from ${resumes.length} resumes into ${getDatabasePath()}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
