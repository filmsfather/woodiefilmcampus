'use client'

import Link from 'next/link'
import { CalendarDays, GraduationCap, Phone, User } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'

interface StudentInfo {
    id: string
    name: string
    email: string
    student_phone?: string | null
    parent_phone?: string | null
    academic_record?: string | null
}

interface StudentInfoDialogProps {
    student: StudentInfo
    children: React.ReactNode
}

export function StudentInfoDialog({ student, children }: StudentInfoDialogProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        {student.name}
                    </DialogTitle>
                    <DialogDescription>{student.email}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-4">
                        <div className="flex items-start gap-3">
                            <Phone className="mt-0.5 h-4 w-4 text-slate-500" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium leading-none">연락처</p>
                                <div className="text-sm text-slate-600">
                                    <p>학생: {student.student_phone || '정보 없음'}</p>
                                    <p>학부모: {student.parent_phone || '정보 없음'}</p>
                                </div>
                            </div>
                        </div>
                        <Separator />
                        <div className="flex items-start gap-3">
                            <GraduationCap className="mt-0.5 h-4 w-4 text-slate-500" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium leading-none">학적/성적 특이사항</p>
                                <p className="text-sm text-slate-600 whitespace-pre-wrap">
                                    {student.academic_record || '기록된 특이사항이 없습니다.'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button asChild variant="outline" className="w-full sm:w-auto">
                        <Link href="/dashboard/teacher/absences">
                            <CalendarDays className="mr-2 h-4 w-4" />
                            결석계 작성
                        </Link>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
