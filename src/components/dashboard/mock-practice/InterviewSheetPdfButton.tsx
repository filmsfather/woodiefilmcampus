'use client'

import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { InterviewSheetDetail } from '@/types/interview-sheet'

export function InterviewSheetPdfButton({ sheet }: { sheet: InterviewSheetDetail }) {
  const [isGenerating, setIsGenerating] = useState(false)

  const handleDownload = async () => {
    setIsGenerating(true)
    try {
      const { generateInterviewSheetPdf } = await import('@/lib/interview-sheet-pdf')
      await generateInterviewSheetPdf(sheet)
    } catch (error) {
      console.error('[interview-sheets] PDF 생성 실패', error)
      window.alert('PDF 생성에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={isGenerating} onClick={handleDownload}>
      {isGenerating ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
      ) : (
        <FileDown className="mr-1 h-4 w-4" />
      )}
      PDF 다운로드
    </Button>
  )
}
