import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
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
    // 3. Fetch students for each class using class_students table
    const classIds = classes.map((c) => c.id)
    const { data: classStudentsData } = await supabase
        .from('class_students')
        .select('class_id, student_id, profiles!class_students_student_id_fkey(id, name)')
        .in('class_id', classIds)

    const studentsByClass = new Map<string, Array<{ id: string; name: string }>>()

    classStudentsData?.forEach((row) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
        if (profile && profile.name) {
            const list = studentsByClass.get(row.class_id) || []
            list.push({ id: profile.id, name: profile.name })
            studentsByClass.set(row.class_id, list)
        }
    })

    const classesWithStudents = classes.map((c) => {
        const students = studentsByClass.get(c.id) || []
        students.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        return {
            ...c,
            students,
        }
    })

    classesWithStudents.sort((a, b) => a.name.localeCompare(b.name, 'ko'))

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
                                                variant="outline"
                                                className="font-normal text-slate-600"
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
                        <CardFooter className="grid grid-cols-2 gap-2">
                            <Button asChild variant="outline" size="sm" className="w-full">
                                <Link href="/dashboard/assignments/new">
                                    과제출제
                                </Link>
                            </Button>
                            <Button asChild variant="outline" size="sm" className="w-full">
                                <Link href={`/dashboard/teacher/review/${c.id}`}>
                                    과제검사
                                </Link>
                            </Button>
                            <Button asChild variant="outline" size="sm" className="w-full">
                                <Link href="/dashboard/teacher/learning-journal">
                                    학습일지
                                </Link>
                            </Button>
                            <Button variant="outline" size="sm" className="w-full" disabled>
                                표준교육과정
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </section>
    )
}
