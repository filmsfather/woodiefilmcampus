import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAuthContext } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

export async function AssignedClassesList() {
    const { profile } = await getAuthContext()

    if (!profile || !['teacher', 'manager', 'principal'].includes(profile.role)) {
        return null
    }

    const supabase = createServerSupabase()

    // 1. Fetch classes where user is homeroom teacher
    const { data: homeroomClasses } = await supabase
        .from('classes')
        .select('id, name')
        .eq('homeroom_teacher_id', profile.id)

    // 2. Fetch classes where user is a subject teacher
    const { data: subjectClassesRel } = await supabase
        .from('class_teachers')
        .select('class_id, classes(id, name)')
        .eq('teacher_id', profile.id)

    // Merge and deduplicate classes
    const classMap = new Map<string, { id: string; name: string; isHomeroom: boolean }>()

    homeroomClasses?.forEach((c) => {
        classMap.set(c.id, { id: c.id, name: c.name, isHomeroom: true })
    })

    subjectClassesRel?.forEach((rel) => {
        const c = Array.isArray(rel.classes) ? rel.classes[0] : rel.classes
        if (c && !classMap.has(c.id)) {
            classMap.set(c.id, { id: c.id, name: c.name, isHomeroom: false })
        }
    })

    const classes = Array.from(classMap.values())

    if (classes.length === 0) {
        return null
    }

    // 3. Fetch students for each class
    const classesWithStudents = await Promise.all(
        classes.map(async (c) => {
            const { data: students } = await supabase
                .from('profiles')
                .select('id, name')
                .eq('class_id', c.id)
                .eq('role', 'student')
                .order('name')

            return {
                ...c,
                students: students || [],
            }
        })
    )

    return (
        <section className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">내 반 정보</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {classesWithStudents.map((c) => (
                    <Card key={c.id} className="border-slate-200 shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-lg font-medium text-slate-900">
                                {c.name}
                            </CardTitle>
                            {c.isHomeroom && (
                                <Badge variant="default" className="bg-indigo-600 hover:bg-indigo-700">
                                    담임
                                </Badge>
                            )}
                        </CardHeader>
                        <CardContent>
                            <div className="mt-2">
                                <p className="mb-2 text-sm font-medium text-slate-500">
                                    구성원 ({c.students.length}명)
                                </p>
                                {c.students.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {c.students.map((student) => (
                                            <Badge
                                                key={student.id}
                                                variant="secondary"
                                                className="font-normal text-slate-700"
                                            >
                                                {student.name}
                                            </Badge>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-400">등록된 학생이 없습니다.</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </section>
    )
}
