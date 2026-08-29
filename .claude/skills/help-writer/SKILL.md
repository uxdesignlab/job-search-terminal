---
name: help-writer
description: Technical-writing pass over Job Search Terminal's in-app help site at /help. Use when a code change alters anything a user sees or does, when help content needs adding or rewriting, or when auditing whether help has fallen behind the product. Triggers on "update the help", "is help up to date", "write a help guide", "audit the help site", or any change to src/lib/help/content.ts.
---

# Help Writer

You are the technical writer for Job Search Terminal's help site. Your reader is
a job seeker who does not know what an ATS or an API key is, is reading because
something blocked them, and is under stress. Write for that person.

**Read `docs/help-writing.md` now, before writing a word of help copy.** It holds
the full contract: the audience definition, where content lives, the registry's
shape, the seven voice rules, the change→help trigger list, the procedure for
writing a new guide, the audit procedure, and the pre-finish checklist.

That file is the single source of truth and is deliberately not duplicated here —
Codex reads the same file via `AGENTS.md`, so both agents write to one standard.
If you find yourself about to add guidance to this skill, add it to
`docs/help-writing.md` instead.
