/**
 * 대학 마스터 프리셋. 코드 변경이 단일 출처.
 * id는 stable slug (영문/소문자/하이픈만).
 *
 * 영화·연출 관련 한국 대학 위주로 1차 등록. 필요 시 자유롭게 추가/수정하세요.
 */

export interface UniversityPreset {
  id: string
  name: string
  shortName?: string
  region?: string
  notes?: string
}

export const UNIVERSITY_PRESETS: readonly UniversityPreset[] = [
  // 서울 종합대학
  { id: 'kafa', name: '한국영화아카데미', shortName: 'KAFA', region: '서울' },
  { id: 'karts', name: '한국예술종합학교', shortName: '한예종', region: '서울' },
  { id: 'chungang', name: '중앙대학교', shortName: '중앙대', region: '서울' },
  { id: 'sungkyunkwan', name: '성균관대학교', shortName: '성대', region: '서울' },
  { id: 'kyunghee', name: '경희대학교', shortName: '경희대', region: '서울' },
  { id: 'dongguk', name: '동국대학교', shortName: '동국대', region: '서울' },
  { id: 'kookmin', name: '국민대학교', shortName: '국민대', region: '서울' },
  { id: 'soongsil', name: '숭실대학교', shortName: '숭실대', region: '서울' },
  { id: 'sejong', name: '세종대학교', shortName: '세종대', region: '서울' },
  { id: 'sangmyung', name: '상명대학교', shortName: '상명대', region: '서울' },
  { id: 'seokyeong', name: '서경대학교', shortName: '서경대', region: '서울' },
  { id: 'myongji', name: '명지대학교', shortName: '명지대', region: '서울' },

  // 경기·인천
  { id: 'dankook', name: '단국대학교', shortName: '단국대', region: '경기' },
  { id: 'gyeonggi', name: '경기대학교', shortName: '경기대', region: '경기' },
  { id: 'sungkyul', name: '성결대학교', shortName: '성결대', region: '경기' },
  { id: 'suwon', name: '수원대학교', shortName: '수원대', region: '경기' },
  { id: 'daejin', name: '대진대학교', shortName: '대진대', region: '경기' },
  { id: 'pyeongtaek', name: '평택대학교', shortName: '평택대', region: '경기' },
  { id: 'yongin', name: '용인대학교', shortName: '용인대', region: '경기' },
  { id: 'joongbu', name: '중부대학교', shortName: '중부대', region: '경기', notes: '고양창의캠퍼스' },
  { id: 'inha', name: '인하대학교', shortName: '인하대', region: '인천' },

  // 충청
  { id: 'cheongju', name: '청주대학교', shortName: '청주대', region: '충북' },
  { id: 'hoseo', name: '호서대학교', shortName: '호서대', region: '충남' },
  { id: 'soonchunhyang', name: '순천향대학교', shortName: '순천향대', region: '충남' },
  { id: 'mokwon', name: '목원대학교', shortName: '목원대', region: '대전' },

  // 부산
  { id: 'dongseo', name: '동서대학교', shortName: '동서대', region: '부산' },
  { id: 'kyungsung', name: '경성대학교', shortName: '경성대', region: '부산' },

  // 예술·전문대학
  { id: 'baekje', name: '백제예술대학교', shortName: '백제예대', region: '전북' },
  { id: 'dima', name: '동아방송예술대학교', shortName: '동아방송예대', region: '경기' },
  { id: 'seoularts', name: '서울예술대학교', shortName: '서울예대', region: '경기' },
  { id: 'seoil', name: '서일대학교', shortName: '서일대', region: '서울' },
  { id: 'baekseok-arts', name: '백석예술대학교', shortName: '백석예대', region: '서울' },
] as const

export function getUniversityPreset(id: string): UniversityPreset | null {
  return UNIVERSITY_PRESETS.find((u) => u.id === id) ?? null
}
