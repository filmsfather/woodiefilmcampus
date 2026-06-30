import { SolapiMessageService } from 'solapi'

interface SendLearningJournalLinkParams {
  parentPhone: string
  studentName?: string | null
  shareUrl: string
}

interface SendUniversityReportLinkParams {
  phoneNumber: string
  studentName?: string | null
  shareUrl: string
}

interface SendUniversityRecommendationParams {
  phoneNumber: string
  studentName?: string | null
  shareUrl: string
}

interface SendCounselingReservationParams {
  phoneNumber: string
  studentName: string
  counselingDate: string
  startTime: string
}

interface SendEnrollmentConfirmationParams {
  phoneNumber: string
  studentName: string
  desiredClassLabel: string
}


let solapiService: SolapiMessageService | null = null
let missingConfigLogged = false

function getSolapiService(): SolapiMessageService | null {
  if (typeof window !== 'undefined') {
    return null
  }

  if (solapiService) {
    return solapiService
  }

  const apiKey = process.env.SOLAPI_API_KEY
  const apiSecret = process.env.SOLAPI_API_SECRET

  if (!apiKey || !apiSecret) {
    if (!missingConfigLogged) {
      console.warn('[solapi] SOLAPI_API_KEY 또는 SOLAPI_API_SECRET이 설정되지 않았습니다. 문자 발송이 비활성화됩니다.')
      missingConfigLogged = true
    }
    return null
  }

  solapiService = new SolapiMessageService(apiKey, apiSecret)
  return solapiService
}

function normalizePhoneNumber(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const digits = value.replace(/\D/g, '')
  if (digits.length < 9) {
    return null
  }

  return digits
}

export async function sendLearningJournalShareLinkSMS({
  parentPhone,
  studentName,
  shareUrl,
}: SendLearningJournalLinkParams): Promise<boolean> {
  const service = getSolapiService()

  if (!service) {
    return false
  }

  const senderRaw = process.env.SOLAPI_SENDER_NUMBER
  const sender = normalizePhoneNumber(senderRaw)

  if (!sender) {
    if (!missingConfigLogged) {
      console.warn('[solapi] SOLAPI_SENDER_NUMBER가 올바르지 않아 문자 발송에 실패했습니다.')
      missingConfigLogged = true
    }
    return false
  }

  const to = normalizePhoneNumber(parentPhone)

  if (!to) {
    console.warn('[solapi] 학부모 연락처가 없거나 형식이 올바르지 않아 문자 발송을 건너뜁니다.', parentPhone)
    return false
  }

  const safeShareUrl = shareUrl.trim()

  if (!safeShareUrl) {
    console.warn('[solapi] 공유 링크가 비어 있어 문자 발송을 건너뜁니다.')
    return false
  }

  const displayName = studentName?.trim() || '자녀'
  const messageLines = [
    '[우디필름캠퍼스 학습일지 알림]',
    `${displayName} 학생의 학습일지가 공개되었습니다.`,
    `확인하기: ${safeShareUrl}`,
    '안전한 보관을 위해 링크를 외부에 공유하지 말아주세요.',
  ]

  try {
    await service.send({
      to,
      from: sender,
      text: messageLines.join('\n'),
    })
    return true
  } catch (error) {
    console.error('[solapi] 문자 발송 중 오류가 발생했습니다.', error)
    return false
  }
}

export async function sendUniversityReportShareLinkSMS({
  phoneNumber,
  studentName,
  shareUrl,
}: SendUniversityReportLinkParams): Promise<boolean> {
  const service = getSolapiService()

  if (!service) {
    return false
  }

  const sender = normalizePhoneNumber(process.env.SOLAPI_SENDER_NUMBER)

  if (!sender) {
    if (!missingConfigLogged) {
      console.warn('[solapi] SOLAPI_SENDER_NUMBER가 올바르지 않아 리포트 문자 발송에 실패했습니다.')
      missingConfigLogged = true
    }
    return false
  }

  const to = normalizePhoneNumber(phoneNumber)

  if (!to) {
    console.warn('[solapi] 연락처가 없거나 형식이 올바르지 않아 리포트 문자 발송을 건너뜁니다.', phoneNumber)
    return false
  }

  const safeShareUrl = shareUrl.trim()

  if (!safeShareUrl) {
    console.warn('[solapi] 공유 링크가 비어 있어 리포트 문자 발송을 건너뜁니다.')
    return false
  }

  const displayName = studentName?.trim() || '학생'
  const messageLines = [
    '[우디필름캠퍼스 지원가능대학 리포트]',
    `${displayName} 학생의 지원가능대학 컨설팅 리포트가 발행되었습니다.`,
    `확인하기: ${safeShareUrl}`,
    '링크에서 리포트를 확인하고 컨설팅 방향을 작성해 주세요.',
  ]

  try {
    await service.send({
      to,
      from: sender,
      text: messageLines.join('\n'),
    })
    return true
  } catch (error) {
    console.error('[solapi] 리포트 문자 발송 중 오류가 발생했습니다.', error)
    return false
  }
}

