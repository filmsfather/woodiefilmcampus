'use client'

import { useRouter } from 'next/navigation'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import type { LearningJournalPeriodWithClass } from '@/types/learning-journal'

interface PeriodSelectorProps {
    periods: LearningJournalPeriodWithClass[]
    selectedPeriodId: string
}

export function PeriodSelector({ periods, selectedPeriodId }: PeriodSelectorProps) {
    const router = useRouter()

    const handleValueChange = (value: string) => {
        const params = new URLSearchParams()
        params.set('period', value)
        router.push(`/dashboard/teacher/learning-journal?${params.toString()}`)
    }

    // If there are no periods, we don't render the selector or render a disabled one.
    // But usually this component is used when periods exist.
    if (periods.length === 0) {
        return null
    }

    return (
        <div className="w-full md:w-[400px]">
            <Select value={selectedPeriodId} onValueChange={handleValueChange}>
                <SelectTrigger>
                    <SelectValue placeholder="주기를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                    {periods.map((period) => (
                        <SelectItem key={period.id} value={period.id}>
                            {period.className} · {period.startDate} ~ {period.endDate}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}
