
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
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
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
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
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

export interface GeneratedQuestion {
    prompt: string
}

export interface GenerateQuestionsFromSrtResult {
    questions: GeneratedQuestion[]
}

/**
 * SRT 대본을 분석하여 학생 이해도 점검용 문항을 생성합니다.
 */
export async function generateQuestionsFromSrt(
    srtText: string,
    questionCount: number = 10
): Promise<GenerateQuestionsFromSrtResult | { error: string }> {
    if (!GEMINI_API_KEY) {
        console.error('GEMINI_API_KEY is not set')
        return { error: 'AI 설정이 완료되지 않았습니다. 관리자에게 문의하세요.' }
    }

    const aiPrompt = `
You are an expert film education instructor creating essay questions for your students.
Analyze the following lecture transcript and generate ${questionCount} thoughtful questions that assess students' understanding of the KEY CONCEPTS.

**Lecture Transcript:**
${srtText}

**Instructions:**
1. Generate exactly ${questionCount} questions based on the transcript content.
2. Write questions as if YOU are the instructor directly asking students.
3. DO NOT use phrases like "강사는...", "영상에서...", "위 내용에 따르면...", "강의에서 언급된..."
4. Instead, ask directly using formats like:
   - "~는 무엇인가?"
   - "~를 설명하시오."
   - "~에 대해 서술하시오."
   - "~를 분석하시오."
   - "~의 차이점을 비교하시오."
5. Focus on the KEY CONCEPTS and IMPORTANT POINTS from the lecture.
6. Questions should:
   - Test understanding of core concepts
   - Ask students to apply what they learned
   - Encourage critical thinking about the material
7. All questions must be in Korean.
8. Questions should be suitable for essay-style (서술형) answers.

**Bad Example (DO NOT generate questions like this):**
- "강사는 이야기의 구성 요소로 무엇을 제시했는가?"
- "영상에서 설명한 아이러니의 정의는 무엇인가?"
- "강의 내용에 따르면 스토리텔링의 핵심은 무엇인가?"

**Good Example (Generate questions like this):**
- "이야기를 구성하는 핵심 요소 4가지를 설명하고, 각각의 역할을 서술하시오."
- "아이러니가 스토리텔링에서 중요한 이유를 구체적인 예시와 함께 설명하시오."
- "'광해' 영화에서 인물, 사건, 배경이 어떻게 유기적으로 연결되는지 분석하시오."
- "좋은 캐릭터가 갖춰야 할 조건을 3가지 이상 제시하고, 각각을 설명하시오."

**Output Format:**
Return a JSON object with the following structure:
{
  "questions": [
    { "prompt": "Question 1 in Korean..." },
    { "prompt": "Question 2 in Korean..." },
    ...
  ]
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
            return { error: 'AI 문항 생성 중 오류가 발생했습니다.' }
        }

        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text

        if (!text) {
            console.error('[Gemini] No content in response', data)
            return { error: 'AI 응답을 분석할 수 없습니다.' }
        }

        try {
            const result = JSON.parse(text) as GenerateQuestionsFromSrtResult
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

export interface GeneratePrincipalGreetingResult {
    greeting: string
}

/**
 * AI를 사용하여 원장 인사말을 생성합니다.
 */
export async function generatePrincipalGreeting(
    monthToken: string,
    context?: string
): Promise<GeneratePrincipalGreetingResult | { error: string }> {
    if (!GEMINI_API_KEY) {
        console.error('GEMINI_API_KEY is not set')
        return { error: 'AI 설정이 완료되지 않았습니다. 관리자에게 문의하세요.' }
    }

    // monthToken format: "2024-01" -> "2024년 1월"
    const [year, month] = monthToken.split('-')
    const monthLabel = `${year}년 ${parseInt(month, 10)}월`

    const contextSection = context?.trim()
        ? `\n**원장이 전달하고 싶은 내용/키워드:**\n${context}\n`
        : ''

    const aiPrompt = `
You are a warm and professional principal of a film education academy writing a monthly greeting to parents.
Please write a heartfelt and encouraging message for ${monthLabel}.

${contextSection}
**Instructions:**
1. Write a warm, professional monthly greeting from a principal to parents.
2. The tone should be encouraging, supportive, and positive.
3. Mention the season/month naturally (${monthLabel}).
4. If context is provided, incorporate those themes/keywords naturally.
5. Include appreciation for parents' support and trust.
6. Encourage students' learning journey in film education.
7. The message should be 3-5 paragraphs, not too long.
8. The greeting must be entirely in Korean with polite formal style (합니다체).
9. Do NOT include a signature line - just the greeting content.

**Output Format:**
Return a JSON object with the following structure:
{
  "greeting": "Your greeting message in Korean..."
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
            return { error: 'AI 인사말 생성 중 오류가 발생했습니다.' }
        }

        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text

        if (!text) {
            console.error('[Gemini] No content in response', data)
            return { error: 'AI 응답을 분석할 수 없습니다.' }
        }

        try {
            const result = JSON.parse(text) as GeneratePrincipalGreetingResult
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
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
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

export interface GenerateLearningJournalCommentResult {
    comment: string
}

/**
 * 선생님이 제공한 키워드/메모를 기반으로 학습일지 코멘트를 생성합니다.
 */
export async function generateLearningJournalComment(params: {
    studentName: string
    subject: string
    teacherContext: string
    previousComment?: string
}): Promise<GenerateLearningJournalCommentResult | { error: string }> {
    if (!GEMINI_API_KEY) {
        console.error('GEMINI_API_KEY is not set')
        return { error: 'AI 설정이 완료되지 않았습니다. 관리자에게 문의하세요.' }
    }

    const previousSection = params.previousComment?.trim()
        ? `\n**지난 기간 코멘트 (참고용 — 성장 변화를 반영하세요):**\n${params.previousComment}\n`
        : ''

    const aiPrompt = `
You are a warm yet honest teacher at a film education academy writing a learning journal comment for a student.
Write a comment for the following student based on the teacher's notes.

**학생 이름:** ${params.studentName}
**과목/역할:** ${params.subject}

**선생님이 제공한 키워드/메모:**
${params.teacherContext}
${previousSection}
**작성 규칙:**
1. 반드시 개선이 필요한 점(단점)을 먼저, 잘하고 있는 점(강점)을 나중에 서술하세요.
2. 단점을 언급할 때는 학생이 외면하지 않고 극복할 수 있도록 구체적인 방향을 제시하며 격려하세요.
3. 강점을 언급할 때는 학생이 자신의 장점을 인지하고 더 발전시킬 수 있도록 구체적으로 칭찬하세요.
4. 학생 이름(${params.studentName})을 자연스럽게 포함하세요 (예: "${params.studentName} 학생은...").
5. 선생님과 학생 사이의 라포(신뢰 관계)를 쌓을 수 있는 따뜻하면서도 진솔한 톤을 유지하세요.
6. 지난 코멘트가 있다면 이전 피드백 대비 변화나 성장을 자연스럽게 반영하세요.
7. 합니다체를 사용하세요.
8. 3~5문장으로 작성하세요. 너무 길지 않게 핵심만 담으세요.
9. 선생님이 제공한 키워드/메모의 내용만 활용하고, 없는 사실을 지어내지 마세요.

**Output Format:**
Return a JSON object with the following structure:
{
  "comment": "생성된 코멘트..."
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
            return { error: 'AI 코멘트 생성 중 오류가 발생했습니다.' }
        }

        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text

        if (!text) {
            console.error('[Gemini] No content in response', data)
            return { error: 'AI 응답을 분석할 수 없습니다.' }
        }

        try {
            const result = JSON.parse(text) as GenerateLearningJournalCommentResult
            return result
        } catch (parseError) {
            console.error('[Gemini] JSON parse error', parseError, text)
            return { error: 'AI 응답 형식이 올바르지 않습니다.' }
        }
    } catch (error) {
        console.error('[Gemini] Network or unexpected error', error)
        return { error: 'AI 코멘트 서버 연결에 실패했습니다.' }
    }
}
