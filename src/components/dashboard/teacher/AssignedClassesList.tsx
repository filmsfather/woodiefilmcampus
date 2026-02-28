import Image from 'next/image'
import Link from 'next/link'
import { User } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { AssignedClass } from '@/lib/dashboard-data'
import { PROFILE_PHOTOS_BUCKET } from '@/lib/storage/buckets'
import { StudentInfoDialog } from '@/components/dashboard/teacher/StudentInfoDialog'

function getPhotoPublicUrl(path: string) {
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PROFILE_PHOTOS_BUCKET}/${path}`
}

interface AssignedClassesListProps {
    data: AssignedClass[]
}

export function AssignedClassesList({ data }: AssignedClassesListProps) {
    // #region agent log
    const _clientPayload = {
        sessionId: 'ec8ae8',
        runId: 'client',
        hypothesisId: 'H4',
        location: 'AssignedClassesList.tsx:render',
        message: 'client received assignedClasses',
        data: {
            classCount: data.length,
            classes: data.map((c) => ({ id: c.id, name: c.name, studentCount: c.students.length, studentNames: c.students.map((s) => s.name) })),
        },
        timestamp: Date.now(),
    }
    if (typeof fetch !== 'undefined') {
        fetch('http://127.0.0.1:7245/ingest/1509f3b7-f516-4a27-9591-ebd8d9271217', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ec8ae8' },
            body: JSON.stringify(_clientPayload),
        }).catch(() => {})
    }
    if (typeof console !== 'undefined') console.log('[DEBUG AssignedClassesList]', JSON.stringify(_clientPayload))
    // #endregion

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
                                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                                        {c.students.map((student) => (
                                            <StudentInfoDialog key={student.id} student={student}>
                                                <button
                                                    type="button"
                                                    className="group flex flex-col items-center gap-2 rounded-lg p-2 transition-colors hover:bg-slate-100"
                                                >
                                                    <span className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100 transition-shadow group-hover:border-indigo-300 group-hover:shadow-sm">
                                                        {student.photo_url ? (
                                                            <Image
                                                                src={getPhotoPublicUrl(student.photo_url)}
                                                                alt={`${student.name} 사진`}
                                                                width={72}
                                                                height={72}
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : (
                                                            <span className="flex h-full w-full items-center justify-center">
                                                                <User className="h-8 w-8 text-slate-400" />
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className="max-w-full truncate text-sm font-medium text-slate-700">
                                                        {student.name}
                                                    </span>
                                                </button>
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
