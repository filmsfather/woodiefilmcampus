'use client'

import { useIsFetching, useIsMutating } from '@tanstack/react-query'

import { FullScreenSpinner } from '@/components/ui/fullscreen-spinner'
import { useGlobalLoadingStore } from '@/lib/global-loading-store'

interface GlobalQueryLoaderProps {
  label?: string
}

export function GlobalQueryLoader({ label }: GlobalQueryLoaderProps) {
  const isFetching = useIsFetching()
  const isMutating = useIsMutating()
  const hasManualPending = useGlobalLoadingStore((state) => state.pendingKeys.size > 0)

  if (!isFetching && !isMutating && !hasManualPending) {
    return null
  }

  return <FullScreenSpinner label={label ?? '불러오는 중입니다…'} />
}
