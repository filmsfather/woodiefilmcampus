'use client'

import { useIsFetching, useIsMutating } from '@tanstack/react-query'

import { FullScreenSpinner } from '@/components/ui/fullscreen-spinner'

interface GlobalQueryLoaderProps {
  label?: string
}

export function GlobalQueryLoader({ label }: GlobalQueryLoaderProps) {
  const isFetching = useIsFetching()
  const isMutating = useIsMutating()

  if (!isFetching && !isMutating) {
    return null
  }

  return <FullScreenSpinner label={label ?? '불러오는 중입니다…'} />
}
