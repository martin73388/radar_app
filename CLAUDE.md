# Radar — personal prospection CRM (PWA)

Personal CRM for the app's owner — a French engineer running a personal
freelance/CDI job hunt — to track target companies and contacts. Refactor of a
single-file React artifact (claude.ai + window.storage) into a standalone
mobile-first PWA fully self-owned.

## Current phase

**SHIPPED & LIVE.** Deployed on GitHub Pages at
https://martin73388.github.io/**radar_app**/ (repo `10_Jobseeker` renamed to
**`radar_app`**, public; data repo for opt-in sync is **`radar_core`**,
private). `main` is the default branch and auto-deploys on every push
(Pages source = GitHub Actions; github-pages env allows `main`). 100 unit
tests, adversarial review passes, Playwright e2e at 380px (all flows + the
two-device sync, zero console errors).

Improvements delivered (post-ship, one at a time, validated by Martin):
LinkedIn field, due-today badge, activity stats, job-posting links (+ posted
date urgency), timestamped history/suivi on companies & contacts.
**Dark mode: DROPPED** — Martin is happy with the current dark theme
(2026-07-19). No open work; awaiting Martin's next request.

Note: commits show as "Unverified" on GitHub (no GPG signing in this env) —
cosmetic only; committer email is already noreply@anthropic.com.

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

## Decisions (validated by Martin)

- App lives at the **repo root** (repo was empty and is dedicated to this
  project; simplest for CI/deploy).
- **Hosting: GitHub Pages** from this repo via GitHub Actions
  (Vite `base=/10_Jobseeker/`). (Phase 0)
- **No data import needed** — Martin starts from zero; the app boots empty
  with the onboarding checklist. No one-shot text importer. (Phase 0)
- **Post-parity improvements: all four approved** — order: LinkedIn URL field
  → dark mode → due-today badge → activity stats. One at a time, each
  validated before the next. (Phase 0)
- **Company status list (8, validated)**: À contacter · Contacté ·
  En discussion · RDV prévu · Proposition envoyée · Gagné · Refusé/Sans suite
  · En veille — stored by stable keys, see ARCHITECTURE.md §3. (Phase 1)
- **"Relance faite" reschedule offsets (+3/+7/+14) count from TODAY**, not
  from the previous planned date. (Phase 1)
- **Contact→company: link to a company record OR free text**; deleting a
  company converts its contacts' links to free text, never deletes contacts.
  (Phase 1)
- **Martin's phone is Android** — install note targets Chrome/Android;
  icon badge via `setAppBadge` is well supported there. (Phase 1)
- **Persistence: localStorage** behind a single storage module — rationale in
  ARCHITECTURE.md §5.
- **Multi-device sync via private GitHub repo (opt-in)** — requested by
  Martin 2026-07-17, relaxing the "no external service" rule *only when he
  configures it*: data file in a private repo he owns, fine-grained PAT
  pasted per device (never in the code/bundle), Contents API with sha CAS,
  explicit conflict resolution. Design: ARCHITECTURE.md §10bis. Setup steps
  he must do himself (private repo + PAT): README.

## Open questions

None blocking. (Ship checklist lives in the task list / ARCHITECTURE.md.)
