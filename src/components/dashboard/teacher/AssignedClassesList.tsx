import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { AssignedClass } from '@/lib/dashboard-data'
import { StudentInfoDialog } from '@/components/dashboard/teacher/StudentInfoDialog'

interface AssignedClassesListProps {
    data: AssignedClass[]
}

export function AssignedClassesList({ data }: AssignedClassesListProps) {
    if (data.length === 0) {
        return null
    }

    return (
        <section className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">내 반 정보</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {data.map((c) => (
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
                                            <StudentInfoDialog key={student.id} student={student}>
                                                <Badge
                                                    variant="secondary"
                                                    className="cursor-pointer hover:bg-slate-200 transition-colors"
                                                >
                                                    {student.name}
                                                </Badge>
                                            </StudentInfoDialog>
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
                                <Link href={`/dashboard/teacher/learning-journal?classId=${c.id}`}>
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
