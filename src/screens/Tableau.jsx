import { useState } from 'react'
import { useRadar } from '../state/radar.js'
import { STATUSES, statusOf } from '../config/statuses.js'
import {
  compareByFollowUpUrgency,
  countdownLabel,
  daysUntil,
  dueLabel,
  formatFR,
  isDueSoon,
  todayLocal,
} from '../lib/dates.js'
import { buildPoint } from '../lib/pointPourClaude.js'
import { copyText } from '../lib/clipboard.js'
import BottomSheet from '../components/BottomSheet.jsx'
import DateField from '../components/DateField.jsx'
import BackupSheet from '../components/BackupSheet.jsx'
import ReschedulePrompt from '../components/ReschedulePrompt.jsx'
import OnboardingChecklist from '../components/OnboardingChecklist.jsx'
import { followUpBadge } from '../components/ContactCard.jsx'
import { syncDotClass } from '../sync/labels.js'
import StatsSheet from '../components/StatsSheet.jsx'
import { IconGear, IconCopy, IconCheck, IconShare, IconCalendar, IconChart } from '../ui/icons.jsx'

function MissionCard({ onEdit }) {
  const { doc, today } = useRadar()
  const md = doc.settings.missionEndDate
  if (!md) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-4 text-left"
      >
        <IconCalendar className="h-6 w-6 shrink-0 text-teal-400" />
        <div>
          <p className="text-[15px] font-medium text-slate-200">
            Définir la date de fin de mission
          </p>
          <p className="text-sm text-slate-500">Pour afficher le compte à rebours J−XX</p>
        </div>
      </button>
    )
  }
  const days = daysUntil(md, today)
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left"
    >
      <div>
        <p className="text-sm text-slate-400">Fin de mission</p>
        <p className="mt-0.5 font-mono text-sm tabular-nums text-slate-300">
          {formatFR(md)}
        </p>
      </div>
      <p
        className={`font-mono text-3xl font-bold tabular-nums ${
          days < 0 ? 'text-rose-400' : days <= 30 ? 'text-amber-300' : 'text-teal-300'
        }`}
      >
        {countdownLabel(days)}
      </p>
    </button>
  )
}

