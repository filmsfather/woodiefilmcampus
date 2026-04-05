'use client'

import Image from 'next/image'
import { User } from 'lucide-react'

import { PROFILE_PHOTOS_BUCKET } from '@/lib/storage/buckets'
import { StudentInfoDialog } from '@/components/dashboard/teacher/StudentInfoDialog'

function getPhotoPublicUrl(path: string) {
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PROFILE_PHOTOS_BUCKET}/${path}`
}

interface StudentGridStudent {
    id: string
    name: string
    email: string
    student_phone?: string | null
    parent_phone?: string | null
    academic_record?: string | null
    photo_url?: string | null
}

interface StudentGridClientProps {
    students: StudentGridStudent[]
    studentClassMap?: Map<string, string[]>
}

export function StudentGridClient({ students, studentClassMap }: StudentGridClientProps) {
    return (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {students.map((student) => (
                <StudentInfoDialog key={student.id} student={student} assignedClassNames={studentClassMap?.get(student.id)}>
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
    )
}
