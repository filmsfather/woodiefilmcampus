import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DateUtil from '@/lib/date-util'
import type { LearningJournalGreeting } from '@/types/learning-journal'

interface GreetingPreviewProps {
  greeting: LearningJournalGreeting | null
  monthLabel: string
}

export function GreetingPreview({ greeting, monthLabel }: GreetingPreviewProps) {
  return (
    <Card className="border-slate-200">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg text-slate-900">현재 인사말 미리보기</CardTitle>
        <p className="text-sm text-slate-500">{monthLabel} 학습일지에 표시될 인사 메시지를 확인하세요.</p>
      </CardHeader>
      <CardContent>
        {greeting ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{greeting.message}</p>
            <p className="text-xs text-slate-400">
              최근 업데이트: {DateUtil.formatForDisplay(greeting.updatedAt, {
                locale: 'ko-KR',
                timeZone: 'Asia/Seoul',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
            아직 인사말이 등록되지 않았습니다. 오른쪽 폼에서 인사말을 작성해주세요.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
