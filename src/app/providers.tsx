'use client'

import { ReactNode } from 'react'

import { GlobalQueryLoader } from '@/components/providers/GlobalQueryLoader'
import { ReactQueryProvider } from '@/components/providers/ReactQueryProvider'

interface AppProvidersProps {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ReactQueryProvider>
      {children}
      <GlobalQueryLoader />
    </ReactQueryProvider>
  )
}
