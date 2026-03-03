'use server'

import { revalidatePath } from 'next/cache'
import { ensurePrincipalProfile } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'

const JOURNAL_PATH = '/dashboard/principal/business-journal'

export interface LedgerEntryRow {
  id: string
  month_token: string
  entry_type: 'income' | 'expense'
  label: string
  amount: number | null
  sort_order: number
  created_by: string
}

export async function loadLedgerEntries(monthToken: string): Promise<LedgerEntryRow[]> {
  const profile = await ensurePrincipalProfile()
  if (!profile) return []

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('business_journal_ledger')
    .select('id, month_token, entry_type, label, amount, sort_order, created_by')
    .eq('month_token', monthToken)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[loadLedgerEntries]', error.message)
    return []
  }

  return (data ?? []) as LedgerEntryRow[]
}

export async function upsertLedgerEntry(input: {
  id?: string
  monthToken: string
  entryType: 'income' | 'expense'
  label: string
  amount: number | null
  sortOrder: number
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const profile = await ensurePrincipalProfile()
  if (!profile) return { success: false, error: '권한이 없습니다.' }

  const supabase = createAdminClient()

  if (input.id) {
    const { error } = await supabase
      .from('business_journal_ledger')
      .update({
        label: input.label,
        amount: input.amount,
        sort_order: input.sortOrder,
      })
      .eq('id', input.id)

    if (error) {
      console.error('[upsertLedgerEntry:update]', error.message)
      return { success: false, error: error.message }
    }

    return { success: true, id: input.id }
  }

  const { data, error } = await supabase
    .from('business_journal_ledger')
    .insert({
      month_token: input.monthToken,
      entry_type: input.entryType,
      label: input.label,
      amount: input.amount,
      sort_order: input.sortOrder,
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[upsertLedgerEntry:insert]', error.message)
    return { success: false, error: error.message }
  }

  return { success: true, id: data?.id }
}

export async function loadJournalMemo(monthToken: string): Promise<string> {
  const profile = await ensurePrincipalProfile()
  if (!profile) return ''

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('business_journal_memo')
    .select('content')
    .eq('month_token', monthToken)
    .maybeSingle()

  if (error) {
    console.error('[loadJournalMemo]', error.message)
    return ''
  }

  return data?.content ?? ''
}

export async function saveJournalMemo(input: {
  monthToken: string
  content: string
}): Promise<{ success: boolean; error?: string }> {
  const profile = await ensurePrincipalProfile()
  if (!profile) return { success: false, error: '권한이 없습니다.' }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('business_journal_memo')
    .upsert(
      {
        month_token: input.monthToken,
        content: input.content,
        created_by: profile.id,
      },
      { onConflict: 'month_token,created_by' },
    )

  if (error) {
    console.error('[saveJournalMemo]', error.message)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function deleteLedgerEntry(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const profile = await ensurePrincipalProfile()
  if (!profile) return { success: false, error: '권한이 없습니다.' }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('business_journal_ledger')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[deleteLedgerEntry]', error.message)
    return { success: false, error: error.message }
  }

  revalidatePath(JOURNAL_PATH)
  return { success: true }
}
