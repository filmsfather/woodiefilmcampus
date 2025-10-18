import { SolapiMessageService } from 'solapi'

interface SendLearningJournalLinkParams {
  parentPhone: string
  studentName?: string | null
  shareUrl: string
}

interface SendCounselingReservationParams {
  phoneNumber: string
  studentName: string
  counselingDate: string
  startTime: string
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
