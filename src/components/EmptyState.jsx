export default function EmptyState({ icon, title, hint }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="text-slate-600">{icon}</div>
      <p className="text-[15px] font-medium text-slate-300">{title}</p>
      {hint && <p className="text-sm leading-relaxed text-slate-500">{hint}</p>}
    </div>
  )
}
