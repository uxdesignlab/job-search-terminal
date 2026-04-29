# CareerOps Reuse Map

JS uses CareerOps as an implementation foundation, not as the user experience.
The dashboard owns the workflow. CareerOps patterns and engine components are
adapted behind dashboard actions.

## Source References

- Repository: https://github.com/santifer/career-ops
- Product write-up: https://santifer.io/career-ops-system
- Codex setup: `AGENTS.md`, `docs/CODEX.md`
- Data contract: `DATA_CONTRACT.md`

## Reuse Later

These pieces should be reused with minimal behavioral change once feature work
starts:

| CareerOps component | JS use |
|---|---|
| `scan.mjs` API detection | Greenhouse, Ashby, and Lever detection/parsing |
| `scan.mjs` title filters | Initial job relevance filtering |
| `scan.mjs` dedup strategy | URL and company/role duplicate prevention |
| `generate-pdf.mjs` | Playwright HTML-to-PDF generation |
| ATS text normalization | Preserve PDF parser compatibility |
| `templates/cv-template.html` | Starting point for ATS-safe resume output |
| `templates/portals.example.yml` | Shape for source configuration |
| `templates/states.yml` | Status normalization reference |

## Adapt

These are valuable, but must be translated into JS product architecture:

| CareerOps component | Adaptation |
|---|---|
| `modes/auto-pipeline.md` | Dashboard-triggered flow: evaluate, tailor, track |
| `modes/oferta.md` | Job evaluation prompt/service using UX/product/design archetypes |
| `modes/pdf.md` | Resume-lane selection plus tailored PDF generation |
| `modes/apply.md` | Application answer assistant that saves draft answers |
| `modes/pipeline.md` | Job inbox service backed by SQLite later |
| `modes/tracker.md` | Application status service backed by SQLite later |
| `modes/scan.md` | Scan action with database writes and dashboard status |
| `dashboard/` | Data ideas and pipeline grouping, not the terminal UI |
| `config/profile.example.yml` | Multi-resume Pavel profile structure |

## Replace

These CareerOps assumptions conflict with JS:

- CLI and slash-command primary interaction.
- Markdown tracker as the primary data store.
- One-resume `cv.md` assumption.
- AI/engineering role taxonomy as the default scoring model.
- Claude/OpenCode/Gemini-first routing.
- Terminal dashboard as the main interface.
- User-facing script names and file paths.

## Defer

These are useful after the dashboard foundation works:

- Gemini/search adapters.
- Batch processing workers.
- Liveness checking.
- Follow-up cadence automation.
- Go TUI dashboard compatibility.
- Cloudflare Tunnel.
- Fully hosted Cloudflare SaaS version.

## Resume Lanes

Current source assets:

| Lane | Source |
|---|---|
| Principal / Product Design Leadership | `assets/resume-principal-product-design.pdf` |
| UX Design | `assets/resume-ux-design.pdf` |
| Accessibility / Design Systems | `assets/resume-accessibility.pdf` |
| Design Operations | `assets/resume-operations.pdf` |
| Teaching / UX Education | `assets/resume-teaching.pdf` |

## Phase 1 Boundary

Do not copy or adapt CareerOps code during Phase 1. The output of this phase is
the scaffold, docs, and implementation map. Feature work begins after this map
is reviewed.
