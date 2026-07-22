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
import { syncDotClass, combineSyncState } from '../sync/labels.js'
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
        className="entity-card row"
        style={{ borderStyle: 'dashed', gap: 12 }}
      >
        <IconCalendar size={24} style={{ color: 'var(--primary)', flex: 'none' }} />
        <div>
          <p style={{ fontWeight: 600 }}>Définir la date de fin de mission</p>
          <p className="muted small">Pour afficher le compte à rebours J−XX</p>
        </div>
      </button>
    )
  }
  const days = daysUntil(md, today)
  return (
    <button type="button" onClick={onEdit} className="entity-card row-between">
      <div>
        <p className="muted small">Fin de mission</p>
        <p className="mono-nums small" style={{ marginTop: 2 }}>{formatFR(md)}</p>
      </div>
      <p
        className="mono-nums"
        style={{
          fontSize: 30,
          fontWeight: 800,
          color: days < 0 ? 'var(--danger)' : days <= 30 ? 'var(--warning)' : 'var(--success)',
        }}
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
      <h2 className="section-title" style={{ marginBottom: 8 }}>Relances du jour</h2>
      {due.length === 0 ? (
        <p className="card card-pad muted small">
          Aucune relance due dans les 2 prochains jours ✅
        </p>
      ) : (
        <ul className="stack-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {due.map((p) => {
            const days = daysUntil(p.nextFollowUp, today)
            const companyLabel =
              (p.companyId && companiesById.get(p.companyId)?.name) || p.companyName
            return (
              <li key={p.id} className="card card-pad row" style={{ gap: 12 }}>
                <div className="flex-1">
                  <p className="truncate" style={{ fontWeight: 600 }}>{p.name}</p>
                  <p className="row small" style={{ marginTop: 2 }}>
                    <span className={`badge ${followUpBadge(days)}`}>{dueLabel(days)}</span>
                    {companyLabel && <span className="truncate faint">{companyLabel}</span>}
                  </p>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onDone(p)}
                    className="btn btn-sm btn-primary"
                    style={{ height: 44, flex: 'none' }}
                  >
                    <IconCheck size={16} /> Relance faite
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
      <h2 className="section-title" style={{ marginBottom: 8 }}>Pipeline</h2>
      <div className="grid-2">
        {orderedKeys.map((key) => {
          const s = statusOf(key)
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              className="tile row-between"
              style={{ '--pill-hue': s.color }}
            >
              <span className="row small muted flex-1" style={{ gap: 8 }}>
                <span className="status-dot" />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="tile-number">{counts.get(key)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default function Tableau({ navigate }) {
  const { doc, actions, today, readOnly, showToast, syncStatus } = useRadar()
  const dotState = combineSyncState(syncStatus.github.state, syncStatus.drive.state)
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
    <div className="stack-5">
      <header className="row-between">
        <div>
          <h1 className="screen-title">Radar</h1>
          <p className="faint tiny mono-nums">{formatFR(today)}</p>
        </div>
        <div className="row">
          <button
            type="button"
            onClick={() => setStatsOpen(true)}
            aria-label="Statistiques"
            className="icon-btn"
          >
            <IconChart />
          </button>
          <button
            type="button"
            onClick={() => setBackupOpen(true)}
            aria-label="Sauvegarde"
            className="icon-btn"
          >
            <IconGear />
            {syncDotClass(dotState) && (
              <span aria-hidden="true" className={`sync-dot ${syncDotClass(dotState)}`} />
            )}
          </button>
        </div>
      </header>

      {exportOverdue && (
        <button
          type="button"
          onClick={() => setBackupOpen(true)}
          className="banner banner-warn btn-mid"
          style={{ textAlign: 'left', height: 'auto', cursor: 'pointer' }}
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
          <button type="button" onClick={copyPoint} className="btn btn-primary btn-tall">
            <IconCopy /> Copier le point pour Claude
          </button>
        </>
      )}

      {/* Mission end date editor */}
      <BottomSheet
        open={missionSheet}
        onClose={() => setMissionSheet(false)}
        title="Fin de mission"
      >
        <div className="stack-3" style={{ paddingTop: 4 }}>
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
            className="btn btn-primary btn-tall"
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
        <div className="stack-3" style={{ paddingTop: 4 }}>
          <p className="muted small">
            La copie automatique a échoué. Sélectionne le texte ci-dessous, ou
            partage-le directement :
          </p>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button
              type="button"
              onClick={() => navigator.share({ text: copyFallback }).catch(() => {})}
              className="btn btn-primary btn-mid"
            >
              <IconShare size={16} /> Partager
            </button>
          )}
          <textarea
            readOnly
            autoFocus
            rows={10}
            value={copyFallback ?? ''}
            onFocus={(e) => e.target.select()}
            className="textarea mono-nums tiny"
          />
        </div>
      </BottomSheet>
    </div>
  )
}
