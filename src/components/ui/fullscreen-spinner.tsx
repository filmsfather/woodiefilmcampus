'use client'

import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

interface FullScreenSpinnerProps {
  label?: string
  dimmed?: boolean
  className?: string
}

interface SpinnerIconProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_MAP: Record<NonNullable<SpinnerIconProps['size']>, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
}

export function FullScreenSpinner({
  label,
  dimmed = true,
  className,
}: FullScreenSpinnerProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-3',
        dimmed && 'bg-background/60 backdrop-blur-sm',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      {label ? <span className="text-sm text-muted-foreground">{label}</span> : null}
    </div>
  )
}

export function SpinnerIcon({ size = 'sm', className }: SpinnerIconProps) {
  return <Loader2 className={cn('animate-spin text-current', SIZE_MAP[size], className)} />
}
