'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Lecture } from '@/lib/lectures'

interface LectureFormProps {
    lecture?: Lecture
    action: (formData: FormData) => Promise<void>
}

export function LectureForm({ lecture, action }: LectureFormProps) {
    const [isPending, setIsPending] = useState(false)
    const [published, setPublished] = useState(lecture?.is_published ?? true)

    const handleSubmit = async (formData: FormData) => {
        setIsPending(true)
        try {
            await action(formData)
        } catch (error) {
            if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
                throw error
            }
            console.error(error)
            alert('오류가 발생했습니다.')
        } finally {
            setIsPending(false)
        }
    }

    return (
        <form action={handleSubmit} className="space-y-6 max-w-2xl">
            <div className="space-y-2">
                <Label htmlFor="title">강의 제목</Label>
                <Input
                    id="title"
                    name="title"
                    defaultValue={lecture?.title}
                    required
                    placeholder="예: 1강. 영화의 이해"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="youtube_url">YouTube 링크</Label>
                <Input
                    id="youtube_url"
                    name="youtube_url"
                    defaultValue={lecture?.youtube_url}
                    required
                    placeholder="https://www.youtube.com/watch?v=..."
                />
                <p className="text-xs text-slate-500">
                    YouTube 영상의 전체 주소를 입력해주세요.
                </p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="description">설명</Label>
                <Textarea
                    id="description"
                    name="description"
                    defaultValue={lecture?.description || ''}
                    placeholder="강의에 대한 간단한 설명을 입력하세요."
                    rows={5}
                />
            </div>

            <div className="flex items-center space-x-2">
                <input type="hidden" name="is_published" value={published ? 'on' : 'off'} />
                <Switch
                    id="is_published_switch"
                    checked={published}
                    onCheckedChange={setPublished}
                />
                <Label htmlFor="is_published_switch">공개 여부</Label>
            </div>

            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => history.back()}>
                    취소
                </Button>
                <Button type="submit" disabled={isPending}>
                    {isPending ? '저장 중...' : lecture ? '수정하기' : '등록하기'}
                </Button>
            </div>
        </form>
    )
}
