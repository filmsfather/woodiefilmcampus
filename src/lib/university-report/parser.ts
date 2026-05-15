/**
 * 정부24/NEIS에서 발급된 성적증명서 PDF를 Gemini 멀티모달로 파싱합니다.
 * 추출 결과를 ParsedTranscript 형태로 정규화하여 반환하고,
 * 호출 측에서 DB 적재/대학별 산식 계산을 별도로 수행합니다.
 */

import {
  ACHIEVEMENTS,
  COURSE_TYPES,
  SUBJECT_AREAS,
  type Achievement,
  type CourseType,
  type ParsedCourse,
  type ParsedTranscript,
  type SubjectArea,
} from '@/lib/university-report/types'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// gemini-2.5-flash가 표 인식에서 충분한 정확도를 보이면서 응답 속도가
// pro 대비 약 5~10배 빠르므로 기본 모델로 사용. 실패 시 pro로 폴백.
const PRIMARY_MODEL = 'gemini-2.5-flash'
const FALLBACK_MODEL = 'gemini-2.5-pro'

const SYSTEM_INSTRUCTION = `당신은 한국 고등학교의 학교생활기록부(성적증명서) PDF를 분석하는 전문 파서입니다.
받은 PDF는 정부24/NEIS에서 발급된 성적증명서 또는 학교생활기록부의 교과학습발달상황 페이지입니다.
이미지 기반 PDF이므로 표 구조를 정확히 읽어 학기 단위 1행 1과목으로 추출해야 합니다.

추출 규칙:
1. 각 행은 (학년, 학기, 과목) 단위로 분리합니다. 표가 1학기·2학기 좌우 분할 형태면 양쪽을 별도 행으로 만들어야 합니다.
2. 데이터가 없는 학기(빈 셀 또는 "-")는 해당 학기 행을 생성하지 않습니다.
3. 학년은 1,2,3 중 하나. 학기는 1 또는 2.
4. 표준 교과(subjectArea) 분류 사전:
   - 국어: 국어, 문학, 독서, 화법과 작문, 언어와 매체, 심화 국어, 고전 읽기 등
   - 수학: 수학, 수학I, 수학II, 미적분, 확률과 통계, 기하, 수학연습, 미적분과 통계 기본 등
   - 영어: 영어, 영어I, 영어II, 영어 회화, 영어 독해와 작문, 심화 영어, 진로 영어 등
   - 한국사: 한국사
   - 사회: 사회, 사회·문화, 세계사, 한국지리, 세계지리, 생활과 윤리, 윤리와 사상, 정치와 법, 경제, 동아시아사, 사회문제 탐구 등
   - 과학: 통합과학, 물리학, 화학, 생명과학, 지구과학, 과학탐구실험 등
   - 체육: 체육, 운동과 건강, 운동과 건강생활, 스포츠 생활 등
   - 예술: 음악, 미술, 음악 감상과 비평, 미술 창작, 연극 등
   - 기술가정: 기술·가정, 정보 등
   - 제2외국어: 일본어, 중국어, 독일어, 프랑스어, 스페인어, 러시아어, 베트남어, 아랍어 등
   - 한문: 한문, 한문I, 한문II
   - 교양: 진로와 직업, 논술, 심리학, 환경, 보건 등
   - 전문교과: 전문교과(체육과/예술과/외국어과 등 명시된 경우)
   - 기타: 위 분류에 명확히 들어가지 않는 경우
5. 과목 구분(courseType):
   - 석차등급(1~9)과 원점수·평균·표준편차가 있으면 공통/일반선택 중 하나. 1학년 공통 과목(통합사회, 통합과학, 국어, 수학, 영어, 한국사 등)은 '공통', 그 외는 '일반선택'.
   - 성취도(A/B/C)만 있고 석차등급이 없으면 '진로선택'.
   - P/F만 있거나 "우수/보통/미흡"으로 표기되어 있으면 isPassFail=true. courseType은 체육·예술 과목이면 '체육·예술', 그 외 P/F는 '교양' 또는 '일반선택' 중 더 맞는 쪽.
6. 진로선택의 성취도는 그대로(A/B/C). 구체제 표기(우수/보통/미흡)는 그대로 보존하되 isPassFail=true.
7. 원점수/과목평균(표준편차) 셀은 "원점수/평균(표준편차)" 형식. 예: "83/57.70(18.7)" → rawScore=83, subjectMean=57.70, stdDev=18.7. 누락 시 null.
8. 석차등급 셀은 "등급(수강자수)" 형식. 예: "2(303)" → rank=2, studentCount=303. "우수(469)" 같은 경우 rank=null, achievement="우수", studentCount=469.
9. 한 행에서 데이터가 명확하지 않거나 OCR 신뢰도가 낮으면 parserConfidence='low'.
10. 메타 영역에서 학생 이름, 학교명, 발급번호(B로 시작하는 발급 번호), 문서확인번호(숫자-숫자 형식)를 추출합니다.
11. 출력은 정확히 지정된 JSON 스키마를 따라야 합니다. 모르는 필드는 null.

courseType 가능한 값: ${COURSE_TYPES.join(', ')}
subjectArea 가능한 값: ${SUBJECT_AREAS.join(', ')}
achievement 가능한 값: ${ACHIEVEMENTS.join(', ')} 또는 null
`

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    meta: {
      type: 'object',
      properties: {
        studentNameOnDoc: { type: 'string', nullable: true },
        schoolName: { type: 'string', nullable: true },
        docSerial: { type: 'string', nullable: true },
        docVerifyCode: { type: 'string', nullable: true },
      },
      required: ['studentNameOnDoc', 'schoolName', 'docSerial', 'docVerifyCode'],
    },
    courses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          grade: { type: 'integer' },
          semester: { type: 'integer' },
          rawSubjectName: { type: 'string' },
          subjectArea: { type: 'string', enum: SUBJECT_AREAS as unknown as string[] },
          courseType: { type: 'string', enum: COURSE_TYPES as unknown as string[] },
          isPassFail: { type: 'boolean' },
          credits: { type: 'number', nullable: true },
          rank: { type: 'integer', nullable: true },
          achievement: { type: 'string', enum: ACHIEVEMENTS as unknown as string[], nullable: true },
          rawScore: { type: 'number', nullable: true },
          subjectMean: { type: 'number', nullable: true },
          stdDev: { type: 'number', nullable: true },
          studentCount: { type: 'integer', nullable: true },
          parserConfidence: { type: 'string', enum: ['high', 'low'] },
        },
        required: [
          'grade',
          'semester',
          'rawSubjectName',
          'subjectArea',
          'courseType',
          'isPassFail',
          'parserConfidence',
        ],
      },
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['meta', 'courses', 'warnings'],
}

