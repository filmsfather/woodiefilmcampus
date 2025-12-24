'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createQuickClassMaterialAction } from '@/app/dashboard/teacher/class-materials/actions'

interface CreatedMaterial {
  id: string
  title: string
  description: string | null
  weekLabel: string | null
  subject: string
}

interface QuickClassMaterialDialogProps {
  open: boolean
  onClose: () => void
  subject: string
  subjectLabel: string
  onCreated: (material: CreatedMaterial) => void
}

const WEEK_OPTIONS = [
  { value: 'none', label: '선택 안함' },
  { value: '1주차', label: '1주차' },
  { value: '2주차', label: '2주차' },
  { value: '3주차', label: '3주차' },
  { value: '4주차', label: '4주차' },
]

export function QuickClassMaterialDialog({
  open,
  onClose,
  subject,
  subjectLabel,
  onCreated,
}: QuickClassMaterialDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [weekLabel, setWeekLabel] = useState('none')

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setWeekLabel('none')
    setError(null)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = () => {
    if (!title.trim()) {
      setError('제목을 입력해주세요.')
      return
    }

    setError(null)

    startTransition(async () => {
      const result = await createQuickClassMaterialAction(
        subject,
        title,
        description,
        weekLabel === 'none' ? '' : weekLabel
      )

      if (result.error) {
        setError(result.error)
        return
      }

      if (result.success && result.material) {
        onCreated(result.material)
        handleClose()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>새 수업 자료 추가</DialogTitle>
          <DialogDescription>
            {subjectLabel} 과목에 새로운 수업 자료를 빠르게 추가합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="quick-material-title">
              제목 <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="quick-material-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 이야기 원론 - 플롯"
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-material-description">설명</Label>
            <Textarea
              id="quick-material-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="수업 내용에 대한 간단한 설명을 입력하세요."
              rows={3}
              maxLength={1000}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-material-week">주차 라벨</Label>
            <Select value={weekLabel} onValueChange={setWeekLabel}>
              <SelectTrigger id="quick-material-week">
                <SelectValue placeholder="선택 안함" />
              </SelectTrigger>
              <SelectContent>
                {WEEK_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? '저장 중...' : '저장하고 선택'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