/**
 * 분석 결과가 (재)생성되어 학생이 희망 대학을 다시 선택해야 할 때 발송하는 안내 문자.
 * 희망대학 선택이 컨설팅 참고용임을 함께 안내한다.
 */
export async function sendUniversityWishReselectSMS({
  phoneNumber,
  studentName,
  shareUrl,
}: SendUniversityReportLinkParams): Promise<boolean> {
  const service = getSolapiService()

  if (!service) {
    return false
  }

  const sender = normalizePhoneNumber(process.env.SOLAPI_SENDER_NUMBER)

  if (!sender) {
    if (!missingConfigLogged) {
      console.warn('[solapi] SOLAPI_SENDER_NUMBER가 올바르지 않아 희망대학 재선택 문자 발송에 실패했습니다.')
      missingConfigLogged = true
    }
    return false
  }

  const to = normalizePhoneNumber(phoneNumber)

  if (!to) {
    console.warn('[solapi] 연락처가 없거나 형식이 올바르지 않아 희망대학 재선택 문자 발송을 건너뜁니다.', phoneNumber)
    return false
  }

  const safeShareUrl = shareUrl.trim()

  if (!safeShareUrl) {
    console.warn('[solapi] 공유 링크가 비어 있어 희망대학 재선택 문자 발송을 건너뜁니다.')
    return false
  }

  const displayName = studentName?.trim() || '학생'
  const messageLines = [
    '[우디필름캠퍼스 지원가능대학 리포트]',
    `${displayName} 학생의 지원가능대학 분석 결과가 업데이트되었습니다.`,
    `확인하기: ${safeShareUrl}`,
    '링크에서 희망 대학을 다시 선택해 주세요.',
    '※ 희망대학 선택은 컨설팅 참고용입니다.',
  ]

  try {
    await service.send({
      to,
      from: sender,
      text: messageLines.join('\n'),
    })
    return true
  } catch (error) {
    console.error('[solapi] 희망대학 재선택 문자 발송 중 오류가 발생했습니다.', error)
    return false
  }
}

/**
 * 분석·발행은 됐지만 아직 컨설팅 방향(희망대학 선택·의견)을 제출하지 않은 학생에게
 * 작성을 독려하는 안내 문자. 희망대학 선택이 컨설팅 참고용임을 함께 안내한다.
 */
export async function sendUniversityConsultOpinionRequestSMS({
  phoneNumber,
  studentName,
  shareUrl,
}: SendUniversityReportLinkParams): Promise<boolean> {
  const service = getSolapiService()

  if (!service) {
    return false
  }

  const sender = normalizePhoneNumber(process.env.SOLAPI_SENDER_NUMBER)

  if (!sender) {
    if (!missingConfigLogged) {
      console.warn('[solapi] SOLAPI_SENDER_NUMBER가 올바르지 않아 컨설팅 의견 요청 문자 발송에 실패했습니다.')
      missingConfigLogged = true
    }
    return false
  }

  const to = normalizePhoneNumber(phoneNumber)

  if (!to) {
    console.warn('[solapi] 연락처가 없거나 형식이 올바르지 않아 컨설팅 의견 요청 문자 발송을 건너뜁니다.', phoneNumber)
    return false
  }

  const safeShareUrl = shareUrl.trim()

  if (!safeShareUrl) {
    console.warn('[solapi] 공유 링크가 비어 있어 컨설팅 의견 요청 문자 발송을 건너뜁니다.')
    return false
  }

  const displayName = studentName?.trim() || '학생'
  const messageLines = [
    '[우디필름캠퍼스 지원가능대학 리포트]',
    `${displayName} 학생, 컨설팅 진행을 위해 희망 대학 선택과 의견 작성이 필요합니다.`,
    `작성하기: ${safeShareUrl}`,
    '링크에서 희망 대학을 선택하고 의견을 남겨 주셔야 컨설팅을 진행할 수 있습니다.',
    '※ 희망대학은 컨설팅 참고용이며, 최종 지원 대학 여부와는 무관합니다.',
  ]

  try {
    await service.send({
      to,
      from: sender,
      text: messageLines.join('\n'),
    })
    return true
  } catch (error) {
    console.error('[solapi] 컨설팅 의견 요청 문자 발송 중 오류가 발생했습니다.', error)
    return false
  }
}

