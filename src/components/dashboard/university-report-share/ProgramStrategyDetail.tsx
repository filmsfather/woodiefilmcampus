import type { ReportUniversityItem } from '@/lib/university-policy/report-view'

interface ProgramStrategyDetailProps {
  item: ReportUniversityItem
}

function DetailBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-slate-700">{title}</p>
      <p className="whitespace-pre-line text-xs leading-relaxed text-slate-600">{body}</p>
    </div>
  )
}

/**
 * 카드 펼침 시 노출되는 전형 상세(전형방법·실기·내신산출·일정).
 * 모집단위 프리셋의 details를 학생·학부모가 읽기 쉬운 형태로 보여준다.
 */
export default function ProgramStrategyDetail({ item }: ProgramStrategyDetailProps) {
  const details = item.details

  if (!details) {
    return (
      <p className="text-xs text-slate-500">
        이 모집단위의 전형 상세 정보가 아직 정리되지 않았습니다.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {details.evaluationMethod ? (
        <DetailBlock title="전형 방법" body={details.evaluationMethod} />
      ) : null}
      {details.practicalTest ? (
        <DetailBlock title="실기 내용" body={details.practicalTest} />
      ) : null}
      {details.gradeCalculation ? (
        <DetailBlock title="내신 산출 방법" body={details.gradeCalculation} />
      ) : null}
      {details.recruitSummary ? (
        <DetailBlock title="모집 정원" body={details.recruitSummary} />
      ) : null}

      {item.schedule && item.schedule.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-700">모집 일정</p>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs text-slate-600">
            {item.schedule.map((s) => (
              <div key={s.label} className="contents">
                <dt className="text-slate-400">{s.label}</dt>
                <dd className="font-medium text-slate-700">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {details.other ? <DetailBlock title="기타" body={details.other} /> : null}
    </div>
  )
}
