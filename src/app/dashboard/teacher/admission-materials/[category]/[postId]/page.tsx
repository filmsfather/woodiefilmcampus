import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import DateUtil from '@/lib/date-util'
import {
  ADMISSION_MATERIALS_BUCKET,
  extractAdmissionTypeTags,
  getAdmissionCategoryLabel,
  isAdmissionMaterialCategory,
} from '@/lib/admission-materials'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

interface AdmissionMaterialDetailRow {
  id: string
  category: string
  target_level: string | null
  title: string
  description: string | null
  created_at: string
  updated_at: string
  author: {
    name: string | null
    email: string | null
  } | null
  past_exam_year: number | null
  past_exam_university: string | null
  past_exam_admission_types: string[] | null
  guide_asset?: {
    id: string
    bucket: string
    path: string
    mime_type: string | null
    metadata: Record<string, unknown> | null
  } | null
  resource_asset?: {
    id: string
    bucket: string
    path: string
    mime_type: string | null
    metadata: Record<string, unknown> | null
  } | null
  schedules: Array<{
    id: string
    title: string
    start_at: string
    end_at: string | null
    location: string | null
    memo: string | null
  }>
}

export default async function AdmissionMaterialDetailPage({
  params,
}: {
  params: Promise<{ category: string; postId: string }>
}) {
  const { category, postId } = await params
  if (!isAdmissionMaterialCategory(category)) {
    notFound()
  }
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('admission_material_posts')
    .select(
      `id,
       category,
       target_level,
       title,
       description,
       past_exam_year,
       past_exam_university,
       past_exam_admission_types,
       created_at,
       updated_at,
       author:profiles!admission_material_posts_created_by_fkey(name, email),
       guide_asset:media_assets!admission_material_posts_guide_asset_id_fkey(id, bucket, path, mime_type, metadata),
       resource_asset:media_assets!admission_material_posts_resource_asset_id_fkey(id, bucket, path, mime_type, metadata),
       schedules:admission_material_schedules(id, title, start_at, end_at, location, memo)
      `
    )
    .eq('id', postId)
    .maybeSingle()

  if (error) {
    console.error('[admission-materials] failed to load detail', error)
    throw new Error('입시 자료를 불러올 수 없습니다.')
  }

  if (!data || data.category !== category) {
    notFound()
  }

  const guideRelation = Array.isArray(data.guide_asset) ? data.guide_asset[0] : data.guide_asset
  const resourceRelation = Array.isArray(data.resource_asset) ? data.resource_asset[0] : data.resource_asset
  const schedules = (Array.isArray(data.schedules) ? data.schedules : [])
    .map((schedule) => ({
      id: String(schedule.id),
      title: String(schedule.title),
      start_at: String(schedule.start_at),
      end_at: schedule.end_at ? String(schedule.end_at) : null,
      location: schedule.location ? String(schedule.location) : null,
      memo: schedule.memo ? String(schedule.memo) : null,
    }))
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())

  const bucketClient = supabase.storage.from(ADMISSION_MATERIALS_BUCKET)

  async function createSigned(path: string | null) {
    if (!path) {
      return null
    }
    const { data: signed, error: signedError } = await bucketClient.createSignedUrl(path, 60 * 60)
    if (signedError) {
      console.error('[admission-materials] failed to sign url', signedError)
      return null
    }
    return signed?.signedUrl ?? null
  }

  const guideUrl = await createSigned(guideRelation?.path ?? null)
  const resourceUrl = await createSigned(resourceRelation?.path ?? null)

  const pickAssetName = (asset?: { metadata: Record<string, unknown> | null; path: string }) => {
    if (!asset) {
      return null
    }
    const metaName = (asset.metadata as { originalName?: string } | null)?.originalName
    if (metaName) {
      return metaName
    }
    return asset.path.split('/').pop() ?? null
  }

  const normalizedAuthor = (() => {
    const raw = data.author

    if (!raw) {
      return null
    }

    const record = Array.isArray(raw) ? raw[0] : raw

    if (!record) {
      return null
    }

    const name = (record as { name?: unknown })?.name
    const email = (record as { email?: unknown })?.email

    return {
      name: typeof name === 'string' ? name : null,
      email: typeof email === 'string' ? email : null,
    }
  })()

  const detail: AdmissionMaterialDetailRow = {
    id: String(data.id),
    category: String(data.category),
    target_level: (data.target_level ?? null) as string | null,
    title: String(data.title),
    description: (data.description ?? null) as string | null,
    created_at: String(data.created_at),
    updated_at: String(data.updated_at),
    author: normalizedAuthor,
    past_exam_year:
      data.past_exam_year !== null && data.past_exam_year !== undefined ? Number(data.past_exam_year) : null,
    past_exam_university: (data.past_exam_university ?? null) as string | null,
    past_exam_admission_types: Array.isArray(data.past_exam_admission_types)
      ? data.past_exam_admission_types.map((item) => String(item))
      : null,
    guide_asset: guideRelation
      ? {
        id: String(guideRelation.id),
        bucket: String(guideRelation.bucket),
        path: String(guideRelation.path),
        mime_type: typeof guideRelation.mime_type === 'string' ? guideRelation.mime_type : null,
        metadata: (guideRelation.metadata ?? null) as Record<string, unknown> | null,
      }
      : null,
    resource_asset: resourceRelation
      ? {
        id: String(resourceRelation.id),
        bucket: String(resourceRelation.bucket),
        path: String(resourceRelation.path),
        mime_type: typeof resourceRelation.mime_type === 'string' ? resourceRelation.mime_type : null,
        metadata: (resourceRelation.metadata ?? null) as Record<string, unknown> | null,
      }
      : null,
    schedules,
  }

  const title = getAdmissionCategoryLabel(category)
  const isGuidelineCategoryView = category === 'guideline'
  const isPastExamLikeCategoryView = category === 'past_exam' || category === 'success_review'
  const admissionTypeTags = isGuidelineCategoryView ? extractAdmissionTypeTags(detail.title) : []
  const detailTitle = isGuidelineCategoryView
    ? detail.target_level ?? detail.title
    : detail.title
  const pastExamAdmissions = isPastExamLikeCategoryView ? detail.past_exam_admission_types ?? [] : []
  const isGuideImage = detail.guide_asset?.mime_type?.startsWith('image/') ?? false
  const isResourceImage = detail.resource_asset?.mime_type?.startsWith('image/') ?? false
  const guideAssetName = pickAssetName(detail.guide_asset ?? undefined)
  const resourceAssetName = pickAssetName(detail.resource_asset ?? undefined)

  const formatDateTime = (value: string) =>
    DateUtil.formatForDisplay(value, {
      locale: 'ko-KR',
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref={`/dashboard/teacher/admission-materials/${category}`}
        label={`${title} 목록으로 돌아가기`}
      />

      <header className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs text-slate-600">
            {title}
          </Badge>
          {isGuidelineCategoryView ? (
            admissionTypeTags.length > 0 ? (
              admissionTypeTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs text-slate-700">
                  {tag}
                </Badge>
              ))
            ) : null
          ) : isPastExamLikeCategoryView ? (
            <>
              {detail.past_exam_year ? (
                <Badge variant="secondary" className="text-xs text-slate-700">
                  {detail.past_exam_year}년
                </Badge>
              ) : null}
              {detail.past_exam_university ? (
                <Badge variant="secondary" className="text-xs text-slate-700">
                  {detail.past_exam_university}
                </Badge>
              ) : null}
              {pastExamAdmissions.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs text-slate-700">
                  {tag}
                </Badge>
              ))}
            </>
          ) : detail.target_level ? (
            <Badge variant="secondary" className="text-xs text-slate-700">
              {detail.target_level}
            </Badge>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">{detailTitle || '입시 자료'}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
          <span>
            작성자 {detail.author?.name ?? detail.author?.email ?? '미상'}
          </span>
          <span>등록 {formatDateTime(detail.created_at)}</span>
          <span>최종 수정 {formatDateTime(detail.updated_at)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link href={`/dashboard/teacher/admission-materials/${category}/${detail.id}/edit`}>
              자료 수정
            </Link>
          </Button>
          {!isPastExamLikeCategoryView ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/teacher/admission-materials/calendar">달력 보기</Link>
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">자료 설명</CardTitle>
            <CardDescription className="text-sm text-slate-500">
              자료 사용법과 참고 사항을 확인하세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {detail.description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{detail.description}</p>
            ) : (
              <p className="text-sm text-slate-400">작성된 설명이 없습니다.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">첨부 파일</CardTitle>
            <CardDescription className="text-sm text-slate-500">가이드와 참고 자료를 다운로드할 수 있습니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-slate-700">가이드</h3>
              {guideUrl ? (
                <div className="space-y-2">
                  <Button asChild size="sm" variant="outline">
                    <a href={guideUrl} target="_blank" rel="noreferrer">
                      {guideAssetName ?? '다운로드'}
                    </a>
                  </Button>
                  {isGuideImage ? (
                    <Image
                      src={guideUrl}
                      alt={guideAssetName ? `${guideAssetName} 미리보기` : '가이드 이미지 미리보기'}
                      width={800}
                      height={800}
                      className="max-h-48 w-full max-w-sm rounded-md border border-slate-200 object-contain"
                      loading="lazy"
                      sizes="(max-width: 768px) 100vw, 400px"
                      unoptimized
                    />
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-slate-400">첨부된 가이드가 없습니다.</p>
              )}
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-medium text-slate-700">참고 자료</h3>
              {resourceUrl ? (
                <div className="space-y-2">
                  <Button asChild size="sm" variant="outline">
                    <a href={resourceUrl} target="_blank" rel="noreferrer">
                      {resourceAssetName ?? '다운로드'}
                    </a>
                  </Button>
                  {isResourceImage ? (
                    <Image
                      src={resourceUrl}
                      alt={resourceAssetName ? `${resourceAssetName} 미리보기` : '참고 자료 이미지 미리보기'}
                      width={800}
                      height={800}
                      className="max-h-48 w-full max-w-sm rounded-md border border-slate-200 object-contain"
                      loading="lazy"
                      sizes="(max-width: 768px) 100vw, 400px"
                      unoptimized
                    />
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-slate-400">첨부된 참고 자료가 없습니다.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {!isPastExamLikeCategoryView ? (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">등록된 일정</CardTitle>
            <CardDescription className="text-sm text-slate-500">
              일정은 달력 페이지에서도 한 번에 확인할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {detail.schedules.length === 0 ? (
              <p className="text-sm text-slate-400">등록된 일정이 없습니다.</p>
            ) : (
              detail.schedules.map((schedule) => (
                <div key={schedule.id} className="rounded-md border border-slate-200 p-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">{schedule.title}</h3>
                    <div className="flex flex-col gap-1 text-sm text-slate-500 sm:text-right">
                      <span>시작 {formatDateTime(schedule.start_at)}</span>
                      {schedule.end_at ? <span>종료 {formatDateTime(schedule.end_at)}</span> : null}
                    </div>
                  </div>
                  {schedule.location ? (
                    <p className="mt-2 text-sm text-slate-600">장소 · {schedule.location}</p>
                  ) : null}
                  {schedule.memo ? (
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">{schedule.memo}</p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </section>
  )
}
