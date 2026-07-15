# Radar — personal prospection CRM (PWA)

Personal CRM for the owner (French robotics engineer going freelance; current
mission ends December 2026) to track target companies and contacts for his
freelance/CDI hunt. Refactor of a single-file React artifact (claude.ai +
window.storage) into a standalone mobile-first PWA he fully owns.

## Current phase

**Phase 0 — Scoping.** Questions asked to Martin (hosting / existing data /
post-parity improvements). Waiting for answers before any build work.

## Key constraints (from kickoff brief — hard rules)

- Stack: Vite + React + Tailwind. Mobile-first PWA, installable, offline-capable.
- No backend, no accounts, no analytics — 100% local data (prospect list is
  confidential). Persistence: localStorage or IndexedDB (justify choice) with a
  **versioned schema + migration path**, plus JSON export/import for backup.
- UI language: **French**. Code, comments, commits: **English**.
- Never lose or silently transform user data; explicit confirmation before any
  destructive action.
- **Feature parity first** — no scope creep without Martin's OK.
- Everything usable one-handed at 380px width.
- Design: keep current feel — slate/teal palette, cards, mono numerals,
  thumb-friendly bottom sheets.

## Source artifact status

`inputs/radar-artifact.jsx` was NOT retrievable — this repo started empty.
Rebuilding from the functional spec below. If Martin pastes the artifact code
or a "point pour Claude" export, store it under `inputs/` and treat it as the
functional reference (especially for the EXACT company status list, which the
spec says to reuse from the source).

## Functional spec (fallback reference — feature parity target)

Three tabs:

1. **TABLEAU** — editable mission-end date with J−XX countdown; "Relances du
   jour" (contacts with next follow-up due within ≤2 days, most urgent first,
   inline "Relance faite"); pipeline counters by company status (tap one →
   filtered company list); "📋 Copier le point pour Claude" button copying a
   plain-text summary (date, mission countdown, every company with
   type/status/notes, every contact with last contact + next follow-up) — this
   is how Martin reports to his AI coach; keep same spirit and completeness.
   Onboarding checklist when the app is empty.
2. **ENTREPRISES** — fields: name, sector, city, notes, type
   (Freelance / CDI / Les deux), statut (EXACT list from source — to confirm
   with Martin, see open questions), priority star. Text search + filters by
   type and status; priority-first sorting; floating + button to add;
   edit/delete via bottom sheet.
3. **CONTACTS** — fields: name, company (linkable to a company), role, notes,
   lastContact, nextFollowUp. "Relance faite" sets lastContact to today then
   offers rescheduling at +3 / +7 / +14 days or a custom date. Search; sorted
   by follow-up urgency; floating + button; bottom-sheet form.

## Roadmap

- **Phase 0** — Scoping (in French, max 3 questions): hosting, existing data
  (one-shot importer for pasted "point pour Claude" text if yes), post-parity
  improvements. ← WE ARE HERE
- **Phase 1** — Audit: ARCHITECTURE.md (data model, status list, date logic,
  behaviors); confirm ambiguities with Martin before coding.
- **Phase 2** — Build: storage layer isolated behind one module, date utils
  extracted, components split. Unit tests on date logic (countdown, "due
  within 2 days", +3/+7/+14 rescheduling) and export→import round-trip test.
- **Phase 3** — Ship: PWA manifest + service worker, deploy, URL + short
  French install note for phone home screen. Then approved improvements,
  one at a time.

## Decisions

- App lives at the **repo root** (repo was empty and is dedicated to this
  project; simplest for CI/deploy).

## Open questions

1. Hosting: Vercel / GitHub Pages / local only? (asked in Phase 0)
2. Existing data to import? If yes Martin pastes a "point pour Claude" export
   → build one-shot importer for that text format. (asked in Phase 0)
3. Which post-parity improvements: activity stats, due-today badge, LinkedIn
   URL field on contacts, dark mode? (asked in Phase 0)
4. EXACT company status list (source artifact unavailable) — recover from
   Martin's pasted export/artifact, else propose a list in Phase 1 and get it
   validated before coding.
