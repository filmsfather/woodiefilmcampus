import Link from 'next/link'
import { ExternalLink, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import UniversityReportUploader from '@/components/dashboard/university-report/UniversityReportUploader'

const GOV24_TRANSCRIPT_URL =
  'https://plus.gov.kr/search/searchdtl?srvcId=13410000016&typeSn=02'

interface UniversityReportEmptyStateProps {
  studentId: string
  isViewingOther: boolean
}

export default function UniversityReportEmptyState({
  studentId,
  isViewingOther,
}: UniversityReportEmptyStateProps) {
  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <FileText className="size-4" />
            1단계. 정부24에서 성적증명서 PDF 발급받기
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-700">
          <ol className="list-decimal space-y-2 pl-5">
            <li>아래 정부24 안내 페이지 링크를 새 탭에서 엽니다.</li>
            <li>본인 인증 후 "학교생활기록부(성적증명서) 발급"을 신청합니다.</li>
            <li>발급된 PDF를 컴퓨터에 저장하고, 이 페이지로 돌아와 업로드합니다.</li>
          </ol>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            발급 페이지에서 "문서출력" 또는 "PDF 저장"으로 다운로드한 파일을 그대로 올려주세요. 화면을 스크린샷한 이미지가 아닌 PDF 파일이어야 분석 정확도가 높습니다.
          </div>
          <Button asChild variant="outline" className="gap-2">
            <Link href={GOV24_TRANSCRIPT_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
              정부24 학교생활기록부 발급 페이지로 이동
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">
            2단계. 발급받은 PDF 업로드하기
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            {isViewingOther
              ? '학생을 대신해 성적증명서 PDF를 업로드합니다. 업로드 후 AI 분석까지 1~2분 가량 소요됩니다.'
              : 'PDF를 업로드하면 AI가 자동으로 모든 과목과 등급을 추출해 정리합니다. 분석에는 1~2분 가량 소요됩니다.'}
          </p>
          <UniversityReportUploader studentId={studentId} mode="initial" />
        </CardContent>
      </Card>
    </div>
  )
}
