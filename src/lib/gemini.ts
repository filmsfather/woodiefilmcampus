
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
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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
