import type { SupabaseClient } from '@supabase/supabase-js'

export const CCTV_CONSENT_TYPE = 'cctv_privacy'

/**
 * 약관 본문이 변경되면 이 값을 새로 갱신해 모든 사용자에게 재동의를 받습니다.
 */
export const CURRENT_CCTV_CONSENT_VERSION = '2026-05-10'

export interface CctvConsentSection {
  title: string
  items: string[]
}

export const CCTV_CONSENT_INTRO =
  '우디쌤의 영화입시학원은 개인정보 보호법 제 15조 및 22조에 따라 아래와 같이 홍보, 상담, 학습, 관리, 입시정보 서비스 및 이와 유사한 목적으로 귀하의 개인정보를 수집·이용하고자 하오니 다음의 내용을 충분히 검토하신 후 동의 여부를 결정해주시기 바랍니다.'

export const CCTV_CONSENT_HEADING = '[개인정보의 수집·이용 동의서]'

export const CCTV_CONSENT_SECTIONS: CctvConsentSection[] = [
  {
    title: '1. 개인정보의 수집 및 이용 목적',
    items: [
      '가. 등록생 관리를 위한 학원관리 프로그램에 자료 입력 및 활용',
      '나. 온·오프라인 성적 우수자 게시의 활용',
      '다. 학원정보제공(상담전화, 교육정보 안내 등)',
    ],
  },
  {
    title: '2. 영상정보 처리기기(CCTV, 네트워크 카메라 등) 이용 목적',
    items: [
      '가. 학원 시설물 보호 및 화재 예방 활동',
      '나. 등록생 안전사고 및 도난 사고 예방 활동',
    ],
  },
  {
    title: '3. 수집하는 개인정보의 항목',
    items: [
      '가. 기본 수집 정보 : 이름, 성별, 학교, 학년, 연락처',
      '나. 부가 수집 정보 : 보호자 연락처, 진로 관련 정보, 학교 생활기록부',
    ],
  },
  {
    title: '4. 개인정보의 공유 및 제공',
    items: ['가. 어떤 외부 타 기관에도 절대 개인정보의 공유 및 제공은 없습니다.'],
  },
  {
    title: '5. 개인정보의 보유 및 이용기간',
    items: [
      '가. 수집된 개인정보는 퇴원 후 등록생 관리 및 재등록 시 활용을 위해 퇴원 다음 해 12월 31일까지 보존합니다.',
    ],
  },
  {
    title: '6. 개인정보 수집 및 이용 거부',
    items: [
      '가. 귀하는 위와 같이 개인정보를 수집·이용하는 데 대한 동의를 거부할 권리가 있습니다.',
      '나. 개인정보 수집 거부 시 학원 운영 방침상 컨설팅 등록이 거부될 수 있습니다. 또한 학원에서 제공하는 각종 혜택(이벤트 행사 등)이 제공되지 않으니 참고하시기 바랍니다.',
    ],
  },
]

export const CCTV_CONSENT_AGREEMENT_LABEL = '위 개인정보 수집·이용에 동의합니다.'

export interface UserConsentRecord {
  id: string
  user_id: string
  consent_type: string
  version: string
  agreed: boolean
  agreed_at: string
  created_at: string
}

/**
 * 사용자의 가장 최근 CCTV 동의 기록을 가져옵니다.
 */
export async function getLatestCctvConsent(
  supabase: SupabaseClient,
  userId: string
): Promise<UserConsentRecord | null> {
  const { data, error } = await supabase
    .from('user_consents')
    .select('id, user_id, consent_type, version, agreed, agreed_at, created_at')
    .eq('user_id', userId)
    .eq('consent_type', CCTV_CONSENT_TYPE)
    .eq('agreed', true)
    .order('agreed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[consents] failed to load cctv consent', error)
    return null
  }

  return (data as UserConsentRecord | null) ?? null
}

/**
 * 최신 버전 CCTV 동의가 완료되었는지 확인합니다.
 */
export function hasCurrentCctvConsent(
  consent: UserConsentRecord | null | undefined
): boolean {
  if (!consent) return false
  if (!consent.agreed) return false
  return consent.version === CURRENT_CCTV_CONSENT_VERSION
}
