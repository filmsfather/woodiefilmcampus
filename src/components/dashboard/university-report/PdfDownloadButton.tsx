'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

import { createSnapshotDownloadUrl } from '@/app/dashboard/student/university-report/actions'
import { Button } from '@/components/ui/button'

interface PdfDownloadButtonProps {
  snapshotId: string
}

export default function PdfDownloadButton({ snapshotId }: PdfDownloadButtonProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    setPending(true)
    setError(null)

    const result = await createSnapshotDownloadUrl({ snapshotId })
    setPending(false)

    if ('error' in result) {
      setError(result.error)
      return
    }

    window.open(result.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={handleClick}
        disabled={pending}
        className="gap-1"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        원본 PDF 다운로드
      </Button>
      {error ? <span className="text-[11px] text-red-600">{error}</span> : null}
    </div>
  )
}
