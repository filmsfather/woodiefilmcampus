import Link from 'next/link'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import DateUtil from '@/lib/date-util'
import {
  ClassMaterialSubject,
  CLASS_MATERIALS_BUCKET,
  getClassMaterialSubjectDescription,
  getClassMaterialSubjectLabel,
  isClassMaterialSubject,
} from '@/lib/class-materials'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

interface ClassMaterialPostRow {
  id: string
  subject: ClassMaterialSubject
  week_label: string | null
  title: string
  description: string | null
  created_at: string
  updated_at: string
  author_name: string | null
  class_material_asset?: {
    id: string
    bucket: string
    path: string
    mime_type: string | null
  } | null
  student_handout_asset?: {
    id: string
    bucket: string
    path: string
    mime_type: string | null
  } | null
}

interface ClassMaterialPostView extends ClassMaterialPostRow {
  classMaterialUrl: string | null
  studentHandoutUrl: string | null
}

export default async function ClassMaterialSubjectPage({
  params,
  searchParams,
}: {
  params: { subject: string }
  searchParams?: Record<string, string | string[] | undefined>
}) {
  if (!isClassMaterialSubject(params.subject)) {
    notFound()
  }

  const subject = params.subject
  const query = typeof searchParams?.q === 'string' ? searchParams?.q.trim() : ''

  const supabase = createServerSupabase()
  let postQuery = supabase
    .from('class_material_posts')
    .select(
      `id,
       subject,
       week_label,
       title,
       description,
       created_at,
       updated_at,
       profiles:profiles!class_material_posts_created_by_fkey(name),
       class_material_asset:media_assets!class_material_posts_class_material_asset_id_fkey(id, bucket, path, mime_type),
       student_handout_asset:media_assets!class_material_posts_student_handout_asset_id_fkey(id, bucket, path, mime_type)
      `
    )
    .eq('subject', subject)

  if (query) {
    postQuery = postQuery.or(
      `title.ilike.%${query}%,week_label.ilike.%${query}%,description.ilike.%${query}%`
    )
  }

  postQuery = postQuery.order('week_label', { ascending: true, nullsFirst: false })
  postQuery = postQuery.order('created_at', { ascending: false })

  const { data, error } = await postQuery

  if (error) {
    console.error('[class-materials] failed to load posts', error)
    throw new Error('수업자료를 불러올 수 없습니다.')
  }

  const normalizedPosts: ClassMaterialPostRow[] = (data ?? []).map((row) => {
    const authorRelation = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    const classMaterialRelation = Array.isArray(row.class_material_asset)
      ? row.class_material_asset[0]
      : row.class_material_asset
    const studentHandoutRelation = Array.isArray(row.student_handout_asset)
      ? row.student_handout_asset[0]
      : row.student_handout_asset

    return {
      id: String(row.id),
      subject: row.subject as ClassMaterialSubject,
      week_label: (row.week_label ?? null) as string | null,
      title: String(row.title),
      description: (row.description ?? null) as string | null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      author_name: authorRelation?.name ?? null,
      class_material_asset: classMaterialRelation
        ? {
            id: String(classMaterialRelation.id),
            bucket: String(classMaterialRelation.bucket),
            path: String(classMaterialRelation.path),
            mime_type: (classMaterialRelation.mime_type ?? null) as string | null,
          }
        : null,
      student_handout_asset: studentHandoutRelation
        ? {
            id: String(studentHandoutRelation.id),
            bucket: String(studentHandoutRelation.bucket),
            path: String(studentHandoutRelation.path),
            mime_type: (studentHandoutRelation.mime_type ?? null) as string | null,
          }
        : null,
    }
  })

  const bucketClient = supabase.storage.from(CLASS_MATERIALS_BUCKET)

  const posts: ClassMaterialPostView[] = await Promise.all(
    normalizedPosts.map(async (post) => {
      const classMaterialPath = post.class_material_asset?.path ?? null
      const studentHandoutPath = post.student_handout_asset?.path ?? null

      let classMaterialUrl: string | null = null
      let studentHandoutUrl: string | null = null

      if (classMaterialPath) {
        const { data: signed, error: signedError } = await bucketClient.createSignedUrl(classMaterialPath, 60 * 60)
        if (signedError) {
          console.error('[class-materials] failed to sign class material url', signedError)
        } else {
          classMaterialUrl = signed?.signedUrl ?? null
        }
      }

      if (studentHandoutPath) {
        const { data: signed, error: signedError } = await bucketClient.createSignedUrl(studentHandoutPath, 60 * 60)
        if (signedError) {
          console.error('[class-materials] failed to sign handout url', signedError)
        } else {
          studentHandoutUrl = signed?.signedUrl ?? null
        }
      }

      return {
        ...post,
        classMaterialUrl,
        studentHandoutUrl,
      }
    })
  )

  const title = getClassMaterialSubjectLabel(subject)
  const description = getClassMaterialSubjectDescription(subject)

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
        <DashboardBackLink fallbackHref="/dashboard/teacher/class-materials" label="수업자료 아카이브로 돌아가기" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
            <p className="text-sm text-slate-600">{description}</p>
          </div>
          <Button asChild>
            <Link href={`/dashboard/teacher/class-materials/${subject}/new`}>자료 업로드</Link>
          </Button>
        </div>
      </div>

      <form className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <label className="flex flex-col gap-1 text-sm text-slate-500 sm:flex-1">
          <span className="font-medium text-slate-700">검색</span>
          <Input
            name="q"
            placeholder="주차, 제목 또는 설명으로 검색"
            defaultValue={query}
            className="w-full"
          />
        </label>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">
            검색
          </Button>
          {query ? (
            <Button type="button" variant="ghost" asChild>
              <Link href={`/dashboard/teacher/class-materials/${subject}`}>초기화</Link>
            </Button>
          ) : null}
        </div>
      </form>

      {posts.length === 0 ? (
        <Card className="border-dashed border-slate-200 bg-slate-50">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-slate-500">
            <p>아직 등록된 자료가 없습니다. 첫 번째 자료를 업로드해보세요.</p>
            <Button asChild>
              <Link href={`/dashboard/teacher/class-materials/${subject}/new`}>자료 업로드</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200">
          <CardContent className="overflow-x-auto p-0">
            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">주차</TableHead>
                  <TableHead className="w-64">제목</TableHead>
                  <TableHead className="w-56">수업자료</TableHead>
                  <TableHead className="w-56">학생 유인물</TableHead>
                  <TableHead>수업 설명</TableHead>
                  <TableHead className="w-40">수정일</TableHead>
                  <TableHead className="w-32 text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => (
                  <TableRow key={post.id} className="align-top">
                    <TableCell className="text-sm text-slate-700">
                      {post.week_label ? post.week_label : <span className="text-slate-300">-</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Link
                          href={`/dashboard/teacher/class-materials/${subject}/${post.id}`}
                          className="text-sm font-medium text-slate-900 hover:underline"
                        >
                          {post.title}
                        </Link>
                        <span className="text-xs text-slate-500">작성자 {post.author_name ?? '미상'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {post.classMaterialUrl ? (
                        <Button asChild size="sm" variant="outline" className="text-xs">
                          <a href={post.classMaterialUrl} target="_blank" rel="noreferrer">
                            다운로드
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">첨부 없음</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {post.studentHandoutUrl ? (
                        <Button asChild size="sm" variant="outline" className="text-xs">
                          <a href={post.studentHandoutUrl} target="_blank" rel="noreferrer">
                            다운로드
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">첨부 없음</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {post.description ? (
                        <p className="whitespace-nowrap text-ellipsis overflow-hidden" title={post.description}>
                          {post.description.length > 5 ? `${post.description.slice(0, 5)}…` : post.description}
                        </p>
                      ) : (
                        <span className="text-xs text-slate-400">미작성</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      <span className="block font-medium text-slate-700">{formatDateTime(post.updated_at)}</span>
                      <span>작성일 {formatDateTime(post.created_at)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-2">
                        <Button asChild size="sm" variant="secondary">
                          <Link href={`/dashboard/teacher/class-materials/${subject}/${post.id}`}>상세 보기</Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/teacher/class-materials/${subject}/${post.id}/edit`}>수정</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
