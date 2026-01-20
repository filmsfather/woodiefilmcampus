// 장비 대여 시스템 타입 및 유틸리티

export type EquipmentSetType = 'set_a' | 'set_b'
export type EquipmentSlotStatus = 'open' | 'reserved' | 'closed'
export type EquipmentRentalStatus = 'pending' | 'rented' | 'returned'

export interface EquipmentSlot {
  id: string
  slot_date: string
  set_type: EquipmentSetType
  status: EquipmentSlotStatus
  notes: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface EquipmentRental {
  id: string
  slot_id: string
  student_id: string
  class_id: string | null
  memo: string | null
  status: EquipmentRentalStatus
  checkout_photo_path: string | null
  return_photo_path: string | null
  checked_out_at: string | null
  returned_at: string | null
  created_at: string
  updated_at: string
}

export const SET_TYPE_LABELS: Record<EquipmentSetType, string> = {
  set_a: 'A 세트',
  set_b: 'B 세트',
}

export const SLOT_STATUS_LABELS: Record<EquipmentSlotStatus, string> = {
  open: '예약 가능',
  reserved: '예약됨',
  closed: '마감',
}

export const RENTAL_STATUS_LABELS: Record<EquipmentRentalStatus, string> = {
  pending: '대여 대기',
  rented: '대여 중',
  returned: '반납 완료',
}

export function formatSetTypeLabel(setType: EquipmentSetType): string {
  return SET_TYPE_LABELS[setType] ?? setType
}

export function formatSlotStatusLabel(status: EquipmentSlotStatus): string {
  return SLOT_STATUS_LABELS[status] ?? status
}

export function formatRentalStatusLabel(status: EquipmentRentalStatus): string {
  return RENTAL_STATUS_LABELS[status] ?? status
}

export function getSlotStatusBadgeStyle(status: EquipmentSlotStatus): string {
  switch (status) {
    case 'open':
      return 'bg-emerald-100 text-emerald-700'
    case 'reserved':
      return 'bg-amber-100 text-amber-700'
    case 'closed':
      return 'bg-slate-200 text-slate-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

export function getRentalStatusBadgeStyle(status: EquipmentRentalStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-blue-100 text-blue-700'
    case 'rented':
      return 'bg-amber-100 text-amber-700'
    case 'returned':
      return 'bg-emerald-100 text-emerald-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

// 달력 관련 유틸 함수들 (counseling.ts에서 재사용 가능하도록)
export {
  getKstDate,
  formatDateToISO,
  getTodayISOInKst,
  getMonthRange,
  buildCalendarCells,
  shiftIsoDate,
  type CalendarCell,
  type MonthRange,
} from './counseling'

// 스토리지 경로 빌드
export function buildEquipmentPhotoPath(
  studentId: string,
  rentalId: string,
  type: 'checkout' | 'return'
): string {
  const timestamp = Date.now()
  const randomId = crypto.randomUUID().slice(0, 8)
  return `${studentId}/${rentalId}/${type}_${timestamp}_${randomId}.jpg`
}

