import type { SupabaseClient } from '@supabase/supabase-js'

import { ensureRichTextValue, isRichTextEmpty, sanitizeRichTextInput } from '@/lib/rich-text'

export const NOTICE_BOARD_BUCKET = 'notice-board'
export const NOTICE_MEDIA_SCOPE = 'notice'
export const MAX_NOTICE_ATTACHMENT_SIZE = 50 * 1024 * 1024 // 50MB total budget per post handled in actions

export interface StaffProfile {
  id: string
  role: 'manager' | 'teacher' | 'student'
  name: string
  email: string
}

export interface NoticeRecipientSummary {
  id: string
  name: string
  email: string
  role: 'manager' | 'teacher' | 'student'
  acknowledgedAt: string | null
  isViewer: boolean
}

export interface NoticeSummaryItem {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  author: {
    id: string
    name: string
    email: string
    role: 'principal' | 'manager' | 'teacher'
  }
  totalRecipients: number
  acknowledgedCount: number
  viewerAcknowledgedAt: string | null
  viewerIsAuthor: boolean
  isApplicationRequired: boolean
}

export interface NoticeAttachment {
  id: string
  assetId: string
  bucket: string
  path: string
  position: number
  mimeType: string | null
  signedUrl: string | null
  originalName?: string | null
}

export interface NoticeDetail extends NoticeSummaryItem {
  bodyHtml: string
  recipients: NoticeRecipientSummary[]
  attachments: NoticeAttachment[]
  applicationConfig: ApplicationConfig | null
}

import { ApplicationConfig, ApplicationFormData } from './notice-application'

type SupabaseClientLike = SupabaseClient

type NoticeRecipientRow = {
  recipient_id: string
  acknowledged_at: string | null
  recipient?: {
    id: string
    name: string | null
    email: string | null
    role: 'manager' | 'teacher' | 'student'
  } | null
}

type NoticeAttachmentRow = {
  id: string
  position: number | null
  media_asset?: {
    id: string
    bucket: string
    path: string
    mime_type: string | null
    metadata: Record<string, unknown> | null
  } | null
}

type NoticePostRow = {
  id: string
  title: string
  body?: string | null
  created_at: string
  updated_at: string
  author?: {
    id: string
    name: string | null
    email: string | null
    role: 'principal' | 'manager' | 'teacher'
  } | null
  notice_post_recipients?: NoticeRecipientRow[] | null
  notice_post_attachments?: NoticeAttachmentRow[] | null
  is_application_required?: boolean
  application_config?: unknown | null
}

export function normalizeRichText(value: string): string {
  return ensureRichTextValue(value ?? '')
}

export function isNoticeBodyEmpty(value: string): boolean {
  return isRichTextEmpty(value)
}

export function sanitizeStoredNoticeHtml(value: string): string {
  return sanitizeRichTextInput(value ?? '')
}

export function getProfileDisplayName(name?: string | null, fallback?: string | null): string {
  if (name && name.trim().length > 0) {
    return name.trim()
  }
  if (fallback && fallback.trim().length > 0) {
    return fallback.trim()
  }
  return '이름 없음'
}

export function sortStaffProfiles(entries: StaffProfile[]): StaffProfile[] {
  return [...entries].sort((a, b) => {
    if (a.role !== b.role) {
      return a.role === 'manager' ? -1 : 1
    }
    return getProfileDisplayName(a.name, a.email).localeCompare(getProfileDisplayName(b.name, b.email), 'ko')
  })
}

export async function fetchNoticeRecipientDirectory(
  supabase: SupabaseClientLike,
  options: { excludeIds?: string[] } = {}
): Promise<StaffProfile[]> {
  const excludeSet = new Set(options.excludeIds ?? [])
  const { data, error } = await supabase.rpc('list_notice_recipients')

  if (error) {
    console.error('[notice-board] failed to load recipient directory', error)
    return []
  }

  const entries = (data ?? []) as Array<{ id: string; name: string; email: string; role: 'manager' | 'teacher' | 'student' }>

  return sortStaffProfiles(
    entries
      .filter((entry) => entry?.id && !excludeSet.has(entry.id))
      .map((entry) => ({
        id: entry.id,
        role: entry.role,
        name: entry.name,
        email: entry.email,
      }))
  )
}

