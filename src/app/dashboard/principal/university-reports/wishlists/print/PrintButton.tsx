'use client'

import { Printer } from 'lucide-react'

import { Button } from '@/components/ui/button'

export default function PrintButton() {
  return (
    <Button type="button" size="sm" className="gap-1" onClick={() => window.print()}>
      <Printer className="size-4" /> 인쇄 / PDF 저장
    </Button>
  )
}
