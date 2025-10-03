export type ActionStatus = 'idle' | 'success' | 'error'

export interface ActionState {
  status: ActionStatus
  message?: string
  fieldErrors?: Record<string, string[]>
}

export const initialActionState: ActionState = { status: 'idle' }