interface GeminiInlinePart {
  inline_data: {
    mime_type: string
    data: string
  }
}

interface GeminiTextPart {
  text: string
}

type GeminiPart = GeminiInlinePart | GeminiTextPart

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
}

async function callGemini(model: string, parts: GeminiPart[]): Promise<string | null> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        contents: [
          {
            parts,
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0,
        },
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[university-report-parser] Gemini API error', model, response.status, errorText)
    return null
  }

  const data: GeminiResponse = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text

  return text ?? null
}

function clampGrade(value: unknown): 1 | 2 | 3 | null {
  if (typeof value !== 'number') return null
  if (value === 1 || value === 2 || value === 3) return value
  return null
}

function clampSemester(value: unknown): 1 | 2 | null {
  if (typeof value !== 'number') return null
  if (value === 1 || value === 2) return value
  return null
}

function isSubjectArea(value: unknown): value is SubjectArea {
  return typeof value === 'string' && (SUBJECT_AREAS as readonly string[]).includes(value)
}

function isCourseType(value: unknown): value is CourseType {
  return typeof value === 'string' && (COURSE_TYPES as readonly string[]).includes(value)
}

function isAchievement(value: unknown): value is Achievement {
  return typeof value === 'string' && (ACHIEVEMENTS as readonly string[]).includes(value)
}

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalizeInt(value: unknown): number | null {
  const n = normalizeNumber(value)
  if (n === null) return null
  return Math.round(n)
}

