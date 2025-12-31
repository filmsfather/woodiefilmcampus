'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { FolderPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { QuickClassMaterialDialog } from './QuickClassMaterialDialog'

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

interface CreatedMaterial {
  id: string
  title: string
  description: string | null
  weekLabel: string | null
  subject: string
}

interface ClassTemplateMaterialDialogProps {
  open: boolean
  onClose: () => void
  subject: string
  subjectLabel: string
  options: MaterialOption[]
  selected: SelectedMaterial[]
  notes: string | null
  onSubmit: (selection: { materialIds: string[]; materialTitles: string[]; materialNotes: string | null }) => void
}

export function ClassTemplateMaterialDialog({
  open,
  onClose,
  subject,
  subjectLabel,
  options,
  selected,
  onSubmit,
}: ClassTemplateMaterialDialogProps) {
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(selected.map((item) => item.id)))
  const [selectedOrder, setSelectedOrder] = useState<string[]>(() => selected.map((item) => item.id))
  const [editedTitles, setEditedTitles] = useState<Map<string, string>>(
    () => new Map(selected.map((item) => [item.id, item.title]))
  )

  // 새 자료 추가 다이얼로그 상태
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  // 동적으로 추가된 자료 (DB에 저장된 후 목록에 추가)
  const [addedMaterials, setAddedMaterials] = useState<MaterialOption[]>([])

  useEffect(() => {
    if (!open) {
      return
    }
    setQuery('')
    setSelectedIds(new Set(selected.map((item) => item.id)))
    setSelectedOrder(selected.map((item) => item.id))
    setEditedTitles(new Map(selected.map((item) => [item.id, item.title])))
    setAddedMaterials([])
  }, [open, selected])

  // 새 자료가 생성되면 목록에 추가하고 자동 선택
  const handleMaterialCreated = useCallback((material: CreatedMaterial) => {
    const newOption: MaterialOption = {
      id: material.id,
      title: material.title,
      description: material.description,
      subject: material.subject,
      display: material.description
        ? `${material.title} - ${material.description}`
        : material.title,
      weekLabel: material.weekLabel,
    }

    setAddedMaterials((prev) => [newOption, ...prev])

    // 자동 선택
    setSelectedIds((prev) => new Set([...prev, material.id]))
    setSelectedOrder((prev) => [...prev, material.id])
    setEditedTitles((prev) => {
      const next = new Map(prev)
      next.set(material.id, newOption.display)
      return next
    })
  }, [])

  // 기존 옵션 + 새로 추가한 자료를 합쳐서 표시 (중복 ID 제거)
  const allOptions = useMemo(() => {
    const seen = new Set<string>()
    const result: MaterialOption[] = []
    for (const option of [...addedMaterials, ...options]) {
      if (!seen.has(option.id)) {
        seen.add(option.id)
        result.push(option)
      }
    }
    return result
  }, [addedMaterials, options])

  const filteredOptions = useMemo(() => {
    if (!query.trim()) {
      return allOptions
    }
    const tokens = query.trim().toLowerCase().split(/\s+/)
    return allOptions.filter((option) => {
      const haystack = `${option.display} ${option.description ?? ''} ${option.weekLabel ?? ''}`.toLowerCase()
      return tokens.every((token) => haystack.includes(token))
    })
  }, [allOptions, query])

  const optionMap = useMemo(() => new Map(allOptions.map((option) => [option.id, option])), [allOptions])

  const toggleSelection = (material: MaterialOption) => {
    const isSelected = selectedIds.has(material.id)

    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(material.id)) {
        next.delete(material.id)
      } else {
        next.add(material.id)
      }
      return next
    })

    setSelectedOrder((order) => {
      if (isSelected) {
        return order.filter((value) => value !== material.id)
      }
      if (order.includes(material.id)) {
        return order
      }
      return [...order, material.id]
    })

    setEditedTitles((titles) => {
      const next = new Map(titles)
      if (isSelected) {
        next.delete(material.id)
      } else if (!next.has(material.id)) {
        next.set(material.id, material.display)
      }
      return next
    })
  }

  const handleRemove = (id: string) => {
    setSelectedIds((prev) => {
      if (!prev.has(id)) {
        return prev
      }
      const next = new Set(prev)
      next.delete(id)
      return next
    })

    setSelectedOrder((order) => order.filter((value) => value !== id))

    setEditedTitles((titles) => {
      if (!titles.has(id)) {
        return titles
      }
      const next = new Map(titles)
      next.delete(id)
      return next
    })
  }

  const selectionMismatch = selectedIds.size > 0 && selectedIds.size !== editedTitles.size

  const selectedEntries = useMemo(() => selectedOrder.filter((id) => selectedIds.has(id)), [selectedOrder, selectedIds])

  const handleSubmit = () => {
    const ids = selectedEntries
    const materialIds = ids
    const titles = ids.map((id) => editedTitles.get(id) ?? '')
    onSubmit({
      materialIds,
      materialTitles: titles,
      materialNotes: null,
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

          {/* 새 자료 추가 버튼 */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowQuickAdd(true)}
            className="w-full gap-1"
          >
            <FolderPlus className="h-4 w-4" />
            새 자료 추가
          </Button>

          {selectedEntries.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">선택된 자료 ({selectedEntries.length}개) · 제목 수정 가능</p>
              <div className="space-y-2">
                {selectedEntries.map((id) => {
                  const option = optionMap.get(id)
                  return (
                    <div key={`selected-${id}`} className="flex items-center gap-2">
                      <div className="flex-1 space-y-1">
                        {option?.display ? (
                          <p className="text-xs text-slate-500">{option.display}</p>
                        ) : null}
                        <Input
                          value={editedTitles.get(id) ?? ''}
                          onChange={(event) =>
                            setEditedTitles((titles) => {
                              const next = new Map(titles)
                              next.set(id, event.target.value)
                              return next
                            })
                          }
                          placeholder="자료 제목을 입력해주세요"
                          className="text-sm"
                        />
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleRemove(id)}>
                        제거
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
              위에서 자료를 선택하거나, 새 자료를 추가하세요.
            </div>
          )}

          <div className="flex justify-end gap-2 pb-2">
            <Button variant="outline" onClick={onClose}>
              취소
            </Button>
            <Button onClick={handleSubmit} disabled={selectionMismatch}>
              저장
            </Button>
          </div>
        </div>

        {/* 새 자료 추가 Dialog */}
        <QuickClassMaterialDialog
          open={showQuickAdd}
          onClose={() => setShowQuickAdd(false)}
          subject={subject}
          subjectLabel={subjectLabel}
          onCreated={handleMaterialCreated}
        />
      </SheetContent>
    </Sheet>
  )
}
