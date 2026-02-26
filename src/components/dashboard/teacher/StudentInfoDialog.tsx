'use client'

import { useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, Camera, GraduationCap, Loader2, Phone, Trash2, User, X, ZoomIn } from 'lucide-react'

import { compressImageFile, isImageFile } from '@/lib/image-compress'
import { PROFILE_PHOTOS_BUCKET } from '@/lib/storage/buckets'
import { createClient } from '@/lib/supabase/client'
import { updateStudentPhoto, deleteStudentPhoto } from '@/app/dashboard/teacher/actions'
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
    photo_url?: string | null
}

interface StudentInfoDialogProps {
    student: StudentInfo
    children: React.ReactNode
}

const MAX_PHOTO_SIZE = 5 * 1024 * 1024 // 5MB
const COMPRESS_TARGET_SIZE = 500 * 1024 // 500KB

function buildProfilePhotoPath(studentId: string) {
    return `students/${studentId}/${Date.now()}.jpg`
}

export function StudentInfoDialog({ student, children }: StudentInfoDialogProps) {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [isUploading, startUploadTransition] = useTransition()
    const [isDeleting, startDeleteTransition] = useTransition()
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [isPhotoExpanded, setIsPhotoExpanded] = useState(false)

    const supabase = createClient()

    // Public URL 생성
    const getPublicUrl = (path: string) => {
        const { data } = supabase.storage.from(PROFILE_PHOTOS_BUCKET).getPublicUrl(path)
        return data.publicUrl
    }

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        // 파일 타입 검증
        if (!isImageFile(file)) {
            setFeedback({ type: 'error', message: '이미지 파일만 업로드할 수 있습니다.' })
            return
        }

        // 파일 크기 검증
        if (file.size > MAX_PHOTO_SIZE) {
            setFeedback({ type: 'error', message: '사진 크기는 5MB 이하로 업로드해주세요.' })
            return
        }

        setFeedback(null)

        // 미리보기 표시
        const objectUrl = URL.createObjectURL(file)
        setPreviewUrl(objectUrl)

        startUploadTransition(async () => {
            try {
                // 이미지 압축
                const { file: compressedFile } = await compressImageFile(file, COMPRESS_TARGET_SIZE)

                // 스토리지에 업로드
                const path = buildProfilePhotoPath(student.id)
                const { error: uploadError } = await supabase.storage
                    .from(PROFILE_PHOTOS_BUCKET)
                    .upload(path, compressedFile, {
                        cacheControl: '3600',
                        upsert: false,
                        contentType: 'image/jpeg',
                    })

                if (uploadError) {
                    throw uploadError
                }

                // 서버 액션으로 DB 업데이트
                const result = await updateStudentPhoto({
                    studentId: student.id,
                    photoPath: path,
                })

                if (result.error) {
                    // 업로드된 파일 삭제
                    await supabase.storage.from(PROFILE_PHOTOS_BUCKET).remove([path])
                    setFeedback({ type: 'error', message: result.error })
                    setPreviewUrl(null)
                } else {
                    setFeedback({ type: 'success', message: '사진이 등록되었습니다.' })
                    router.refresh()
                }
            } catch (error) {
                console.error('[StudentInfoDialog] upload error', error)
                setFeedback({ type: 'error', message: '사진 업로드에 실패했습니다.' })
                setPreviewUrl(null)
            } finally {
                if (fileInputRef.current) {
                    fileInputRef.current.value = ''
                }
            }
        })
    }

    const handleDelete = () => {
        if (!student.photo_url) return

        setFeedback(null)

        startDeleteTransition(async () => {
            try {
                const result = await deleteStudentPhoto({ studentId: student.id })

                if (result.error) {
                    setFeedback({ type: 'error', message: result.error })
                } else {
                    setFeedback({ type: 'success', message: '사진이 삭제되었습니다.' })
                    setPreviewUrl(null)
                    router.refresh()
                }
            } catch (error) {
                console.error('[StudentInfoDialog] delete error', error)
                setFeedback({ type: 'error', message: '사진 삭제에 실패했습니다.' })
            }
        })
    }

    const displayPhotoUrl = previewUrl || (student.photo_url ? getPublicUrl(student.photo_url) : null)
    const isProcessing = isUploading || isDeleting

    return (
        <Dialog>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <div className="flex items-start gap-4">
                        {/* 프로필 사진 영역 */}
                        <div className="flex flex-col items-center gap-2">
                            <button
                                type="button"
                                className="group relative h-20 w-20 overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100"
                                disabled={!displayPhotoUrl || isProcessing}
                                onClick={() => displayPhotoUrl && setIsPhotoExpanded(true)}
                            >
                                {displayPhotoUrl ? (
                                    <>
                                        <Image
                                            src={displayPhotoUrl}
                                            alt={`${student.name} 사진`}
                                            fill
                                            className="object-cover"
                                        />
                                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                                            <ZoomIn className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                                        </span>
                                    </>
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center">
                                        <User className="h-10 w-10 text-slate-400" />
                                    </div>
                                )}
                                {isProcessing && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                                    </div>
                                )}
                            </button>

                            {/* 사진 업로드/삭제 버튼 */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                                capture="environment"
                                className="hidden"
                                onChange={handleFileSelect}
                            />

                            {student.photo_url ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                                    onClick={handleDelete}
                                    disabled={isProcessing}
                                >
                                    <Trash2 className="mr-1 h-3 w-3" />
                                    삭제
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-slate-600 hover:bg-slate-100"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isProcessing}
                                >
                                    <Camera className="mr-1 h-3 w-3" />
                                    추가
                                </Button>
                            )}
                        </div>

                        {/* 이름 및 이메일 */}
                        <div className="flex-1 pt-2">
                            <DialogTitle className="flex items-center gap-2">
                                {student.name}
                            </DialogTitle>
                            <DialogDescription>{student.email}</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* 피드백 메시지 */}
                {feedback && (
                    <div
                        className={[
                            'rounded-md border px-3 py-2 text-sm',
                            feedback.type === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-red-200 bg-red-50 text-red-600',
                        ].join(' ')}
                    >
                        {feedback.message}
                    </div>
                )}

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

            {isPhotoExpanded && displayPhotoUrl && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-6 animate-in fade-in duration-150"
                    onClick={() => setIsPhotoExpanded(false)}
                >
                    <button
                        type="button"
                        className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white transition-colors hover:bg-white/40"
                        onClick={() => setIsPhotoExpanded(false)}
                    >
                        <X className="h-5 w-5" />
                    </button>
                    <div className="relative h-[70vmin] w-[70vmin] max-h-[480px] max-w-[480px] overflow-hidden rounded-2xl">
                        <Image
                            src={displayPhotoUrl}
                            alt={`${student.name} 사진`}
                            fill
                            className="object-cover"
                            sizes="(max-width: 480px) 70vmin, 480px"
                        />
                    </div>
                    <p className="absolute bottom-6 text-sm font-medium text-white/80">
                        {student.name}
                    </p>
                </div>
            )}
        </Dialog>
    )
}