function normalizeParsed(raw: unknown): ParsedTranscript {
  const obj = (raw ?? {}) as Record<string, unknown>
  const metaRaw = (obj.meta ?? {}) as Record<string, unknown>
  const coursesRaw = Array.isArray(obj.courses) ? (obj.courses as unknown[]) : []
  const warningsRaw = Array.isArray(obj.warnings) ? (obj.warnings as unknown[]) : []

  const courses: ParsedCourse[] = []
  for (const item of coursesRaw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>

    const grade = clampGrade(row.grade)
    const semester = clampSemester(row.semester)
    const rawSubjectName = typeof row.rawSubjectName === 'string' ? row.rawSubjectName.trim() : ''
    if (!grade || !semester || !rawSubjectName) continue

    const subjectArea = isSubjectArea(row.subjectArea) ? row.subjectArea : '기타'
    const courseType = isCourseType(row.courseType) ? row.courseType : '기타'
    const achievement = isAchievement(row.achievement) ? row.achievement : null

    const rank = normalizeInt(row.rank)
    const safeRank = rank !== null && rank >= 1 && rank <= 9 ? rank : null

    courses.push({
      grade,
      semester,
      rawSubjectName,
      subjectArea,
      courseType,
      isPassFail: Boolean(row.isPassFail),
      credits: normalizeNumber(row.credits),
      rank: safeRank,
      achievement,
      rawScore: normalizeNumber(row.rawScore),
      subjectMean: normalizeNumber(row.subjectMean),
      stdDev: normalizeNumber(row.stdDev),
      studentCount: normalizeInt(row.studentCount),
      parserConfidence: row.parserConfidence === 'low' ? 'low' : 'high',
    })
  }

  const warnings: string[] = warningsRaw
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0)

  return {
    meta: {
      studentNameOnDoc:
        typeof metaRaw.studentNameOnDoc === 'string' && metaRaw.studentNameOnDoc.trim().length > 0
          ? metaRaw.studentNameOnDoc.trim()
          : null,
      schoolName:
        typeof metaRaw.schoolName === 'string' && metaRaw.schoolName.trim().length > 0
          ? metaRaw.schoolName.trim()
          : null,
      docSerial:
        typeof metaRaw.docSerial === 'string' && metaRaw.docSerial.trim().length > 0
          ? metaRaw.docSerial.trim()
          : null,
      docVerifyCode:
        typeof metaRaw.docVerifyCode === 'string' && metaRaw.docVerifyCode.trim().length > 0
          ? metaRaw.docVerifyCode.trim()
          : null,
    },
    courses,
    warnings,
  }
}

export interface ParseTranscriptOk {
  ok: true
  model: string
  transcript: ParsedTranscript
}

export interface ParseTranscriptFail {
  ok: false
  error: string
}

export type ParseTranscriptResult = ParseTranscriptOk | ParseTranscriptFail

/**
 * PDF 바이트(또는 base64)를 받아 Gemini 멀티모달 호출 후 ParsedTranscript 반환.
 */
export async function parseTranscriptPdf(input: {
  pdfBase64: string
}): Promise<ParseTranscriptResult> {
  if (!GEMINI_API_KEY) {
    console.error('[university-report-parser] GEMINI_API_KEY is not set')
    return { ok: false, error: 'AI 설정이 완료되지 않았습니다. 관리자에게 문의하세요.' }
  }

  if (!input.pdfBase64) {
    return { ok: false, error: '업로드된 PDF가 비어 있습니다.' }
  }

  const parts: GeminiPart[] = [
    {
      inline_data: {
        mime_type: 'application/pdf',
        data: input.pdfBase64,
      },
    },
    {
      text: '이 PDF에서 모든 학기·과목 행을 추출하고, 명시된 JSON 스키마에 맞춰 반환하세요. 추측하지 말고, 명확히 보이는 값만 채우세요.',
    },
  ]

  const tryModels = [PRIMARY_MODEL, FALLBACK_MODEL]
  let lastError = '응답 없음'

  for (const model of tryModels) {
    let raw: string | null
    try {
      raw = await callGemini(model, parts)
    } catch (error) {
      console.error('[university-report-parser] network error', model, error)
      lastError = 'AI 서버 연결에 실패했습니다.'
      continue
    }

    if (!raw) {
      lastError = 'AI 응답이 비어 있습니다.'
      continue
    }

    try {
      const parsed = JSON.parse(raw) as unknown
      const transcript = normalizeParsed(parsed)
      if (transcript.courses.length === 0) {
        lastError = '과목 정보를 추출하지 못했습니다. PDF 화질이 낮거나 형식이 지원되지 않을 수 있습니다.'
        continue
      }
      return { ok: true, model, transcript }
    } catch (error) {
      console.error('[university-report-parser] JSON parse error', model, error, raw)
      lastError = 'AI 응답 형식이 올바르지 않습니다.'
      continue
    }
  }

  return { ok: false, error: lastError }
}
