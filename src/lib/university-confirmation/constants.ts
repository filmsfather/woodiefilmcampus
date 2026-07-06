/**
 * 대학 최종 확정 폼의 "수업 희망 요일" 옵션 정의.
 *
 * 폼(FinalConfirmationForm)·확정 리스트(ConfirmedWishlistView)·서버 검증에서 공유하는
 * 단일 출처이므로 값(key)을 바꾸면 저장된 데이터와의 정합성을 함께 검토해야 한다.
 */

export type WeekdayPreference = 'weekday' | 'saturday' | 'sunday' | 'online'

export interface WeekdayPreferenceOption {
  value: WeekdayPreference
  label: string
  schedule: string
}

export const WEEKDAY_PREFERENCE_OPTIONS: readonly WeekdayPreferenceOption[] = [
  { value: 'weekday', label: '평일반', schedule: '화·목 저녁 6시~10시' },
  { value: 'saturday', label: '토요반', schedule: '오전 11시 30분~8시' },
  { value: 'sunday', label: '일요반', schedule: '오전 11시 30분~8시' },
  { value: 'online', label: '온라인반', schedule: '일정 조율' },
] as const

export const WEEKDAY_PREFERENCE_VALUES: readonly WeekdayPreference[] =
  WEEKDAY_PREFERENCE_OPTIONS.map((option) => option.value)

const WEEKDAY_PREFERENCE_LABEL_MAP = new Map<WeekdayPreference, WeekdayPreferenceOption>(
  WEEKDAY_PREFERENCE_OPTIONS.map((option) => [option.value, option])
)

export function isWeekdayPreference(value: string): value is WeekdayPreference {
  return WEEKDAY_PREFERENCE_LABEL_MAP.has(value as WeekdayPreference)
}

/** 저장된 요일 값을 "평일반(화·목 저녁 6시~10시)" 형태의 라벨로 변환한다. */
export function formatWeekdayPreference(value: string): string {
  const option = WEEKDAY_PREFERENCE_LABEL_MAP.get(value as WeekdayPreference)
  if (!option) return value
  return `${option.label}(${option.schedule})`
}

/** 요일 값의 짧은 라벨만 반환한다(배지 등 좁은 UI용). */
export function weekdayPreferenceLabel(value: string): string {
  return WEEKDAY_PREFERENCE_LABEL_MAP.get(value as WeekdayPreference)?.label ?? value
}
