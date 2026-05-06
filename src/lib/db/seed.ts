import type Database from "better-sqlite3";

const toJson = (value: unknown) => JSON.stringify(value);

const emptyUserProfile = {
  id: "pavel",
  name: "",
  location: "",
  portfolio: "",
  currentSearchGoal: "",
  urgency: "",
  direction: "",
  constraints: [],
  targetRoles: [],
  strongestSkills: [],
  skillsToUseMore: [],
  skillsToUseLess: [],
  desiredIndustries: [],
  compensationNeeds: "",
  workPreferences: [],
  dealBreakers: [],
  careerIntent: "",
  careerChangeInterest: "",
  confidenceLevel: ""
};

const defaultResumeLane = {
  id: "primary-resume",
  name: "Resume",
  sourceFile: "",
  status: "active",
  activeStatus: true
};

export function seedDatabaseIfEmpty(database: Database.Database) {
  const existing = database.prepare("select count(*) as count from user_profile").get() as { count: number };
  if (existing.count > 0) {
    return false;
  }

  seedDatabase(database);
  return true;
}

export function seedDatabase(database: Database.Database) {
  const insertProfile = database.prepare(`
    insert or ignore into user_profile (
      id, name, location, portfolio, current_search_goal, urgency, direction,
      constraints_json, target_roles_json, strongest_skills_json,
      skills_to_use_more_json, skills_to_use_less_json,
      desired_industries_json, compensation_needs, work_preferences_json,
      deal_breakers_json, career_intent, career_change_interest, confidence_level
    ) values (
      @id, @name, @location, @portfolio, @currentSearchGoal, @urgency, @direction,
      @constraintsJson, @targetRolesJson, @strongestSkillsJson,
      @skillsToUseMoreJson, @skillsToUseLessJson,
      @desiredIndustriesJson, @compensationNeeds, @workPreferencesJson,
      @dealBreakersJson, @careerIntent, @careerChangeInterest, @confidenceLevel
    )
  `);

  const insertResume = database.prepare(`
    insert or ignore into resumes (id, name, source_file, status, active_status)
    values (@id, @name, @sourceFile, @status, @activeStatus)
  `);

  const seed = database.transaction(() => {
    insertProfile.run({
      ...emptyUserProfile,
      constraintsJson: toJson(emptyUserProfile.constraints),
      targetRolesJson: toJson(emptyUserProfile.targetRoles),
      strongestSkillsJson: toJson(emptyUserProfile.strongestSkills),
      skillsToUseMoreJson: toJson(emptyUserProfile.skillsToUseMore),
      skillsToUseLessJson: toJson(emptyUserProfile.skillsToUseLess),
      desiredIndustriesJson: toJson(emptyUserProfile.desiredIndustries),
      workPreferencesJson: toJson(emptyUserProfile.workPreferences),
      dealBreakersJson: toJson(emptyUserProfile.dealBreakers)
    });

    insertResume.run({ ...defaultResumeLane, activeStatus: defaultResumeLane.activeStatus ? 1 : 0 });
  });

  seed();
}
