'use client'

import { useEffect, useState } from 'react'

/**
 * Debug: logs actual number of student buttons in DOM per class (H7/H8).
 * Renders a visible banner when expected !== actual (for deployment without console).
 * Remove after confirming fix.
 */
export function AssignedClassesListDOMCount() {
    const [mismatch, setMismatch] = useState<Array<{ classId: string; expected: number; actual: number }> | null>(null)

    useEffect(() => {
        const grids = document.querySelectorAll<HTMLElement>('[data-debug-class-id]')
        const counts: Array<{ classId: string; expected: number; actual: number }> = []
        grids.forEach((el) => {
            const expected = parseInt(el.getAttribute('data-debug-expected-count') ?? '0', 10)
            const actual = el.querySelectorAll('button').length
            counts.push({ classId: el.getAttribute('data-debug-class-id') ?? '', expected, actual })
        })
        const mismatched = counts.filter((x) => x.expected !== x.actual)
        if (mismatched.length > 0) setMismatch(mismatched)

        const payload = {
            sessionId: 'ec8ae8',
            runId: 'client',
            hypothesisId: 'H7-H8',
            location: 'AssignedClassesListDOMCount.tsx:useEffect',
            message: 'DOM button count per class',
            data: { counts, mismatched },
            timestamp: Date.now(),
        }
        if (typeof fetch !== 'undefined') {
            fetch('http://127.0.0.1:7245/ingest/1509f3b7-f516-4a27-9591-ebd8d9271217', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ec8ae8' },
                body: JSON.stringify(payload),
            }).catch(() => {})
        }
        if (typeof console !== 'undefined') console.log('[DEBUG AssignedClassesList DOM count]', JSON.stringify(payload))
    }, [])

    if (!mismatch || mismatch.length === 0) return null
    return (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status" aria-live="polite">
            [디버그] 구성원 버튼 수 불일치: {mismatch.map((m) => `expected ${m.expected} actual ${m.actual}`).join(', ')}
        </div>
    )
}
