import { requireAuthForDashboard } from '@/lib/auth'

export default async function TeacherLearningJournalPage() {
  await requireAuthForDashboard('teacher')

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">학습일지</h1>
        <p className="text-sm text-slate-500">학습일지 기능은 준비 중입니다. 곧 업데이트될 예정입니다.</p>
      </header>
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        학습일지 작성과 관리 기능은 현재 기획 중이며, 추후 공지 후 제공됩니다.
      </div>
    </section>
  )
}
