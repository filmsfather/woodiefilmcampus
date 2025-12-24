'use client'

import { RefreshCw } from 'lucide-react'
import { useFormStatus } from 'react-dom'
import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { regeneratePeriodLearningJournalWeeklyAction } from '@/app/dashboard/teacher/learning-journal/actions'
import type { ActionState } from '@/app/dashboard/manager/classes/action-state'

const initialState: ActionState = {
    status: 'idle',
    message: '',
}

function SubmitButton() {
    const { pending } = useFormStatus()

    return (
        <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={pending}
            className="gap-2"
        >
            <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
            {pending ? '전체 갱신 중...' : '최신 데이터 불러오기'}
        </Button>
    )
}

interface RegeneratePeriodButtonProps {
    periodId: string
}

export function RegeneratePeriodButton({ periodId }: RegeneratePeriodButtonProps) {
    const [state, formAction] = useActionState(regeneratePeriodLearningJournalWeeklyAction, initialState)

    useEffect(() => {
        if (state.status === 'success') {
            toast.success(state.message)
        } else if (state.status === 'error') {
            toast.error(state.message)
        }
    }, [state])

    return (
        <form action={formAction}>
            <input type="hidden" name="periodId" value={periodId} />
            <SubmitButton />
        </form>
    )
}