export async function sendUniversityRecommendationSMS({
  phoneNumber,
  studentName,
  shareUrl,
}: SendUniversityRecommendationParams): Promise<boolean> {
  const service = getSolapiService()

  if (!service) {
    return false
  }

  const sender = normalizePhoneNumber(process.env.SOLAPI_SENDER_NUMBER)

  if (!sender) {
    if (!missingConfigLogged) {
      console.warn('[solapi] SOLAPI_SENDER_NUMBER가 올바르지 않아 추천 문자 발송에 실패했습니다.')
      missingConfigLogged = true
    }
    return false
  }

  const to = normalizePhoneNumber(phoneNumber)

  if (!to) {
    console.warn('[solapi] 연락처가 없거나 형식이 올바르지 않아 추천 문자 발송을 건너뜁니다.', phoneNumber)
    return false
  }

  const safeShareUrl = shareUrl.trim()

  if (!safeShareUrl) {
    console.warn('[solapi] 공유 링크가 비어 있어 추천 문자 발송을 건너뜁니다.')
    return false
  }

  const displayName = studentName?.trim() || '학생'
  const messageLines = [
    '[우디필름캠퍼스 지원가능대학 리포트]',
    `${displayName} 학생의 원장 추천 대학과 코멘트가 도착했습니다.`,
    `확인하기: ${safeShareUrl}`,
    '링크에서 추천 대학을 확인하고 동의 또는 의견을 남겨 주세요.',
  ]

  try {
    await service.send({
      to,
      from: sender,
      text: messageLines.join('\n'),
    })
    return true
  } catch (error) {
    console.error('[solapi] 추천 문자 발송 중 오류가 발생했습니다.', error)
    return false
  }
}

/**
 * 원장이 학생 의견·질문에 답변(추천 재전송 포함)했을 때 발송하는 알림 문자.
 * 추천 "도착" 문자와 구분되는 답변 안내 문구를 사용한다.
 */
export async function sendUniversityRecommendationReplySMS({
  phoneNumber,
  studentName,
  shareUrl,
}: SendUniversityRecommendationParams): Promise<boolean> {
  const service = getSolapiService()

  if (!service) {
    return false
  }

  const sender = normalizePhoneNumber(process.env.SOLAPI_SENDER_NUMBER)

  if (!sender) {
    if (!missingConfigLogged) {
      console.warn('[solapi] SOLAPI_SENDER_NUMBER가 올바르지 않아 답변 문자 발송에 실패했습니다.')
      missingConfigLogged = true
    }
    return false
  }

  const to = normalizePhoneNumber(phoneNumber)

  if (!to) {
    console.warn('[solapi] 연락처가 없거나 형식이 올바르지 않아 답변 문자 발송을 건너뜁니다.', phoneNumber)
    return false
  }

  const safeShareUrl = shareUrl.trim()

  if (!safeShareUrl) {
    console.warn('[solapi] 공유 링크가 비어 있어 답변 문자 발송을 건너뜁니다.')
    return false
  }

  const displayName = studentName?.trim() || '학생'
  const messageLines = [
    '[우디필름캠퍼스 지원가능대학 리포트]',
    `${displayName} 학생의 의견에 원장 선생님이 답변을 남겼습니다.`,
    `확인하기: ${safeShareUrl}`,
    '링크에서 원장 선생님의 답변과 추천 대학을 확인해 주세요.',
  ]

  try {
    await service.send({
      to,
      from: sender,
      text: messageLines.join('\n'),
    })
    return true
  } catch (error) {
    console.error('[solapi] 답변 문자 발송 중 오류가 발생했습니다.', error)
    return false
  }
}

