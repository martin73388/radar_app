# Radar — Architecture

Reference document for the Radar PWA rebuild. The original artifact source was
not available, so this reconstructs the functional reference from the kickoff
spec (see CLAUDE.md). Hardened by an adversarial multi-agent design review
(2026-07-15); all Phase 1 ambiguities validated by Martin.

## 1. Stack

- **Vite + React 19 + Tailwind CSS 4** (per brief; latest stable majors).
- **vite-plugin-pwa** for manifest + service worker — offline precache,
  **update via prompt** (`registerType: 'prompt'`, see §8; never a silent
  mid-session reload).
- **Vitest** for unit tests (date logic, storage round-trip, migrations,
  conflict detection, export formatter).
- No backend, no accounts, no analytics, no external requests at runtime.
  All data stays on-device.
- Deploy: **GitHub Pages** from this repo via GitHub Actions
  (Phase 0 decision). Vite `base` must be `/10_Jobseeker/`.

## 2. Data model — schema v1

Single JSON document persisted as one unit:

```jsonc
{
  "schemaVersion": 1,
  "revision": 12,                     // increments on every save; multi-tab conflict guard (§5)
  "settings": {
    "missionEndDate": "YYYY-MM-DD | null",  // null until Martin sets it (fresh doc = null)
    "lastExportAt": "ISO datetime | null"   // set by a successful JSON export; drives the backup reminder
  },
  "companies": [
    {
      "id": "cmp_<random>",
      "name": "string (required)",
      "sector": "string",
      "city": "string",
      "notes": "string",
      "type": "freelance" | "cdi" | "both",     // UI: Freelance / CDI / Les deux
      "status": "<status key, see §3>",
      "priority": false,                        // priority star
      "createdAt": "ISO datetime",
      "updatedAt": "ISO datetime"
    }
  ],
  "contacts": [
    {
      "id": "cnt_<random>",
      "name": "string (required)",
      "companyId": "cmp_… | null",   // link to a company, preferred
      "companyName": "string",       // free-text fallback when not linked
      "role": "string",
      "notes": "string",
      "lastContact": "YYYY-MM-DD | null",
      "nextFollowUp": "YYYY-MM-DD | null",
      "createdAt": "ISO datetime",
      "updatedAt": "ISO datetime"
    }
  ]
}
```

Conventions:

- **User-facing dates are local calendar dates** (`YYYY-MM-DD` strings, no
  time, no timezone). `createdAt`/`updatedAt` are ISO datetimes for
  bookkeeping only, never used in date logic.
- **A fresh document contains no invented data**: `missionEndDate` is `null`
  until Martin sets it (this is what keeps onboarding step 3 incomplete —
  it completes when the value becomes non-null).
- IDs are prefixed random strings (`crypto.randomUUID()` based); prefix makes
  debugging and import validation easier.
- Company link on a contact: `companyId` wins when set (label resolved live
  from the company list); `companyName` free text is used when the contact's
  company isn't tracked as a prospect. UI offers both (pick existing / type
  free text). **[VALIDATED by Martin — Phase 1]**

## 3. Company status list

**[VALIDATED by Martin — Phase 1]** The brief says "reuse the EXACT status
list found in the source", but the source is unavailable and Martin starts
from zero; he validated this 8-status pipeline (stable keys + French labels +
palette):

| key             | label FR              | color  |
|-----------------|-----------------------|--------|
| `to_contact`    | À contacter           | slate  |
| `contacted`     | Contacté              | sky    |
| `in_discussion` | En discussion         | teal   |
| `meeting`       | RDV prévu             | violet |
| `proposal`      | Proposition envoyée   | amber  |
| `won`           | Gagné                 | emerald|
| `lost`          | Refusé / Sans suite   | rose   |
| `standby`       | En veille             | zinc   |

Statuses are stored by **key**; labels/colors live in one config module
(`src/config/statuses.js`) so a future rename never touches stored data.
Unknown keys (from a newer export) are preserved as-is and rendered with a
neutral "Autre" style — never dropped or rewritten. Pipeline counters on
TABLEAU show statuses with count > 0 to keep the 380px dashboard compact;
the Entreprises filter always offers the full list.

## 4. Date logic (all in `src/lib/dates.js`, fully unit-tested)

**Implementation contract** (the exact off-by-one/DST traps to avoid):

