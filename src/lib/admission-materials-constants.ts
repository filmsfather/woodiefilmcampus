export const PAST_EXAM_YEARS = Array.from({ length: 2025 - 2010 + 1 }, (_, index) => 2025 - index)

export const PAST_EXAM_UNIVERSITIES = [
  '국민대',
  '단국대',
  '동아방송예대',
  '대진대',
  '백석예대',
  '상명대',
  '서경대',
  '서울예술대',
  '성결대',
  '세종대',
  '수원대',
  '순천향대',
  '숭실대',
  '용인대',
  '중앙대',
  '청주대',
  '한예종',
  '인하대',
  '명지대',
] as const

export const PAST_EXAM_ADMISSION_TYPES = ['수시', '정시'] as const
