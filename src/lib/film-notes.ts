type FilmNoteField = {
  key: 'title' | 'director' | 'releaseYear' | 'genre' | 'country'
  label: string
  placeholder: string
  inputMode?: 'numeric'
}

type FilmNoteTextArea = {
  key: 'summary' | 'favoriteScene'
  label: string
  placeholder: string
  rows: number
}

export const FILM_NOTE_FIELDS: FilmNoteField[] = [
  { key: 'title', label: '영화 제목', placeholder: '예: 기생충' },
  { key: 'director', label: '감독', placeholder: '예: 봉준호' },
  { key: 'releaseYear', label: '개봉 연도', placeholder: '예: 2019', inputMode: 'numeric' },
  { key: 'genre', label: '장르', placeholder: '예: 드라마' },
  { key: 'country', label: '국가', placeholder: '예: 한국' },
]

export const FILM_NOTE_TEXT_AREAS: FilmNoteTextArea[] = [
  {
    key: 'summary',
    label: '줄거리 요약 (3문장 이상)',
    placeholder: '핵심 줄거리를 최소 3문장으로 작성해주세요.',
    rows: 4,
  },
  {
    key: 'favoriteScene',
    label: '연출적으로 좋았던 장면',
    placeholder: '인상 깊었던 장면과 이유를 작성해주세요.',
    rows: 4,
  },
]

export type FilmNoteFieldKey = FilmNoteField['key'] | FilmNoteTextArea['key']

export type FilmNoteEntry = Record<FilmNoteFieldKey, string>

export function createEmptyFilmEntry(): FilmNoteEntry {
  return {
    title: '',
    director: '',
    releaseYear: '',
    genre: '',
    country: '',
    summary: '',
    favoriteScene: '',
  }
}

export function sanitizeFilmValue(value: string): string {
  return value.replace(/\r/g, '').replace(/\u00a0/g, ' ').trim()
}

export function sanitizeFilmEntry(entry: FilmNoteEntry): FilmNoteEntry {
  const normalized = createEmptyFilmEntry()

  for (const key of Object.keys(normalized) as FilmNoteFieldKey[]) {
    normalized[key] = sanitizeFilmValue(entry[key] ?? '')
  }

  return normalized
}

export function coerceFilmEntry(raw: unknown): FilmNoteEntry {
  const base = createEmptyFilmEntry()

  if (!raw || typeof raw !== 'object') {
    return base
  }

  for (const key of Object.keys(base) as FilmNoteFieldKey[]) {
    const value = (raw as Record<string, unknown>)[key]
    if (typeof value === 'string') {
      base[key] = value
    }
  }

  return base
}