- `YYYY-MM-DD` strings are parsed by **splitting into {y, m, d} integer
  components — never via `new Date("YYYY-MM-DD")`** (which parses as UTC
  midnight and shifts the day for negative-offset timezones).
- All arithmetic runs on **UTC epoch-days**:
  `daysBetween(a, b) = (Date.UTC(y2,m2-1,d2) − Date.UTC(y1,m1-1,d1)) / 86 400 000`
  — always an exact integer, immune to DST (23 h/25 h local days).
- `todayLocal(now = new Date())` formats the device's local Y/M/D; it is the
  only place local time is read, and takes `now` as a parameter for tests.
- `addDays(dateStr, n)` → `YYYY-MM-DD` via the same epoch-day technique; it
  is the primitive behind +3/+7/+14.
- Unit tests MUST cover: month-end, year-end (Dec→Jan), Feb 29 (leap),
  and the European DST transitions (late March, late October — both fall
  inside the mission window).

Behaviors:

- **Countdown**: `daysUntil(missionEndDate, today)` = whole calendar days
  (0 = today, negative = past). TABLEAU shows `J−XX` (e.g. J−167),
  **« Jour J »** at 0, and `J+XX` in red if the date passed.
  **When `missionEndDate` is null**, TABLEAU shows a
  « Définir la date de fin de mission » call-to-action instead of a
  countdown (this is also what marks onboarding step 3 incomplete).
- **Relances du jour**: contacts with `nextFollowUp != null` and
  `daysUntil(nextFollowUp) <= 2`, **overdue included** (negative = most
  urgent). Sort ascending by `daysUntil`, ties by name (fr collation).
  Labels: "En retard de N j" / "Aujourd'hui" / "Demain" / "Dans 2 j".
- **"Relance faite"** (same behavior on TABLEAU inline and in CONTACTS):
  1. sets `lastContact = today`;
  2. opens a reschedule prompt: **+3 / +7 / +14 days from today**
     **[VALIDATED by Martin — Phase 1]** or a custom date (native date
     input, **minimum = tomorrow** — a fresh reschedule can't be already
     due), plus « Pas de prochaine relance » (clears `nextFollowUp`).
  3. **Dismissing the prompt is intentional behavior**: `lastContact` stays
     = today, `nextFollowUp` is left unchanged — so an overdue contact
     deliberately remains listed in "Relances du jour" until Martin picks a
     new date or clears it. (Conservative: the app never invents or clears
     a date on its own.)
- **Contacts tab sorting** (follow-up urgency): overdue first (most overdue
  first), then today/upcoming ascending, then contacts without `nextFollowUp`,
  each group sub-sorted by name — i.e. date-primary, name-secondary
  (`localeCompare` with `'fr'`).

## 5. Persistence — localStorage (decision + rationale)

**Choice: localStorage**, wrapped in a single module `src/storage/`.

Why localStorage over IndexedDB:

- The dataset is tiny (dozens of companies/contacts, pure JSON, no blobs) —
  far below the ~5 MB localStorage budget.
