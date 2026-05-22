import { createAdminClient } from "@/lib/supabase/admin"
import { createClient as createServerSupabase } from "@/lib/supabase/server"

export type ValueAnalysisGenre = {
  id: string
  name: string
  sort_order: number
}

export type ValueAnalysisPostListItem = {
  id: string
  title: string
  description: string | null
  studentId: string
  studentName: string
  classId: string | null
  className: string | null
  genreId: string
  genreName: string
  mediaAssetId: string | null
  isFeatured: boolean
  featuredBy: string | null
  featuredComment: string | null
  featuredCommentedAt: string | null
  createdAt: string
}

export type ValueAnalysisFilters = {
  classes: { id: string; name: string }[]
  genres: ValueAnalysisGenre[]
}

export type ValueAnalysisListResult = {
  items: ValueAnalysisPostListItem[]
  filters: ValueAnalysisFilters
  totalCount: number
  page: number
  perPage: number
  totalPages: number
}

const SPECIAL_CLASS_KEYWORD = "한예종"

function isSpecialClassName(name: string | null | undefined): boolean {
  return typeof name === "string" && name.includes(SPECIAL_CLASS_KEYWORD)
}

export async function fetchValueAnalysisPosts(params: {
  page?: number
  perPage?: number
  classIds?: string[] | null
  genreId?: string | null
  studentName?: string | null
  title?: string | null
  featuredOnly?: boolean
}): Promise<ValueAnalysisListResult> {
  const {
    page = 1,
    perPage = 30,
    classIds,
    genreId,
    studentName,
    title,
    featuredOnly = false,
  } = params

  const normalizedClassIds = Array.from(
    new Set((classIds ?? []).filter((id): id is string => typeof id === "string" && id.length > 0))
  )

  const supabase = await createServerSupabase()

  const { data: genres } = await supabase
    .from("value_analysis_genres")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true })

  const { data: classesRaw } = await supabase
    .from("classes")
    .select("id, name")
    .order("name", { ascending: true })

  const allClasses = (classesRaw ?? []) as { id: string; name: string }[]
  const generalClasses = allClasses.filter((c) => !isSpecialClassName(c.name))

  // 선택한 반에 속한 학생 IDs를 추출(legacy posts.class_id 대신 class_students 정본 사용)
  let restrictedStudentIds: string[] | null = null
  if (normalizedClassIds.length > 0) {
    const { data: matchingMembers } = await supabase
      .from("class_students")
      .select("student_id")
      .in("class_id", normalizedClassIds)
    restrictedStudentIds = Array.from(
      new Set(
        ((matchingMembers ?? []) as { student_id: string }[]).map((row) => row.student_id)
      )
    )

    if (restrictedStudentIds.length === 0) {
      // 매칭되는 학생이 없으면 빈 결과 반환
      return {
        items: [],
        filters: {
          classes: generalClasses,
          genres: (genres ?? []) as ValueAnalysisGenre[],
        },
        totalCount: 0,
        page,
        perPage,
        totalPages: 1,
      }
    }
  }

  let query = supabase
    .from("value_analysis_posts")
    .select(
      `
      id,
      title,
      description,
      student_id,
      class_id,
      genre_id,
      media_asset_id,
      is_featured,
      featured_by,
      featured_comment,
      featured_commented_at,
      created_at,
      student:profiles!value_analysis_posts_student_id_fkey(name),
      genre:value_analysis_genres!value_analysis_posts_genre_id_fkey(name)
    `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })

  if (restrictedStudentIds && restrictedStudentIds.length > 0) {
    query = query.in("student_id", restrictedStudentIds)
  }

  if (genreId) {
    query = query.eq("genre_id", genreId)
  }

  if (featuredOnly) {
    query = query.eq("is_featured", true)
  }

  if (studentName && studentName.trim().length > 0) {
    query = query.ilike("student:profiles!value_analysis_posts_student_id_fkey.name", `%${studentName.trim()}%`)
  }

  if (title && title.trim().length > 0) {
    query = query.ilike("title", `%${title.trim()}%`)
  }

  const offset = (page - 1) * perPage
  query = query.range(offset, offset + perPage - 1)

  const { data, count, error } = await query

  if (error) {
    console.error("[value-analysis] fetch posts error", error)
  }

  type RawRow = {
    id: string
    title: string
    description: string | null
    student_id: string
    class_id: string | null
    genre_id: string
    media_asset_id: string | null
    is_featured: boolean
    featured_by: string | null
    featured_comment: string | null
    featured_commented_at: string | null
    created_at: string
    student: { name: string | null } | { name: string | null }[] | null
    genre: { name: string | null } | { name: string | null }[] | null
  }

  const rows = (data ?? []) as unknown as RawRow[]

  // 페이지에 등장하는 학생들의 일반 반(한예종 특강 제외) 이름을 일괄 조회
  const studentIds = Array.from(new Set(rows.map((r) => r.student_id)))
  const classNamesByStudent = new Map<string, string[]>()
  if (studentIds.length > 0) {
    const { data: memberRows } = await supabase
      .from("class_students")
      .select("student_id, class_id, classes:classes!class_students_class_id_fkey(name)")
      .in("student_id", studentIds)

    type MemberRow = {
      student_id: string
      class_id: string
      classes: { name: string | null } | { name: string | null }[] | null
    }

    for (const row of (memberRows ?? []) as unknown as MemberRow[]) {
      const rel = Array.isArray(row.classes) ? row.classes[0] : row.classes
      const name = rel?.name ?? null
      if (!name || isSpecialClassName(name)) continue
      const list = classNamesByStudent.get(row.student_id) ?? []
      list.push(name)
      classNamesByStudent.set(row.student_id, list)
    }
  }

  const items: ValueAnalysisPostListItem[] = rows.map((row) => {
    const studentRel = Array.isArray(row.student) ? row.student[0] : row.student
    const genreRel = Array.isArray(row.genre) ? row.genre[0] : row.genre
    const names = classNamesByStudent.get(row.student_id) ?? []

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      studentId: row.student_id,
      studentName: studentRel?.name ?? "이름 없음",
      classId: row.class_id,
      className: names.length > 0 ? names.join(", ") : null,
      genreId: row.genre_id,
      genreName: genreRel?.name ?? "미분류",
      mediaAssetId: row.media_asset_id,
      isFeatured: row.is_featured,
      featuredBy: row.featured_by,
      featuredComment: row.featured_comment,
      featuredCommentedAt: row.featured_commented_at,
      createdAt: row.created_at,
    }
  })

  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage))

  return {
    items,
    filters: {
      classes: generalClasses,
      genres: (genres ?? []) as ValueAnalysisGenre[],
    },
    totalCount,
    page,
    perPage,
    totalPages,
  }
}

export async function setValueAnalysisPostFeatured(params: {
  postId: string
  featured: boolean
  featuredBy: string
  comment?: string | null
}) {
  const { postId, featured, featuredBy, comment } = params
  const admin = createAdminClient()
  const trimmedComment = typeof comment === "string" ? comment.trim() : null
  const now = new Date().toISOString()

  const { error } = await admin
    .from("value_analysis_posts")
    .update({
      is_featured: featured,
      featured_by: featured ? featuredBy : null,
      featured_at: featured ? now : null,
      featured_comment: featured ? trimmedComment : null,
      featured_commented_at: featured ? now : null,
    })
    .eq("id", postId)

  if (error) {
    console.error("[value-analysis] failed to toggle featured", error)
    return { success: false as const, error: "추천 상태를 변경하지 못했습니다." }
  }

  return { success: true as const }
}
