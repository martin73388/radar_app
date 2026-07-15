import { IconCheck } from '../ui/icons.jsx'

function Step({ done, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={done}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-left disabled:opacity-70"
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          done
            ? 'border-teal-500/50 bg-teal-500/20 text-teal-300'
            : 'border-slate-700 text-transparent'
        }`}
      >
        <IconCheck className="h-3.5 w-3.5" />
      </span>
      <span
        className={`text-sm font-medium ${done ? 'text-slate-500 line-through' : 'text-slate-200'}`}
      >
        {label}
      </span>
    </button>
  )
}

/** Shown on TABLEAU while the app is empty (no companies AND no contacts). */
export default function OnboardingChecklist({ missionSet, onAddCompany, onAddContact, onSetMission }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-base font-semibold text-slate-100">Bienvenue sur Radar 👋</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-400">
        Ton CRM de prospection, 100 % local : tes données restent sur ton
        téléphone. Trois étapes pour démarrer :
      </p>
      <div className="mt-3 space-y-2">
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
