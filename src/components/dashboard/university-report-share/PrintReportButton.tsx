'use client'

import { Printer } from 'lucide-react'

import { Button } from '@/components/ui/button'

export default function PrintReportButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-2 print:hidden"
      onClick={() => window.print()}
    >
      <Printer className="size-4" />
      인쇄 / PDF 저장
    </Button>
  )
}
