import { IconCheck } from '../ui/icons.jsx'

function Step({ done, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={done}
      className="btn btn-mid"
      style={{ justifyContent: 'flex-start', gap: 12, textAlign: 'left' }}
    >
      <span
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 24,
          height: 24,
          flex: 'none',
          borderRadius: '50%',
          border: '1px solid',
          borderColor: done ? 'var(--success)' : 'var(--border-strong)',
          background: done ? 'var(--success-bg)' : 'transparent',
          color: done ? 'var(--success)' : 'transparent',
        }}
      >
        <IconCheck size={14} />
      </span>
      <span
        className={done ? 'small muted' : 'small'}
        style={done ? { textDecoration: 'line-through' } : { fontWeight: 600 }}
      >
        {label}
      </span>
    </button>
  )
}

/** Shown on TABLEAU while the app is empty (no companies AND no contacts). */
export default function OnboardingChecklist({ missionSet, onAddCompany, onAddContact, onSetMission }) {
  return (
    <section className="card card-pad">
      <h2>Bienvenue sur Radar 👋</h2>
      <p className="muted small" style={{ marginTop: 4 }}>
        Ton CRM de prospection, 100 % local : tes données restent sur ton
        téléphone. Trois étapes pour démarrer :
      </p>
      <div className="stack-2" style={{ marginTop: 12 }}>
        <Step done={false} label="Ajouter ta première entreprise cible" onClick={onAddCompany} />
        <Step done={false} label="Ajouter un premier contact" onClick={onAddContact} />
        <Step
          done={missionSet}
          label="Définir la date de fin de mission"
          onClick={onSetMission}
        />
      </div>
    </section>
  )
}
