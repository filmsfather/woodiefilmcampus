'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

interface EntryNavigationProps {
    currentEntryId: string
    entries: Array<{
        id: string
        studentId: string
        studentName: string
    }>
}

export function EntryNavigation({ currentEntryId, entries }: EntryNavigationProps) {
    const router = useRouter()
    const currentIndex = entries.findIndex((e) => e.id === currentEntryId)
    const prevEntry = entries[currentIndex - 1]
    const nextEntry = entries[currentIndex + 1]

    const handleNavigate = (entryId: string) => {
        router.push(`/dashboard/teacher/learning-journal/entries/${entryId}`)
    }

    if (entries.length <= 1) {
        return null
    }

    return (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
            <Button
                variant="ghost"
                size="sm"
                disabled={!prevEntry}
                onClick={() => prevEntry && handleNavigate(prevEntry.id)}
                className="h-8 gap-1 pl-2 pr-3 text-slate-600"
            >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">이전 학생</span>
            </Button>

            <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400" />
                <Select value={currentEntryId} onValueChange={handleNavigate}>
                    <SelectTrigger className="h-8 w-[180px] border-none bg-transparent shadow-none focus:ring-0">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {entries.map((entry) => (
                            <SelectItem key={entry.id} value={entry.id}>
                                {entry.studentName}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <Button
                variant="ghost"
                size="sm"
                disabled={!nextEntry}
                onClick={() => nextEntry && handleNavigate(nextEntry.id)}
                className="h-8 gap-1 pl-3 pr-2 text-slate-600"
            >
                <span className="hidden sm:inline">다음 학생</span>
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
    )
}
