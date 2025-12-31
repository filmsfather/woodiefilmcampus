/**
 * SRT 파일 파싱 유틸리티
 * SRT 파일에서 자막 텍스트만 추출합니다.
 */

export interface SrtEntry {
  index: number
  startTime: string
  endTime: string
  text: string
}

/**
 * SRT 문자열을 파싱하여 자막 항목 배열로 변환합니다.
 */
export function parseSrt(srtContent: string): SrtEntry[] {
  const entries: SrtEntry[] = []
  
  // 윈도우/유닉스 줄바꿈 정규화
  const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  
  // 빈 줄로 블록 분리
  const blocks = normalized.split(/\n\n+/).filter((block) => block.trim().length > 0)
  
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim())
    
    if (lines.length < 3) {
      continue
    }
    
    // 첫 번째 줄: 인덱스 (숫자)
    const indexLine = lines[0]
    const index = parseInt(indexLine, 10)
    
    if (isNaN(index)) {
      continue
    }
    
    // 두 번째 줄: 타임코드 (00:00:00,000 --> 00:00:00,000)
    const timeLine = lines[1]
    const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/)
    
    if (!timeMatch) {
      continue
    }
    
    const startTime = timeMatch[1]
    const endTime = timeMatch[2]
    
    // 나머지 줄: 자막 텍스트
    const textLines = lines.slice(2)
    const text = textLines.join(' ').trim()
    
    if (text.length > 0) {
      entries.push({
        index,
        startTime,
        endTime,
        text,
      })
    }
  }
  
  return entries
}

/**
 * SRT 항목 배열에서 텍스트만 추출하여 하나의 문자열로 합칩니다.
 */
export function extractTextFromSrt(srtContent: string): string {
  const entries = parseSrt(srtContent)
  return entries.map((entry) => entry.text).join(' ')
}

/**
 * SRT 항목 배열에서 텍스트를 줄바꿈으로 구분하여 추출합니다.
 */
export function extractTextLinesFromSrt(srtContent: string): string {
  const entries = parseSrt(srtContent)
  return entries.map((entry) => entry.text).join('\n')
}






