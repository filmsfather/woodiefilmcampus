import { AlertTriangle, CheckCircle2, FileWarning, GraduationCap } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import PdfDownloadButton from '@/components/dashboard/university-report/PdfDownloadButton'
import UniversityReportUploader from '@/components/dashboard/university-report/UniversityReportUploader'
import type { SnapshotSummary } from '@/lib/university-report/types'

interface GradeSemesterCount {
  grade: number
  semester: number
  count: number
}

interface UniversityReportResultSummaryProps {
  snapshot: SnapshotSummary
  studentId: string
  gradeSemesterCounts: GradeSemesterCount[]
}

function formatDateTime(isoString: string | null) {
  if (!isoString) return '-'
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function UniversityReportResultSummary({
  snapshot,
  studentId,
  gradeSemesterCounts,
}: UniversityReportResultSummaryProps) {
  const isFailed = snapshot.status === 'failed'
  const isParsing = snapshot.status === 'parsing'

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <GraduationCap className="size-4" />
              현재 등록된 성적
            </span>
            <div className="flex items-center gap-2">
              <Badge
                className={
                  isFailed
                    ? 'bg-red-100 text-red-700'
                    : isParsing
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                }
              >
                {isFailed ? '분석 실패' : isParsing ? '분석 중' : '분석 완료'}
              </Badge>
              <PdfDownloadButton snapshotId={snapshot.id} />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-sm text-slate-700">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="추출된 학생 이름" value={snapshot.studentNameOnDoc} />
            <Field label="추출된 학교" value={snapshot.schoolName} />
            <Field label="발급번호" value={snapshot.docSerial} mono />
            <Field label="문서확인번호" value={snapshot.docVerifyCode} mono />
            <Field label="분석 일시" value={formatDateTime(snapshot.parsedAt)} />
            <Field label="추출 과목 수" value={`${snapshot.courseCount}개`} />
          </dl>

          {gradeSemesterCounts.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">학년별 추출 과목 수</p>
              <div className="flex flex-wrap gap-2">
                {gradeSemesterCounts.map((row) => (
                  <span
                    key={`${row.grade}-${row.semester}`}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700"
                  >
                    {row.grade}학년 {row.semester}학기 · {row.count}과목
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {snapshot.parserWarnings && snapshot.parserWarnings.length > 0 ? (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="flex items-center gap-1 font-medium">
                <FileWarning className="size-3.5" /> 분석 시 확인이 필요한 항목
              </p>
              <ul className="ml-4 list-disc space-y-1">
                {snapshot.parserWarnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {isFailed && snapshot.parseError ? (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 size-3.5" />
              <p>{snapshot.parseError}</p>
            </div>
          ) : null}

          {!isFailed && !isParsing ? (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <CheckCircle2 className="mt-0.5 size-3.5" />
              <p>
                추출된 데이터는 우디쌤의 검수를 거쳐 지원 가능 대학 분석 레포트의 기초 자료로 사용됩니다.
                잘못 추출된 항목이 있으면 같은 PDF로 다시 업로드하거나 우디쌤에게 알려주세요.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-dashed border-slate-300 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-700">
            성적증명서를 다시 받았다면 새로 업로드해 주세요
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-slate-500">
            다시 업로드하면 위의 분석 결과는 보관 처리되고 새 PDF로 다시 분석합니다.
          </p>
          <UniversityReportUploader studentId={studentId} mode="replace" />
        </CardContent>
      </Card>
    </div>
  )
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className={mono ? 'font-mono text-sm text-slate-800' : 'text-sm text-slate-800'}>
        {value ?? '-'}
      </dd>
    </div>
  )
}
