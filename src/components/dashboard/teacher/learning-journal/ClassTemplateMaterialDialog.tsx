'use client'

import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface MaterialOption {
  id: string
  title: string
  description: string | null
  subject: string
  display: string
  weekLabel: string | null
}

interface SelectedMaterial {
  id: string
  title: string
}

interface ClassTemplateMaterialDialogProps {
  open: boolean
  onClose: () => void
  subjectLabel: string
  options: MaterialOption[]
  selected: SelectedMaterial[]
  notes: string | null
  onSubmit: (selection: { materialIds: string[]; materialTitles: string[]; materialNotes: string | null }) => void
}

export function ClassTemplateMaterialDialog({
  open,
  onClose,
  subjectLabel,
  options,
  selected,
  notes,
  onSubmit,
}: ClassTemplateMaterialDialogProps) {
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(selected.map((item) => item.id)))
  const [editedTitles, setEditedTitles] = useState<Map<string, string>>(new Map(selected.map((item) => [item.id, item.title])))
  const [materialNotes, setMaterialNotes] = useState<string>(notes ?? '')

  useEffect(() => {
    if (!open) {
      return
    }
    setQuery('')
    setSelectedIds(new Set(selected.map((item) => item.id)))
    setEditedTitles(new Map(selected.map((item) => [item.id, item.title])))
    setMaterialNotes(notes ?? '')
  }, [open, selected, notes])

  const filteredOptions = useMemo(() => {
    if (!query.trim()) {
      return options
    }
    const tokens = query.trim().toLowerCase().split(/\s+/)
    return options.filter((option) => {
      const haystack = `${option.display} ${option.description ?? ''} ${option.weekLabel ?? ''}`.toLowerCase()
      return tokens.every((token) => haystack.includes(token))
    })
  }, [options, query])

  const toggleSelection = (material: MaterialOption) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(material.id)) {
        next.delete(material.id)
      } else {
        next.add(material.id)
        if (!editedTitles.has(material.id)) {
          setEditedTitles((titles) => new Map(titles).set(material.id, material.display))
        }
      }
      return next
    })
  }

  const handleSubmit = () => {
    const ids = Array.from(selectedIds)
    const titles = ids.map((id) => editedTitles.get(id) ?? '')
    onSubmit({
      materialIds: ids,
      materialTitles: titles,
      materialNotes,
    })
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={(value) => { if (!value) onClose() }}>
      <SheetContent side="right" className="w-full max-w-xl sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{subjectLabel} · 수업자료 선택</SheetTitle>
        </SheetHeader>

        <div className="flex h-full flex-col gap-4">
          <div className="flex items-center gap-2">
            <Input
              placeholder="자료 제목, 설명 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button variant="outline" onClick={() => setQuery('')} size="sm">
              초기화
            </Button>
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-2">
            {filteredOptions.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">검색 결과가 없습니다.</div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = selectedIds.has(option.id)
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleSelection(option)}
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-left text-sm transition',
                      isSelected
                        ? 'border-sky-500 bg-sky-50 text-sky-700'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{option.display}</span>
                      <div className="flex items-center gap-2">
                        {option.weekLabel ? <Badge variant="outline">{option.weekLabel}</Badge> : null}
                        {isSelected ? <Badge variant="default">선택됨</Badge> : null}
                      </div>
                    </div>
                    {option.description ? (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">{option.description}</p>
                    ) : null}
                  </button>
                )
              })
            )}
          </div>

          {selectedIds.size > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">선택된 자료 제목 수정</p>
              {Array.from(selectedIds).map((id) => (
                <Input
                  key={`selected-${id}`}
                  value={editedTitles.get(id) ?? ''}
                  onChange={(event) => setEditedTitles((titles) => new Map(titles).set(id, event.target.value))}
                  className="text-sm"
                />
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs text-slate-500">주차 상세 메모 (학생/교사 모두에게 노출)</p>
            <Textarea
              value={materialNotes}
              onChange={(event) => setMaterialNotes(event.target.value)}
              rows={4}
              maxLength={2000}
            />
          </div>

          <div className="flex justify-end gap-2 pb-2">
            <Button variant="outline" onClick={onClose}>
              취소
            </Button>
            <Button onClick={handleSubmit} disabled={selectedIds.size !== editedTitles.size}>
              저장
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