- Synchronous single-key read/write keeps the storage layer trivial
  **within one tab** (multi-tab safety is handled explicitly below — the two
  APIs are equally exposed there, so it doesn't differentiate them).
- iOS's 7-day script-storage eviction applies **equally** to both APIs for
  Safari-tab usage, and **neither** is evicted for an installed home-screen
  PWA — so eviction risk doesn't differentiate them either. Note: on iOS the
  Safari tab and the installed PWA are **separate storage partitions** — the
  install note must say to install BEFORE entering data; moving existing
  data from tab to PWA goes through export → import (§6). Martin is on
  Android (Chrome tab and WebAPK share storage), so this is a documented
  edge, not the primary path.

Storage module contract (nothing else touches `window.localStorage`):

### Keys

| key                              | content                                  |
|----------------------------------|------------------------------------------|
| `radar:data`                     | the versioned document of §2             |
| `radar:data:corrupt:<ts>`        | quarantined unreadable payload (max 1, most recent) |
| `radar:data:backup:v<N>`         | pre-migration copy of the last v<N> doc  |
| `radar:data:pre-import:<ts>`     | snapshot taken just before an import (max 1) |

### `load()`

- Missing key → fresh empty document (`missionEndDate: null`, onboarding
  state). Status `fresh`.
- **Parse failure OR shape-validation failure** → quarantine: move the raw
  value to `radar:data:corrupt:<timestamp>` (deleting any older corrupt key —
  retention 1 — so backups can never eat the quota), start fresh, status
  `recovered-corrupt`. The UI shows a persistent French banner offering
  « Télécharger la sauvegarde brute » (share/download the raw string as
  `.json`) and « Copier » — the data must be reachable from a phone, without
  devtools, so it can be repaired or sent to Claude.
- `schemaVersion` **newer** than the app → status `newer-version`:
  **read-only mode** + banner « Ferme et rouvre l'app pour la mettre à
  jour » (see §8 — updates are picked up at launch); never write, no silent
  downgrade.
- Older version → **migrate**: before running any migration, copy the stored
  document to `radar:data:backup:v<oldVersion>`; run the ordered pure
  `vN→vN+1` functions; persist the migrated document **immediately after the
  full chain succeeds — never mid-chain**. Each migration is unit-tested.

### `save(doc)`

- Stamps `schemaVersion` and `revision: revision + 1`; single `setItem`.
  Write-through on every mutation.
- **Failure path (quota, storage disabled)**: `setItem` wrapped in
  try/catch; on failure the UI shows a **persistent** French banner (not a
  transient toast) stating data is NOT being saved, offering an immediate
  JSON export of the in-memory document; subsequent mutations keep retrying.
- **Multi-tab conflict guard**: whole-document last-write-wins would let one
  keystroke in a stale tab silently erase everything written by another tab
  since its load. Guard: `save` first reads the stored `revision`; if it
  differs from the revision this tab loaded/last wrote, the save is
  **refused** and the UI shows « Données modifiées dans un autre onglet —
  recharger » with a reload action (plus export of the in-memory copy). The
  module also listens to the `storage` event on `radar:data`: when the local
  state has no diverging edits, the new document is adopted silently.

### `exportJSON()` / `importJSON(text)`

- Export = the exact stored document (+ `exportedAt` stamp), pretty-printed;
  a successful export sets `settings.lastExportAt`. Offered as share/download
  `radar-backup-YYYY-MM-DD.json` + copy to clipboard (§6).
- Import validation: not JSON / not a Radar document / `schemaVersion` newer
  than the app → **abort with a specific French error; stored data is never
  touched**. Older version → migrated (same §5 migration path).
- Import confirmation shows **both sides**: « Importer X entreprises et Y
  contacts — remplace tes N entreprises et M contacts actuels ? ».
- Before replacing, the current document is snapshotted to
  `radar:data:pre-import:<timestamp>` (retention 1) and the success toast
  offers « Annuler l'import » to restore it.
- Export → import round-trip is unit-tested, including the reject cases.

## 6. UI structure

```
src/
  main.jsx / App.jsx        — shell, tab state, data context, banners
  storage/                  — §5 (only module touching localStorage)
  lib/dates.js              — §4
  lib/pointPourClaude.js    — plain-text export formatter (§7)
  lib/clipboard.js          — clipboard.writeText + fallback (§7)
  config/statuses.js        — status keys/labels/colors (§3)
  screens/Tableau.jsx       — countdown, relances du jour, pipeline, copier le
                              point, onboarding, backup reminder, ⚙️ Sauvegarde
  screens/Entreprises.jsx   — search, type/status filters, priority-first list
  screens/Contacts.jsx      — search, urgency-sorted list
  components/               — TabBar, BottomSheet, Fab, SearchBar, StatusPill,
                              CompanyCard, ContactCard, CompanyForm, ContactForm,
                              ConfirmDialog, ReschedulePrompt,
                              OnboardingChecklist, EmptyState, BackupSheet,
                              Banner, Toast, UpdateToast
```

Behaviors:

- **Bottom tab bar** (thumb-friendly): Tableau / Entreprises / Contacts.
- **Floating + button** on Entreprises and Contacts → bottom-sheet form.
  Edit via tapping a card → bottom sheet prefilled; delete inside the sheet
  behind an explicit confirm.
- **Deleting a company** that has linked contacts: contacts are kept, their
  link converted to free-text `companyName` (never cascade-delete); the
  confirm dialog says so.
- **Pipeline counter tap** → switches to Entreprises with that status filter
  applied (filter visibly active, one tap to clear).
- **Onboarding checklist** on TABLEAU when there are no companies AND no
  contacts: 3 steps (ajouter une entreprise, ajouter un contact, définir la
  date de fin de mission — step 3 completes when `missionEndDate` is set),
  each linking to the right place.
- **Sauvegarde (export/import UI — the §5 APIs must be reachable)**: a ⚙️
  button in the TABLEAU header opens `BackupSheet`: export (share/download
  the JSON file + « Copier »), import (file picker + paste area, feeding
  `importJSON` and its two-sided confirm), and the date of the last export.
  **Backup reminder**: when the document has data and the last export is
  > 30 days old (or never), TABLEAU shows a discreet reminder chip linking
  to the sheet.
- **Date inputs**: native `<input type="date">` (value format = stored
  format). **Every nullable date field gets an explicit « Effacer » button**
  — clearing back to null must never depend on the platform picker having a
  clear affordance.
- Sorting Entreprises: priority stars first, then alphabetical (fr).
- **Mobile ergonomics** (the 380px one-handed hard rule, made concrete):
  - viewport meta: `viewport-fit=cover` + `interactive-widget=resizes-content`
    (Android Chrome resizes layout under the keyboard);
  - tab bar, FAB and bottom sheets padded with `env(safe-area-inset-bottom)`;
  - bottom-sheet body is scrollable; the focused input stays visible above
    the keyboard (`visualViewport` fallback where needed);
  - **FAB is hidden while a sheet is open**; list containers get bottom
    padding ≥ FAB + tab bar so the last card is never covered;
  - interactive targets ≥ 44 px; all layouts audited at 380px width.

## 7. "Point pour Claude" export (plain text, French)

Same spirit/completeness as the artifact: header with date + countdown, then
every company grouped by status (name, type, city/sector, notes), then every
contact (name, company, role, last contact, next follow-up, notes). Format:

```
📍 POINT RADAR — 15/07/2026 (J−169 avant fin de mission, 31/12/2026)

🏢 ENTREPRISES (12)
── En discussion (2)
• Wandercraft — Freelance — Paris — Exosquelettes
  Notes: recontacter après l'été
…

👤 CONTACTS (8)
• Jane Doe — Wandercraft — CTO
  Dernier contact : 10/07/2026 · Prochaine relance : 17/07/2026 (dans 2 j)
  Notes: …
```

- Header when `missionEndDate` is null:
  `📍 POINT RADAR — 15/07/2026 (fin de mission non définie)`.
  At 0 days it uses the same label set as TABLEAU (« Jour J »).
- MUST include: date, mission countdown (when set), every company with
  type/status/notes, every contact with last contact and next follow-up.
- **Clipboard**: the point text is built synchronously from state and
  `navigator.clipboard.writeText` is called **synchronously inside the tap
  handler** (no awaits before it — iOS revokes the transient user gesture).
  Success → toast « Point copié ✅ ». **Failure path**: a bottom sheet opens
  with the full text pre-selected for manual copy (+ `navigator.share` where
  available) and a distinct French error toast.

## 8. PWA & deploy

- Manifest: name "Radar", short_name "Radar", `display: standalone`,
  theme/background = slate-950, teal accent, maskable icons (192/512)
  generated from `public/favicon.svg` (`npm run icons`).
- Service worker: precache app shell; **`registerType: 'prompt'`** — a new
  version shows a French toast « Nouvelle version disponible — Recharger ».
  The reload only ever happens on that explicit tap, and the toast action is
  disabled while a bottom-sheet form is open (an update must never destroy
  unsaved form input). Installed PWAs check for a new SW at launch — hence
  §5's read-only banner instruction « ferme et rouvre l'app ».
- No client-side routing (tab state only) — no GH Pages 404/SPA workaround
  needed; manifest `start_url`/`scope` default to the Vite base
  (`/10_Jobseeker/`) via vite-plugin-pwa.
- GitHub Actions workflow: build and deploy to GitHub Pages on push to the
  default branch.
- Install note (French, Phase 3) targets **Android/Chrome** (« Installer
  l'application »); includes the iOS caveat: install BEFORE entering data
  (separate storage partitions, §5), or move data via export → import.

## 9. Post-parity improvements (Phase 0 — all approved, in this order)

1. **Champ LinkedIn** on contacts — DONE. Optional `linkedin` field
   (schema-compatible, no migration), tappable https-normalized link on the
   card, included in the point-pour-Claude export.
2. **Badge relances du jour** — DONE. `dueSoonCount` (≤2 days, overdue incl.)
   shown as a red count on the Contacts tab + app-icon badge via
   `navigator.setAppBadge`/`clearAppBadge` (Android/Chromium).
3. **Statistiques d'activité** — DONE. Append-only `activityLog` of
   "relance faite" events (schema-compatible); StatsSheet from TABLEAU shows
   relances/week (8-week bars), 7-day/total/won tiles, and companies-by-status.
4. **Mode sombre** (auto via `prefers-color-scheme`) — PENDING, dedicated
   pass (full light/dark re-theme of every component).

Each validated before the next.

## 10bis. Multi-device sync via a private GitHub repo (opt-in) — requested by Martin

**Scope change validated by Martin (2026-07-17)**: the original "no external
service receives data" rule is relaxed, *opt-in only*: when (and only when)
Martin configures sync, the document is stored in a **private GitHub repo he
owns** (e.g. `martin73388/radar-data`), separate from this public code repo.
Without configuration the app stays 100 % local, exactly as before.

Design constraints of a static GitHub Pages app:

- **No secret can live in the app bundle** (the site and its JS are public).
  Authentication is a **fine-grained Personal Access Token** that Martin
  creates himself (scoped to the single data repo, permission
  Contents Read/Write, with expiry), pasted **once per device** into the
  Sauvegarde sheet and stored device-locally (`radar:sync:config` — same
  trust level as the data itself, never synced, never in the code).
- Transport: GitHub **Contents API** (`GET/PUT /repos/{owner}/{repo}/contents/{path}`,
  CORS-enabled) on a single file `radar.json`. The pushed payload is the
  §2 document **minus `revision`** (device-local counter — syncing it would
  cause commit ping-pong between devices).

### Sync engine (`src/sync/`)

- Per-device state `radar:sync:state` = `{ lastSyncedSha, lastSyncedRevision }`.
  - `localChanged` = local `revision` ≠ `lastSyncedRevision`
    (first sync: = "has any data").
  - `remoteMoved` = remote file sha ≠ `lastSyncedSha` (first sync: true).
- Decision table (pure, unit-tested — `decideSync`):
  | remote file | remoteMoved | localChanged | action |
  |---|---|---|---|
  | absent | — | — | push (creates the file) |
  | present | no | no | noop |
  | present | no | yes | push (CAS on sha) |
  | present | yes | no | adopt remote |
  | present | yes | yes | **conflict** — explicit choice |
- **Adopt** runs the remote payload through `parseImport` (same validation,
  migration, newer-version rejection as a manual import) and applies it via
  `applyImport` (pre-adopt snapshot, revision guard). **Push** uses the sha
  as compare-and-swap: a 409/422 means the remote moved → re-pull, never
  blind-overwrite.
- **Conflict is never resolved silently**: a banner offers « Garder cet
  appareil » (force-push local) or « Prendre l'autre version » (adopt, with
  snapshot). Until resolved the app keeps working locally.
- Triggers: pull on launch, on `visibilitychange→visible`, on « Synchroniser
  maintenant »; push debounced ~2.5 s after each mutation. Offline or API
  failure → visible status, local-first behavior unchanged, retry on next
  trigger. Remote written by a newer app version → sync pauses with
  « ferme et rouvre l'app » (no downgrade, mirroring §5).
- UI: « Synchronisation » section in the Sauvegarde sheet (configure with
  `owner/repo` + token, status + last sync time, Synchroniser maintenant,
  Désactiver — local data kept); a status dot next to ⚙️ on TABLEAU.

Privacy note (documented to Martin): with sync ON, the prospect list lives
in his private GitHub repo — visible to GitHub and to anyone holding the
repo access or the token. Fine-grained single-repo token + private repo is
the mitigation; sync stays opt-in per device.

## 10ter. Phase 1 gate — CLOSED (all validated by Martin)

1. **Status list** (§3) — the 8 proposed statuses validated as-is.
2. Reschedule offsets computed **from today** (§4) — confirmed.
3. Contact→company: link + free-text fallback (§2) — confirmed.
4. Phone OS: **Android** — install note targets Chrome/Android; `setAppBadge`
   well supported for the future badge improvement.
