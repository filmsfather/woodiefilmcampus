import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import {
  ADMISSION_REVIEWS_BUCKET,
  resolveUniversityLabel,
  formatAdmissionYear,
  type AdmissionReviewRow,
} from '@/lib/admission-reviews'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

const BASE = '/dashboard/teacher/admission-reviews'

export default async function AdmissionReviewDetailPage({
  params,
}: {
  params: Promise<{ reviewId: string }>
}) {
  await requireAuthForDashboard(['teacher', 'manager'])
  const { reviewId } = await params

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('admission_reviews')
    .select(
      'id, university_id, university_label, admission_year, posted_at, admission_track, stage, student_name, title, body, source_file, source_url'
    )
    .eq('id', reviewId)
    .maybeSingle()

  if (error) {
    console.error('[admission-reviews] detail query failed', error)
    throw new Error('복기 자료를 불러올 수 없습니다.')
  }
  if (!data) {
    notFound()
  }

  const review = data as AdmissionReviewRow

  const { data: imageRows } = await supabase
    .from('admission_review_images')
    .select('id, storage_path, sort_order, width, height')
    .eq('review_id', reviewId)
    .order('sort_order', { ascending: true })

  const bucket = supabase.storage.from(ADMISSION_REVIEWS_BUCKET)
  const images = await Promise.all(
    (imageRows ?? []).map(async (img) => {
      const { data: signed } = await bucket.createSignedUrl(String(img.storage_path), 60 * 60)
      return { id: String(img.id), url: signed?.signedUrl ?? null }
    })
  )
  const visibleImages = images.filter((i) => i.url)

  const postedLabel = review.posted_at
    ? DateUtil.formatForDisplay(review.posted_at, {
        locale: 'ko-KR',
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref={BASE} label="합격 복기 아카이브로 돌아가기" />

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-slate-900 text-white">{resolveUniversityLabel(review)}</Badge>
            {formatAdmissionYear(review.admission_year) ? (
              <Badge variant="outline">{formatAdmissionYear(review.admission_year)}</Badge>
            ) : null}
            {review.admission_track ? <Badge variant="outline">{review.admission_track}</Badge> : null}
            {review.stage ? <Badge variant="secondary">{review.stage}</Badge> : null}
          </div>
          <CardTitle className="text-xl font-semibold text-slate-900">{review.title}</CardTitle>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            <span>학생 {review.student_name ?? '미상'}</span>
            {postedLabel ? <span>게시일 {postedLabel}</span> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {review.body ? (
            <article className="whitespace-pre-line text-[15px] leading-relaxed text-slate-800">
              {review.body}
            </article>
          ) : (
            <p className="text-sm text-slate-400">본문이 없습니다.</p>
          )}

          {visibleImages.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-700">첨부 이미지 ({visibleImages.length})</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleImages.map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={img.id}
                    src={img.url ?? ''}
                    alt="복기 첨부 이미지"
                    className="w-full rounded-md border border-slate-200"
                  />
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}