function mapRecipientRow(row: NoticeRecipientRow, viewerId: string): NoticeRecipientSummary {
  const target = row.recipient ?? null
  const role = target?.role ?? 'teacher'
  return {
    id: target?.id ?? row.recipient_id,
    role,
    name: getProfileDisplayName(target?.name ?? null, target?.email ?? null),
    email: target?.email ?? '',
    acknowledgedAt: row.acknowledged_at ?? null,
    isViewer: (target?.id ?? row.recipient_id) === viewerId,
  }
}

function mapNoticeSummary(row: NoticePostRow, viewerId: string): NoticeSummaryItem | null {
  if (!row?.id || !row?.title) {
    return null
  }

  const author = row.author ?? null
  const recipients = (row.notice_post_recipients ?? []).map((recipient) => mapRecipientRow(recipient, viewerId))
  const acknowledgedCount = recipients.filter((recipient) => Boolean(recipient.acknowledgedAt)).length
  const viewerRecipient = recipients.find((recipient) => recipient.isViewer)

  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: {
      id: author?.id ?? '',
      name: getProfileDisplayName(author?.name ?? null, author?.email ?? null),
      email: author?.email ?? '',
      role: author?.role ?? 'teacher',
    },
    totalRecipients: recipients.length,
    acknowledgedCount,
    viewerAcknowledgedAt: viewerRecipient?.acknowledgedAt ?? null,
    viewerIsAuthor: author?.id === viewerId,
    isApplicationRequired: row.is_application_required ?? false,
  }
}

export async function fetchNoticeSummaries(
  supabase: SupabaseClientLike,
  viewerId: string
): Promise<NoticeSummaryItem[]> {
  const { data, error } = await supabase
    .from('notice_posts')
    .select(
      `id,
       title,
       is_application_required,
       created_at,
       updated_at,
       author:profiles!notice_posts_author_id_fkey(id, name, email, role),
       notice_post_recipients:notice_post_recipients(recipient_id, acknowledged_at,
         recipient:profiles!notice_post_recipients_recipient_id_fkey(id, name, email, role)
       )
      `
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[notice-board] failed to fetch notice summaries', error)
    return []
  }

  return (data ?? [])
    .map((row) => mapNoticeSummary(row as unknown as NoticePostRow, viewerId))
    .filter((item): item is NoticeSummaryItem => Boolean(item))
}