function formatCounselingDateTime(date: string, time: string) {
  try {
    const base = new Date(`${date}T${time}+09:00`)
    const dateLabel = new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      timeZone: 'Asia/Seoul',
    }).format(base)

    const timeLabel = new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul',
    }).format(base)

    return `${dateLabel} ${timeLabel}`
  } catch (error) {
    console.warn('[solapi] 상담 예약 시간 포맷 중 오류가 발생했습니다.', error)
    return `${date} ${time.slice(0, 5)}`
  }
}

export async function sendCounselingReservationConfirmationSMS({
  phoneNumber,
  studentName,
  counselingDate,
  startTime,
}: SendCounselingReservationParams): Promise<boolean> {
  const service = getSolapiService()

  if (!service) {
    return false
  }

  const senderRaw = process.env.SOLAPI_SENDER_NUMBER
  const sender = normalizePhoneNumber(senderRaw)

  if (!sender) {
    if (!missingConfigLogged) {
      console.warn('[solapi] SOLAPI_SENDER_NUMBER가 올바르지 않아 상담 예약 문자 발송에 실패했습니다.')
      missingConfigLogged = true
    }
    return false
  }

  const to = normalizePhoneNumber(phoneNumber)

  if (!to) {
    console.warn('[solapi] 상담 예약 연락처가 없거나 형식이 올바르지 않아 문자 발송을 건너뜁니다.', phoneNumber)
    return false
  }

  const displayName = studentName.trim() || '예약자'
  const slotLabel = formatCounselingDateTime(counselingDate, startTime)

  const messageLines = [
    '[우디필름캠퍼스 상담 예약 안내]',
    `${displayName}님, 상담 예약이 확정되었습니다.`,
    `• 상담일시: ${slotLabel}`,
    '• 상담장소: 서울 강남구 삼성로91길 36 J타워 8층',
    '  (네이버지도: https://naver.me/xAFXwxQc)',
    '예약에 변경 사항이 있으면 학원으로 연락주세요.',
  ]

  try {
    await service.send({
      to,
      from: sender,
      text: messageLines.join('\n'),
    })
    return true
  } catch (error) {
    console.error('[solapi] 상담 예약 문자 발송 중 오류가 발생했습니다.', error)
    return false
  }
}

export async function sendEnrollmentApplicationConfirmationSMS({
  phoneNumber,
  studentName,
  desiredClassLabel,
}: SendEnrollmentConfirmationParams): Promise<boolean> {
  const service = getSolapiService()

  if (!service) {
    return false
  }

  const senderRaw = process.env.SOLAPI_SENDER_NUMBER
  const sender = normalizePhoneNumber(senderRaw)

  if (!sender) {
    if (!missingConfigLogged) {
      console.warn('[solapi] SOLAPI_SENDER_NUMBER가 올바르지 않아 등록원서 문자 발송에 실패했습니다.')
      missingConfigLogged = true
    }
    return false
  }

  const to = normalizePhoneNumber(phoneNumber)

  if (!to) {
    console.warn('[solapi] 등록원서 연락처가 없거나 형식이 올바르지 않아 문자 발송을 건너뜁니다.', phoneNumber)
    return false
  }

  const displayName = studentName.trim() || '학생'
  const classLabel = desiredClassLabel.trim() || '희망반'

  const messageLines = [
    '[우디필름캠퍼스 등록 안내]',
    `${displayName} 학생 ${classLabel} 등록원서 접수가 완료되었습니다.`,
    '실장님 확인 후 수업 안내 문자를 드리겠습니다.',
    '수업 자료와 사전 과제는 WoodieCampus에서 제공됩니다. 학생 계정이 없다면 지금 가입해주세요: https://woodiecampus.com',
  ]

  try {
    await service.send({
      to,
      from: sender,
      text: messageLines.join('\n'),
    })
    return true
  } catch (error) {
    console.error('[solapi] 등록원서 문자 발송 중 오류가 발생했습니다.', error)
    return false
  }
}