function RelancesDuJour({ onDone }) {
  const { doc, today, readOnly } = useRadar()
  const due = doc.contacts
    .filter((p) => p.nextFollowUp && isDueSoon(daysUntil(p.nextFollowUp, today)))
    .sort(compareByFollowUpUrgency)
  const companiesById = new Map(doc.companies.map((c) => [c.id, c]))

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Relances du jour
      </h2>
      {due.length === 0 ? (
        <p className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-500">
          Aucune relance due dans les 2 prochains jours ✅
        </p>
      ) : (
        <ul className="space-y-2">
          {due.map((p) => {
            const days = daysUntil(p.nextFollowUp, today)
            const companyLabel =
              (p.companyId && companiesById.get(p.companyId)?.name) || p.companyName
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-slate-100">
                    {p.name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 text-sm">
                    <span
                      className={`whitespace-nowrap rounded-full border px-2 py-px text-xs font-medium ${followUpBadge(days)}`}
                    >
                      {dueLabel(days)}
                    </span>
                    {companyLabel && (
                      <span className="truncate text-slate-500">{companyLabel}</span>
                    )}
                  </p>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onDone(p)}
                    className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 text-sm font-medium text-teal-300 active:bg-teal-500/20"
                  >
                    <IconCheck className="h-4 w-4" /> Relance faite
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Pipeline({ onPick }) {
  const { doc } = useRadar()
  const counts = new Map()
  for (const c of doc.companies) counts.set(c.status, (counts.get(c.status) ?? 0) + 1)
  const orderedKeys = [
    ...STATUSES.map((s) => s.key).filter((k) => counts.has(k)),
    ...[...counts.keys()].filter((k) => !STATUSES.some((s) => s.key === k)),
  ]
  if (orderedKeys.length === 0) return null
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Pipeline
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {orderedKeys.map((key) => {
          const s = statusOf(key)
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 active:border-slate-700"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm text-slate-300">
                <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="ml-2 font-mono text-lg font-bold tabular-nums text-slate-100">
                {counts.get(key)}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default function Tableau({ navigate }) {
  const { doc, actions, today, readOnly, showToast, syncState } = useRadar()
  const [missionSheet, setMissionSheet] = useState(false)
  const [missionDraft, setMissionDraft] = useState(null)
  const [backupOpen, setBackupOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [rescheduling, setRescheduling] = useState(null)
  const [copyFallback, setCopyFallback] = useState(null)

  const empty = doc.companies.length === 0 && doc.contacts.length === 0
  const lastExport = doc.settings.lastExportAt
  const exportOverdue =
    !empty &&
    (!lastExport ||
      Date.now() - new Date(lastExport).getTime() > 30 * 86_400_000)

  function copyPoint() {
    // Built + copied synchronously inside the tap handler (user gesture).
    const text = buildPoint(doc, today)
    copyText(text).then((ok) => {
      if (ok) {
        showToast({ message: 'Point copié ✅' })
      } else {
        showToast({ message: 'Copie automatique impossible', kind: 'error' })
        setCopyFallback(text)
      }
    })
  }

  function openMissionSheet() {
    setMissionDraft(doc.settings.missionEndDate)
    setMissionSheet(true)
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Radar</h1>
          <p className="font-mono text-xs tabular-nums text-slate-500">
            {formatFR(today)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStatsOpen(true)}
            aria-label="Statistiques"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-400 active:text-slate-200"
          >
            <IconChart />
          </button>
          <button
            type="button"
            onClick={() => setBackupOpen(true)}
            aria-label="Sauvegarde"
            className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-400 active:text-slate-200"
          >
            <IconGear />
            {syncDotClass(syncState.status) && (
              <span
                aria-hidden="true"
                className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-slate-950 ${syncDotClass(syncState.status)}`}
              />
            )}
          </button>
        </div>
      </header>

      {exportOverdue && (
        <button
          type="button"
          onClick={() => setBackupOpen(true)}
          className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-left text-sm font-medium text-amber-200"
        >
          💾 Pense à exporter tes données{' '}
          {lastExport
            ? `(dernier export : ${formatFR(todayLocal(new Date(lastExport)))})`
            : '(jamais fait)'}
        </button>
      )}

      <MissionCard onEdit={readOnly ? () => {} : openMissionSheet} />

      {empty ? (
        <OnboardingChecklist
          missionSet={Boolean(doc.settings.missionEndDate)}
          onAddCompany={() => navigate('entreprises', { openForm: true })}
          onAddContact={() => navigate('contacts', { openForm: true })}
          onSetMission={readOnly ? () => {} : openMissionSheet}
        />
      ) : (
        <>
          <RelancesDuJour
            onDone={(contact) => {
              actions.markFollowUpDone(contact.id)
              setRescheduling(contact)
            }}
          />
          <Pipeline onPick={(statusKey) => navigate('entreprises', { statusFilter: statusKey })} />
          <button
            type="button"
            onClick={copyPoint}
            className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-teal-500 py-3.5 text-[15px] font-semibold text-slate-950 active:bg-teal-400"
          >
            <IconCopy className="h-5 w-5" /> Copier le point pour Claude
          </button>
        </>
      )}

      {/* Mission end date editor */}
      <BottomSheet
        open={missionSheet}
        onClose={() => setMissionSheet(false)}
        title="Fin de mission"
      >
        <div className="space-y-4 pt-1">
          <DateField
            id="mission-end"
            label="Date de fin de mission"
            value={missionDraft}
            onChange={setMissionDraft}
          />
          <button
            type="button"
            onClick={() => {
              actions.setMissionEndDate(missionDraft)
              setMissionSheet(false)
            }}
            className="h-12 w-full rounded-xl bg-teal-500 text-[15px] font-semibold text-slate-950 active:bg-teal-400"
          >
            Enregistrer
          </button>
        </div>
      </BottomSheet>

      <BackupSheet open={backupOpen} onClose={() => setBackupOpen(false)} />

      <StatsSheet open={statsOpen} onClose={() => setStatsOpen(false)} />

      <ReschedulePrompt
        contact={rescheduling}
        onPick={(date) => {
          actions.reschedule(rescheduling.id, date)
          setRescheduling(null)
        }}
        onClose={() => setRescheduling(null)}
      />

      {/* Manual-copy fallback when the clipboard is unavailable */}
      <BottomSheet
        open={Boolean(copyFallback)}
        onClose={() => setCopyFallback(null)}
        title="Copie manuelle"
      >
        <div className="space-y-3 pt-1">
          <p className="text-sm text-slate-400">
            La copie automatique a échoué. Sélectionne le texte ci-dessous, ou
            partage-le directement :
          </p>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button
              type="button"
              onClick={() => navigator.share({ text: copyFallback }).catch(() => {})}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-500 text-sm font-semibold text-slate-950"
            >
              <IconShare className="h-4 w-4" /> Partager
            </button>
          )}
          <textarea
            readOnly
            autoFocus
            rows={10}
            value={copyFallback ?? ''}
            onFocus={(e) => e.target.select()}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200"
          />
        </div>
      </BottomSheet>
    </div>
  )
}
