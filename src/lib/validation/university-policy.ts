/**
 * 산식·컷의 형태 검증용 zod 스키마.
 *
 * 코드 프리셋 단일 출처로 전환된 후, 폼 입력 검증은 모두 제거되었습니다.
 * 여기 남은 스키마는 "프리셋 작성 시 형식이 맞는지" 개발자가 빠르게
 * 확인할 때(또는 향후 외부 데이터 가져올 때) 활용합니다.
 */

import { z } from 'zod'

import {
  CUTOFF_METRICS,
  CUT_SOURCE_TYPES,
  POINT_KINDS,
} from '@/lib/university-policy/types'
import { COURSE_TYPES, SUBJECT_AREAS } from '@/lib/university-report/types'

const subjectAreaEnum = z.enum(SUBJECT_AREAS as readonly [string, ...string[]])
const courseTypeEnum = z.enum(COURSE_TYPES as readonly [string, ...string[]])
const cutoffMetricEnum = z.enum(CUTOFF_METRICS as readonly [string, ...string[]])
const pointKindEnum = z.enum(POINT_KINDS as readonly [string, ...string[]])
const sourceTypeEnum = z.enum(CUT_SOURCE_TYPES as readonly [string, ...string[]])
const confidenceEnum = z.enum(['high', 'medium', 'low'])

const yearWeightSchema = z.union([
  z.object({ kind: z.literal('all_equal') }),
  z.object({
    kind: z.literal('per_grade'),
    y1: z.number().min(0).max(10),
    y2: z.number().min(0).max(10),
    y3: z.number().min(0).max(10),
  }),
])

const rankConversionSchema = z.object({
  1: z.number().min(0),
  2: z.number().min(0),
  3: z.number().min(0),
  4: z.number().min(0),
  5: z.number().min(0),
  6: z.number().min(0),
  7: z.number().min(0),
  8: z.number().min(0),
  9: z.number().min(0),
})

const achievementMapSchema = z.object({
  A: z.number(),
  B: z.number(),
  C: z.number(),
})

export const formulaSpecSchema = z
  .object({
    reflectedSubjects: z.array(subjectAreaEnum).min(1),
    reflectedCourseTypes: z.array(courseTypeEnum).min(1),
    yearWeight: yearWeightSchema,
    passFailRule: z.enum(['exclude', 'as_full', 'as_zero']),
    rankConversion: rankConversionSchema,
    achievementConversion: achievementMapSchema,
    achievementToRankFallback: achievementMapSchema,
    weights: z.object({
      common: z.number().min(0).max(1),
      career: z.number().min(0).max(1),
    }),
    totalScore: z.number().int().min(1).max(100000),
    outputs: z.array(cutoffMetricEnum).min(1),
    notes: z.string().nullable().optional(),
  })
  .superRefine((spec, ctx) => {
    const sum = spec.weights.common + spec.weights.career
    if (Math.abs(sum - 1) > 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['weights'],
        message: '공통/일반선택과 진로선택 가중치의 합은 1이어야 합니다.',
      })
    }
  })

export const cutPointInputSchema = z.object({
  metric: cutoffMetricEnum,
  label: z.string().trim().min(1).max(40),
  percentile: z.number().min(0).max(100).nullable().optional(),
  pointKind: pointKindEnum,
  value: z.number(),
  confidence: confidenceEnum,
  isEstimated: z.boolean().default(false),
})

export const cutBundleSchema = z.object({
  key: z.string().min(1),
  version: z.number().int().min(1),
  sourceYear: z.number().int().min(2000).max(2100),
  sourceType: sourceTypeEnum,
  sourceUrl: z.string().url().nullable().optional(),
  applicants: z.number().int().min(0).nullable().optional(),
  registered: z.number().int().min(0).nullable().optional(),
  competitionRate: z.number().min(0).nullable().optional(),
  lastAdmitNo: z.number().int().min(0).nullable().optional(),
  fillRate: z.number().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
  points: z.array(cutPointInputSchema),
})