async function mapAttachmentRow(
  supabase: SupabaseClientLike,
  row: NoticeAttachmentRow
): Promise<NoticeAttachment | null> {
  const asset = row.media_asset

  if (!asset?.id || !asset.path || !asset.bucket) {
    return null
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(asset.bucket)
    .createSignedUrl(asset.path, 60 * 60)

  if (signedError) {
    console.error('[notice-board] failed to sign attachment', signedError)
  }

  return {
    id: row.id,
    assetId: asset.id,
    bucket: asset.bucket,
    path: asset.path,
    position: row.position ?? 0,
    mimeType: asset.mime_type ?? null,
    signedUrl: signed?.signedUrl ?? null,
    originalName: typeof asset.metadata?.originalName === 'string' ? (asset.metadata.originalName as string) : null,
  }
}

export async function fetchNoticeDetail(
  supabase: SupabaseClientLike,
  noticeId: string,
  viewerId: string
): Promise<NoticeDetail | null> {
  const { data, error } = await supabase
    .from('notice_posts')
    .select(
      `id,
       title,
       body,
       is_application_required,
       application_config,
       created_at,
       updated_at,
       author:profiles!notice_posts_author_id_fkey(id, name, email, role),
       notice_post_recipients:notice_post_recipients(recipient_id, acknowledged_at,
         recipient:profiles!notice_post_recipients_recipient_id_fkey(id, name, email, role)
       ),
       notice_post_attachments:notice_post_attachments(
         id,
         position,
         media_asset:media_assets(id, bucket, path, mime_type, metadata)
       )
      `
    )
    .eq('id', noticeId)
    .maybeSingle()

  if (error) {
    console.error('[notice-board] failed to fetch notice detail', error)
    return null
  }

  if (!data) {
    return null
  }

  const typedRow = data as unknown as NoticePostRow
  const base = mapNoticeSummary(typedRow, viewerId)

  if (!base) {
    return null
  }

  const body = sanitizeStoredNoticeHtml(typedRow.body ?? '')
  const recipientSummaries = (typedRow.notice_post_recipients ?? []).map((recipient) =>
    mapRecipientRow(recipient, viewerId)
  )

  const attachments = await Promise.all(
    (typedRow.notice_post_attachments ?? []).map((attachment) =>
      mapAttachmentRow(supabase, attachment as unknown as NoticeAttachmentRow)
    )
  )

  return {
    ...base,
    bodyHtml: body,
    recipients: recipientSummaries,
    attachments: attachments
      .filter((item): item is NoticeAttachment => Boolean(item))
      .sort((a, b) => a.position - b.position),
    applicationConfig: (typedRow.application_config as ApplicationConfig) ?? null,
  }
}

export async function fetchNoticeApplication(
  supabase: SupabaseClientLike,
  noticeId: string,
  applicantId: string
) {
  const { data } = await supabase
    .from('notice_applications')
    .select('id, status, form_data')
    .eq('notice_id', noticeId)
    .eq('applicant_id', applicantId)
    .maybeSingle()

  return data
    ? {
      id: data.id,
      status: data.status,
      formData: data.form_data as ApplicationFormData,
    }
    : null
}

export async function fetchNoticeApplications(
  supabase: SupabaseClientLike,
  noticeId: string
) {
  const { data, error } = await supabase
    .from('notice_applications')
    .select(
      `id,
       status,
       form_data,
       created_at,
       applicant:profiles!notice_applications_applicant_id_fkey(id, name, email, role)
      `
    )
    .eq('notice_id', noticeId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[notice-board] failed to fetch applications', error)
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    status: row.status,
    formData: row.form_data as ApplicationFormData,
    createdAt: row.created_at,
    applicant: {
      id: Array.isArray(row.applicant) ? row.applicant[0]?.id : row.applicant?.id,
      name: getProfileDisplayName(
        Array.isArray(row.applicant) ? row.applicant[0]?.name : row.applicant?.name,
        Array.isArray(row.applicant) ? row.applicant[0]?.email : row.applicant?.email
      ),
      email: Array.isArray(row.applicant) ? row.applicant[0]?.email : row.applicant?.email,
      role: Array.isArray(row.applicant) ? row.applicant[0]?.role : row.applicant?.role,
    },
  }))
}

export async function fetchUnreadNotices(
  supabase: SupabaseClientLike,
  viewerId: string,
  limit = 5
): Promise<NoticeSummaryItem[]> {
  // We need to use !inner join to filter by recipient status
  const { data, error } = await supabase
    .from('notice_posts')
    .select(
      `id,
       title,
       is_application_required,
       created_at,
       updated_at,
       author:profiles!notice_posts_author_id_fkey(id, name, email, role),
       notice_post_recipients!inner(recipient_id, acknowledged_at,
         recipient:profiles!notice_post_recipients_recipient_id_fkey(id, name, email, role)
       )
      `
    )
    .eq('notice_post_recipients.recipient_id', viewerId)
    .is('notice_post_recipients.acknowledged_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[notice-board] failed to fetch unread notices', error)
    return []
  }

  return (data ?? [])
    .map((row) => mapNoticeSummary(row as unknown as NoticePostRow, viewerId))
    .filter((item): item is NoticeSummaryItem => Boolean(item))
}

export interface ClassWithStudents {
  id: string
  name: string
  studentIds: string[]
}

export async function fetchClassesWithStudents(
  supabase: SupabaseClientLike
): Promise<ClassWithStudents[]> {
  const { data, error } = await supabase
    .from('classes')
    .select(
      `id,
       name,
       class_students(student_id)
      `
    )
    .order('name', { ascending: true })

  if (error) {
    console.error('[notice-board] failed to fetch classes with students', error)
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    studentIds: (row.class_students ?? []).map((cs: { student_id: string }) => cs.student_id),
  }))
}
