import { requireAuthForDashboard } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { NameQuizClient } from "@/components/dashboard/principal/NameQuizClient"

export interface NameQuizClass {
  id: string
  name: string
  students: Array<{
    id: string
    name: string
    photo_url: string | null
  }>
}

export default async function NameQuizPage() {
  await requireAuthForDashboard("principal")
  const supabase = await createClient()

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name")
    .order("name", { ascending: true })

  if (!classes || classes.length === 0) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">학생 이름외우기</h1>
        <p className="text-slate-500">등록된 반이 없습니다.</p>
      </section>
    )
  }

  const classIds = classes.map((c) => c.id)

  const { data: classStudentsData } = await supabase
    .from("class_students")
    .select(
      "class_id, student_id, profiles!class_students_student_id_fkey(id, name, photo_url)"
    )
    .in("class_id", classIds)

  const studentsByClass = new Map<
    string,
    Array<{ id: string; name: string; photo_url: string | null }>
  >()

  classStudentsData?.forEach((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    if (profile && profile.name) {
      const list = studentsByClass.get(row.class_id) || []
      list.push({
        id: profile.id,
        name: profile.name,
        photo_url: profile.photo_url ?? null,
      })
      studentsByClass.set(row.class_id, list)
    }
  })

  const classesWithStudents: NameQuizClass[] = classes
    .map((c) => {
      const students = studentsByClass.get(c.id) || []
      students.sort((a, b) => a.name.localeCompare(b.name, "ko"))
      return { id: c.id, name: c.name, students }
    })
    .filter((c) => c.students.length > 0)

  return <NameQuizClient classes={classesWithStudents} />
}
