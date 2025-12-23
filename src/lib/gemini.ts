
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

export interface GradingCriteria {
    high: string
    mid: string
    low: string
}

export interface EvaluationResult {
    grade: 'High' | 'Mid-High' | 'Mid' | 'Mid-Low' | 'Low'
    explanation: string
}

export interface GenerateExplanationResult {
    explanation: string
}

export interface GenerateGradingCriteriaResult {
    high: string
    mid: string
    low: string
}

/**
 * AI를 사용하여 문항에 대한 해설을 생성합니다.
 */
export async function generateExplanation(
    prompt: string,
    context?: string
): Promise<GenerateExplanationResult | { error: string }> {
    if (!GEMINI_API_KEY) {
        console.error('GEMINI_API_KEY is not set')
        return { error: 'AI 설정이 완료되지 않았습니다. 관리자에게 문의하세요.' }
    }

    const contextSection = context
        ? `\n**참고 자료/Context:**\n${context}\n`
        : ''

    const aiPrompt = `
You are an expert teacher creating educational explanations for students.
Please write a clear and helpful explanation for the following question.

**Question:**
${prompt}
${contextSection}
**Instructions:**
1. Write a comprehensive explanation that helps students understand the answer.
2. Include key concepts and reasoning.
3. Be clear, concise, and educational.
4. The explanation must be in Korean.
5. Do not include the answer directly - focus on explaining the concepts and reasoning process.

**Output Format:**
Return a JSON object with the following structure:
{
  "explanation": "Your explanation in Korean..."
}
Do not include any markdown formatting (like \`\`\`json). Just the raw JSON string.
`

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [{ text: aiPrompt }],
                        },
                    ],
                    generationConfig: {
                        responseMimeType: 'application/json',
                    },
                }),
            }
        )

        if (!response.ok) {
            const errorText = await response.text()
            console.error('[Gemini] API error', response.status, errorText)
            return { error: 'AI 해설 생성 중 오류가 발생했습니다.' }
        }

        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text

        if (!text) {
            console.error('[Gemini] No content in response', data)
            return { error: 'AI 응답을 분석할 수 없습니다.' }
        }

        try {
            const result = JSON.parse(text) as GenerateExplanationResult
            return result
        } catch (parseError) {
            console.error('[Gemini] JSON parse error', parseError, text)
            return { error: 'AI 응답 형식이 올바르지 않습니다.' }
        }
    } catch (error) {
        console.error('[Gemini] Network or unexpected error', error)
        return { error: 'AI 서버 연결에 실패했습니다.' }
    }
}

/**
 * AI를 사용하여 서술형 문항의 채점 기준을 생성합니다.
 */
export async function generateGradingCriteria(
    prompt: string
): Promise<GenerateGradingCriteriaResult | { error: string }> {
    if (!GEMINI_API_KEY) {
        console.error('GEMINI_API_KEY is not set')
        return { error: 'AI 설정이 완료되지 않았습니다. 관리자에게 문의하세요.' }
    }

    const aiPrompt = `
You are an expert teacher creating grading rubrics for essay questions.
Please create clear grading criteria for the following question.

**Question:**
${prompt}

**Instructions:**
1. Create three levels of grading criteria: High (상), Mid (중), Low (하).
2. Each criterion should be specific and measurable.
3. High should describe an excellent answer that fully addresses the question.
4. Mid should describe an acceptable answer that partially addresses the question.
5. Low should describe an insufficient answer that fails to address key points.
6. All criteria must be in Korean.
7. Keep each criterion concise (1-2 sentences).

**Output Format:**
Return a JSON object with the following structure:
{
  "high": "High level criterion in Korean...",
  "mid": "Mid level criterion in Korean...",
  "low": "Low level criterion in Korean..."
}
Do not include any markdown formatting (like \`\`\`json). Just the raw JSON string.
`

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [{ text: aiPrompt }],
                        },
                    ],
                    generationConfig: {
                        responseMimeType: 'application/json',
                    },
                }),
            }
        )

        if (!response.ok) {
            const errorText = await response.text()
            console.error('[Gemini] API error', response.status, errorText)
            return { error: 'AI 채점 기준 생성 중 오류가 발생했습니다.' }
        }

        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text

        if (!text) {
            console.error('[Gemini] No content in response', data)
            return { error: 'AI 응답을 분석할 수 없습니다.' }
        }

        try {
            const result = JSON.parse(text) as GenerateGradingCriteriaResult
            return result
        } catch (parseError) {
            console.error('[Gemini] JSON parse error', parseError, text)
            return { error: 'AI 응답 형식이 올바르지 않습니다.' }
        }
    } catch (error) {
        console.error('[Gemini] Network or unexpected error', error)
        return { error: 'AI 서버 연결에 실패했습니다.' }
    }
}

export async function evaluateWritingSubmission(
    question: string,
    explanation: string,
    answer: string,
    criteria: GradingCriteria
): Promise<EvaluationResult | { error: string }> {
    if (!GEMINI_API_KEY) {
        console.error('GEMINI_API_KEY is not set')
        return { error: 'AI 설정이 완료되지 않았습니다. 관리자에게 문의하세요.' }
    }

    const prompt = `
You are a strict and fair teacher grading a student's answer.
Please evaluate the following answer based on the provided criteria and reference explanation.

**Question:**
${question}

**Reference Explanation (Model Answer/Context):**
${explanation}

**Student Answer:**
${answer}

**Grading Criteria:**
- High (상): ${criteria.high}
- Mid (중): ${criteria.mid}
- Low (하): ${criteria.low}

**Instructions:**
1. Analyze the student's answer carefully, comparing it with the Reference Explanation and Grading Criteria.
2. Determine the grade from the following options: 'High', 'Mid-High', 'Mid', 'Mid-Low', 'Low'.
   - 'High': Meets all 'High' criteria perfectly.
   - 'Mid-High': Between High and Mid.
   - 'Mid': Meets 'Mid' criteria.
   - 'Mid-Low': Between Mid and Low.
   - 'Low': Meets 'Low' criteria or fails to address the question.
3. Provide a helpful explanation for the student, highlighting what they did well and what they can improve. The explanation must be in Korean (polite tone).

**Output Format:**
Return a JSON object with the following structure:
{
  "grade": "High" | "Mid-High" | "Mid" | "Mid-Low" | "Low",
  "explanation": "Your explanation in Korean..."
}
Do not include any markdown formatting (like \`\`\`json). Just the raw JSON string.
`

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [{ text: prompt }],
                        },
                    ],
                    generationConfig: {
                        responseMimeType: 'application/json',
                    },
                }),
            }
        )

        if (!response.ok) {
            const errorText = await response.text()
            console.error('[Gemini] API error', response.status, errorText)
            return { error: 'AI 평가 중 오류가 발생했습니다.' }
        }

        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text

        if (!text) {
            console.error('[Gemini] No content in response', data)
            return { error: 'AI 응답을 분석할 수 없습니다.' }
        }

        try {
            const result = JSON.parse(text) as EvaluationResult
            return result
        } catch (parseError) {
            console.error('[Gemini] JSON parse error', parseError, text)
            return { error: 'AI 응답 형식이 올바르지 않습니다.' }
        }
    } catch (error) {
        console.error('[Gemini] Network or unexpected error', error)
        return { error: 'AI 서버 연결에 실패했습니다.' }
    }
}
