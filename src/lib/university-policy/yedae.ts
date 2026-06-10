/**
 * 예술·전문대학(예대군) 식별 집합.
 *
 * 일반대(4년제) 6장 카드와 별개로 "추가 지원" 대상이 되는 전문대·예대를 구분한다.
 * 리포트 뷰모델·희망대학 선정 등 여러 곳에서 공유하므로 단일 출처로 분리한다.
 */

export const YEDAE_UNIVERSITY_IDS: ReadonlySet<string> = new Set<string>([
  'seoularts', // 서울예대
  'dima', // 동아방송예대
  'seoil', // 서일대
  'baekseok-arts', // 백석예대
  'baekje', // 백제예대
])

export function isYedaeUniversity(universityId: string): boolean {
  return YEDAE_UNIVERSITY_IDS.has(universityId)
}

export type WishlistCategory = 'general' | 'specialized'

/** 대학 id로 희망대학 카테고리(일반대/전문대·예대)를 판정한다. */
export function resolveWishlistCategory(universityId: string): WishlistCategory {
  return isYedaeUniversity(universityId) ? 'specialized' : 'general'
}
