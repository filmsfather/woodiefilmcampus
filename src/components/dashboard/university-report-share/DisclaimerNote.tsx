import { Info } from 'lucide-react'

interface DisclaimerNoteProps {
  hasEstimated: boolean
}

/**
 * 면책 안내. 성적 산출 기준과 추정 컷 여부를 명확히 한다.
 */
export default function DisclaimerNote({ hasEstimated }: DisclaimerNoteProps) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
      <p className="flex items-center gap-1.5 font-medium text-slate-600">
        <Info className="size-3.5" /> 안내 사항
      </p>
      <ul className="ml-4 list-disc space-y-1">
        <li>지원대학 성적 산출은 대학별 전형 모집요강을 기준으로 계산되었습니다.</li>
        <li>대학이 합격 컷을 공개하지 않는 경우 우디필름캠퍼스 자체 기준으로 추정해 계산했습니다.</li>
        {hasEstimated ? (
          <li>
            <span className="font-medium text-amber-700">추정 컷</span> 으로 표시된 대학은 참고용
            가늠치이며 실제 합격선과 다를 수 있습니다.
          </li>
        ) : null}
        <li>대학 진학의 최종 판단과 책임은 학생 본인에게 있습니다.</li>
      </ul>
    </div>
  )
}
