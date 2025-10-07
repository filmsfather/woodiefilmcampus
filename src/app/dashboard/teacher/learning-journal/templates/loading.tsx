export default function LoadingLearningJournalTemplate() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
      <div className="h-4 w-96 animate-pulse rounded bg-slate-100" />
      <div className="h-[500px] rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
              <div className="h-24 w-full animate-pulse rounded bg-slate-50" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
