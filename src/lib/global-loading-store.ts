'use client'

import { create } from 'zustand'

interface GlobalLoadingState {
  pendingKeys: Set<string>
  add: (key: string) => void
  remove: (key: string) => void
}

export const useGlobalLoadingStore = create<GlobalLoadingState>((set) => ({
  pendingKeys: new Set<string>(),
  add: (key) =>
    set((state) => {
      const next = new Set(state.pendingKeys)
      next.add(key)
      return { pendingKeys: next }
    }),
  remove: (key) =>
    set((state) => {
      const next = new Set(state.pendingKeys)
      next.delete(key)
      return { pendingKeys: next }
    }),
}))
