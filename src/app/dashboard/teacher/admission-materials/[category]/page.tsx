import Link from 'next/link'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import DateUtil from '@/lib/date-util'
import {
  ADMISSION_MATERIALS_BUCKET,
  extractAdmissionTypeTags,
  getAdmissionCategoryDescription,
  getAdmissionCategoryLabel,
  isAdmissionMaterialCategory,
} from '@/lib/admission-materials'
import {
  PAST_EXAM_ADMISSION_TYPES,
  PAST_EXAM_UNIVERSITIES,
  PAST_EXAM_YEARS,
} from '@/lib/admission-materials-constants'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

interface AdmissionMaterialPostRow {
  id: string
  category: string
  target_level: string | null
  title: string
  description: string | null
  created_at: string
  updated_at: string
  author_name: string | null
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
  }>
}

interface AdmissionMaterialPostView extends AdmissionMaterialPostRow {
  guideUrl: string | null
  resourceUrl: string | null
  guideName: string | null
  resourceName: string | null
  nextSchedule: {
    title: string
    start_at: string
  } | null
}

export default async function AdmissionMaterialCategoryPage({
  params,
  searchParams,
}: {
  params: { category: string }
  searchParams?: Record<string, string | string[] | undefined>
}) {
  if (!isAdmissionMaterialCategory(params.category)) {
    notFound()
  }

  const category = params.category
  const isPastExamLikeCategoryView = category === 'past_exam' || category === 'success_review'
  const query = typeof searchParams?.q === 'string' ? searchParams.q.trim() : ''
  const yearParam = typeof searchParams?.year === 'string' ? searchParams.year.trim() : ''
  const universityParam = typeof searchParams?.university === 'string' ? searchParams.university.trim() : ''
  const typesParam = searchParams?.types
  const selectedAdmissionTypes = Array.isArray(typesParam)
    ? typesParam
    : typeof typesParam === 'string' && typesParam.length > 0
      ? typesParam.split(',')
      : []
  const normalizedAdmissionTypes = selectedAdmissionTypes
    .map((type) => type.trim())
    .filter((type) =>
      PAST_EXAM_ADMISSION_TYPES.includes(type as (typeof PAST_EXAM_ADMISSION_TYPES)[number])
    )

  const supabase = createServerSupabase()
  let postQuery = supabase
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
       profiles:profiles!admission_material_posts_created_by_fkey(name),
       guide_asset:media_assets!admission_material_posts_guide_asset_id_fkey(id, bucket, path, mime_type, metadata),
       resource_asset:media_assets!admission_material_posts_resource_asset_id_fkey(id, bucket, path, mime_type, metadata),
       schedules:admission_material_schedules(id, title, start_at, end_at)
      `
    )
    .eq('category', category)

  if (query) {
    const searchTargets = [
      `title.ilike.%${query}%`,
      `description.ilike.%${query}%`,
      `target_level.ilike.%${query}%`,
    ]
    if (isPastExamLikeCategoryView) {
      searchTargets.push(`past_exam_university.ilike.%${query}%`)
    }
    postQuery = postQuery.or(searchTargets.join(','))
  }

  if (isPastExamLikeCategoryView) {
    const parsedYear = Number.parseInt(yearParam, 10)
    if (yearParam && Number.isFinite(parsedYear)) {
      postQuery = postQuery.eq('past_exam_year', parsedYear)
    }

    if (universityParam) {
      postQuery = postQuery.eq('past_exam_university', universityParam)
    }

    if (normalizedAdmissionTypes.length > 0) {
      postQuery = postQuery.contains('past_exam_admission_types', normalizedAdmissionTypes)
    }
  }

  postQuery = postQuery.order('created_at', { ascending: false })

  const { data, error } = await postQuery

  if (error) {
    console.error('[admission-materials] failed to load posts', error)
    throw new Error('입시 자료를 불러올 수 없습니다.')
  }

  const normalizedPosts: AdmissionMaterialPostRow[] = (data ?? []).map((row) => {
    const authorRelation = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    const guideRelation = Array.isArray(row.guide_asset) ? row.guide_asset[0] : row.guide_asset
    const resourceRelation = Array.isArray(row.resource_asset) ? row.resource_asset[0] : row.resource_asset
    const schedules = Array.isArray(row.schedules) ? row.schedules : []

    return {
      id: String(row.id),
      category: String(row.category),
      target_level: (row.target_level ?? null) as string | null,
      title: String(row.title),
      description: (row.description ?? null) as string | null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      author_name: authorRelation?.name ?? null,
      past_exam_year:
        row.past_exam_year !== null && row.past_exam_year !== undefined ? Number(row.past_exam_year) : null,
      past_exam_university: (row.past_exam_university ?? null) as string | null,
      past_exam_admission_types: Array.isArray(row.past_exam_admission_types)
        ? row.past_exam_admission_types.map((item) => String(item))
        : null,
      guide_asset: guideRelation
        ? {
            id: String(guideRelation.id),
            bucket: String(guideRelation.bucket),
            path: String(guideRelation.path),
            mime_type: (guideRelation.mime_type ?? null) as string | null,
            metadata: (guideRelation.metadata ?? null) as Record<string, unknown> | null,
          }
        : null,
      resource_asset: resourceRelation
        ? {
            id: String(resourceRelation.id),
            bucket: String(resourceRelation.bucket),
            path: String(resourceRelation.path),
            mime_type: (resourceRelation.mime_type ?? null) as string | null,
            metadata: (resourceRelation.metadata ?? null) as Record<string, unknown> | null,
          }
        : null,
      schedules: schedules
        .map((schedule) => ({
          id: String(schedule.id),
          title: String(schedule.title),
          start_at: String(schedule.start_at),
          end_at: schedule.end_at ? String(schedule.end_at) : null,
        }))
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    }
  })

  const bucketClient = supabase.storage.from(ADMISSION_MATERIALS_BUCKET)

  const posts: AdmissionMaterialPostView[] = await Promise.all(
    normalizedPosts.map(async (post) => {
      const guidePath = post.guide_asset?.path ?? null
      const resourcePath = post.resource_asset?.path ?? null

      let guideUrl: string | null = null
      let resourceUrl: string | null = null

      if (guidePath) {
        const { data: signed, error: signedError } = await bucketClient.createSignedUrl(guidePath, 60 * 60)
        if (signedError) {
          console.error('[admission-materials] failed to sign guide url', signedError)
        } else {
          guideUrl = signed?.signedUrl ?? null
        }
      }

      if (resourcePath) {
        const { data: signed, error: signedError } = await bucketClient.createSignedUrl(resourcePath, 60 * 60)
        if (signedError) {
          console.error('[admission-materials] failed to sign resource url', signedError)
        } else {
          resourceUrl = signed?.signedUrl ?? null
        }
      }

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

      const now = Date.now()
      const nextSchedule = post.schedules.find((schedule) => new Date(schedule.start_at).getTime() >= now) ?? null

      return {
        ...post,
        guideUrl,
        resourceUrl,
        guideName: pickAssetName(post.guide_asset ?? undefined),
        resourceName: pickAssetName(post.resource_asset ?? undefined),
        nextSchedule: nextSchedule
          ? {
              title: nextSchedule.title,
              start_at: nextSchedule.start_at,
            }
          : null,
      }
    })
  )

  const title = getAdmissionCategoryLabel(category)
  const description = getAdmissionCategoryDescription(category)

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
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/teacher/admission-materials" label="입시 자료 아카이브로 돌아가기" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
            <p className="text-sm text-slate-600">{description}</p>
          </div>
          <Button asChild>
            <Link href={`/dashboard/teacher/admission-materials/${category}/new`}>자료 업로드</Link>
          </Button>
        </div>
      </div>

      <form className="flex flex-col gap-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[2fr,3fr]">
          <label className="flex flex-col gap-1 text-sm text-slate-500">
            <span className="font-medium text-slate-700">검색</span>
            <Input
              name="q"
              placeholder={
                isPastExamLikeCategoryView ? '제목, 연도 또는 대학으로 검색' : '제목, 대상 또는 설명으로 검색'
              }
              defaultValue={query}
              className="w-full"
            />
          </label>

          {isPastExamLikeCategoryView ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm text-slate-500">
                <span className="font-medium text-slate-700">년도</span>
                <select
                  name="year"
                  defaultValue={yearParam}
                  className="border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">전체</option>
                  {PAST_EXAM_YEARS.map((year) => (
                    <option key={year} value={year}>
                      {year}년
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm text-slate-500">
                <span className="font-medium text-slate-700">대학교</span>
                <select
                  name="university"
                  defaultValue={universityParam}
                  className="border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">전체</option>
                  {PAST_EXAM_UNIVERSITIES.map((university) => (
                    <option key={university} value={university}>
                      {university}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="flex flex-col gap-2 text-sm text-slate-500">
                <span className="font-medium text-slate-700">전형</span>
                <div className="flex flex-wrap gap-3">
                  {PAST_EXAM_ADMISSION_TYPES.map((type) => (
                    <label key={type} className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        name="types"
                        value={type}
                        defaultChecked={normalizedAdmissionTypes.includes(type)}
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="secondary">
            검색
          </Button>
          {(query || yearParam || universityParam || selectedAdmissionTypes.length > 0) ? (
            <Button type="button" variant="ghost" asChild>
              <Link href={`/dashboard/teacher/admission-materials/${category}`}>필터 초기화</Link>
            </Button>
          ) : null}
        </div>
      </form>

      {posts.length === 0 ? (
        <Card className="border-dashed border-slate-200 bg-slate-50">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-slate-500">
            <p>아직 등록된 자료가 없습니다. 첫 번째 자료를 업로드해보세요.</p>
            <Button asChild>
              <Link href={`/dashboard/teacher/admission-materials/${category}/new`}>자료 업로드</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
      <Card className="border-slate-200">
          <CardContent className="overflow-x-auto p-0">
            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow>
                  {isPastExamLikeCategoryView ? (
                    <>
                      <TableHead className="w-24">년도</TableHead>
                      <TableHead className="w-32">대학교</TableHead>
                      <TableHead className="w-28">전형</TableHead>
                      <TableHead className="w-48">제목</TableHead>
                    </>
                  ) : (
                    <TableHead className="w-48">제목</TableHead>
                  )}
                  {isPastExamLikeCategoryView ? null : <TableHead className="w-40">준비 대상</TableHead>}
                  {isPastExamLikeCategoryView ? null : <TableHead className="w-48">가이드</TableHead>}
                  <TableHead className="w-48">참고 자료</TableHead>
                  <TableHead>설명</TableHead>
                  {!isPastExamLikeCategoryView ? (
                    <TableHead className="w-48">다가오는 일정</TableHead>
                  ) : null}
                  {!isPastExamLikeCategoryView ? <TableHead className="w-40">수정일</TableHead> : null}
                  <TableHead className="w-32 text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => {
                  const isGuidelineCategoryView = category === 'guideline'
                  const trimmedTargetLevel = post.target_level ? post.target_level.trim() : ''
                  const displayTitle = isGuidelineCategoryView
                    ? trimmedTargetLevel || post.title
                    : post.title
                  const admissionTypeTags = isGuidelineCategoryView
                    ? extractAdmissionTypeTags(post.title)
                    : []
                  const pastExamAdmissions = post.past_exam_admission_types ?? []
                  const truncatedDescription = post.description
                    ? post.description.length > 5
                      ? `${post.description.slice(0, 5)}....`
                      : post.description
                    : null

                  return (
                    <TableRow key={post.id} className="align-top">
                      {isPastExamLikeCategoryView ? (
                        <>
                          <TableCell className="text-sm text-slate-600">
                            {post.past_exam_year ? `${post.past_exam_year}년` : (
                              <span className="text-xs text-slate-400">미입력</span>
                            )}
                          </TableCell>
                          <TableCell className="w-32 text-sm text-slate-600">
                            {post.past_exam_university ? (
                              post.past_exam_university
                            ) : (
                              <span className="text-xs text-slate-400">미입력</span>
                            )}
                          </TableCell>
                          <TableCell className="w-28 text-sm text-slate-600">
                            {pastExamAdmissions.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {pastExamAdmissions.map((type) => (
                                  <Badge key={type} variant="outline" className="text-xs">
                                    {type}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">미선택</span>
                            )}
                          </TableCell>
                        </>
                      ) : null}
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Link
                            href={`/dashboard/teacher/admission-materials/${category}/${post.id}`}
                            className="text-sm font-medium text-slate-900 hover:underline"
                          >
                            {displayTitle || '제목 미입력'}
                          </Link>
                          <span className="text-xs text-slate-500">
                            작성자 {post.author_name ?? '미상'}
                          </span>
                        </div>
                      </TableCell>
                      {isPastExamLikeCategoryView ? null : (
                        <TableCell className="text-sm text-slate-600">
                          {isGuidelineCategoryView ? (
                            admissionTypeTags.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {admissionTypeTags.map((tag) => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">전형 미선택</span>
                            )
                          ) : trimmedTargetLevel ? (
                            trimmedTargetLevel
                          ) : (
                            <span className="text-xs text-slate-400">미입력</span>
                          )}
                        </TableCell>
                      )}
                      {isPastExamLikeCategoryView ? null : (
                        <TableCell>
                          {post.guideUrl ? (
                            <Button asChild size="sm" variant="outline" className="text-xs">
                              <a href={post.guideUrl} target="_blank" rel="noreferrer">
                                다운로드
                              </a>
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400">첨부 없음</span>
                          )}
                          {post.guideName ? (
                            <p className="mt-1 text-[11px] text-slate-500">{post.guideName}</p>
                          ) : null}
                        </TableCell>
                      )}
                      <TableCell>
                        {post.resourceUrl ? (
                          <Button asChild size="sm" variant="outline" className="text-xs">
                            <a href={post.resourceUrl} target="_blank" rel="noreferrer">
                              다운로드
                            </a>
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">첨부 없음</span>
                        )}
                        {post.resourceName ? (
                          <p className="mt-1 text-[11px] text-slate-500">{post.resourceName}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-base text-slate-600">
                        {truncatedDescription ? (
                          <p className="whitespace-pre-line leading-relaxed">{truncatedDescription}</p>
                        ) : (
                          <span className="text-xs text-slate-400">미작성</span>
                        )}
                      </TableCell>
                      {!isPastExamLikeCategoryView ? (
                        <TableCell className="text-sm text-slate-600">
                          {post.nextSchedule ? (
                            <div className="flex flex-col gap-1">
                              <Badge variant="outline" className="w-fit text-xs">
                                {formatDateTime(post.nextSchedule.start_at)}
                              </Badge>
                              <span className="text-xs text-slate-500">{post.nextSchedule.title}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">등록된 일정 없음</span>
                          )}
                        </TableCell>
                      ) : null}
                      {!isPastExamLikeCategoryView ? (
                        <TableCell className="text-xs text-slate-500">
                          <span className="block font-medium text-slate-700">
                            {formatDateTime(post.updated_at)}
                          </span>
                          <span>작성일 {formatDateTime(post.created_at)}</span>
                        </TableCell>
                      ) : null}
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-2">
                          <Button asChild size="sm" variant="secondary">
                            <Link href={`/dashboard/teacher/admission-materials/${category}/${post.id}`}>
                              상세 보기
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/dashboard/teacher/admission-materials/${category}/${post.id}/edit`}>
                              수정
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
