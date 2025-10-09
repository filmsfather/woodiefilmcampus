import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_MAP: Record<NonNullable<LoadingSpinnerProps['size']>, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
}

export function LoadingSpinner({ size = 'sm', className }: LoadingSpinnerProps) {
  return <Loader2 className={cn('animate-spin text-current', SIZE_MAP[size], className)} />
}
