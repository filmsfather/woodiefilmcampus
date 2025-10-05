const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  'ul',
  'ol',
  'li',
  'blockquote',
]

const EVENT_HANDLER_PATTERN = /\son[a-z]+=("[^"]*"|'[^']*')/gi
const SCRIPT_TAG_PATTERN = /<script[\s\S]*?>[\s\S]*?<\/script>/gi

function replaceDeprecatedTags(value: string): string {
  return value
    .replace(/<\/?b>/gi, (match) => (match.startsWith('</') ? '</strong>' : '<strong>'))
    .replace(/<\/?i>/gi, (match) => (match.startsWith('</') ? '</em>' : '<em>'))
}

function stripDisallowedTags(value: string): string {
  return value.replace(/<(\/)?([a-z0-9-]+)([^>]*)>/gi, (match, closing, tagName) => {
    if (ALLOWED_TAGS.includes(tagName.toLowerCase())) {
      return `<${closing ? '/' : ''}${tagName.toLowerCase()}>`
    }

    return ''
  })
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

function encodeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function sanitizeRichTextInput(value: string): string {
  if (typeof value !== 'string') {
    return ''
  }

  const withoutScripts = value.replace(SCRIPT_TAG_PATTERN, '')
  const withoutEvents = withoutScripts.replace(EVENT_HANDLER_PATTERN, '')
  const normalizedTags = replaceDeprecatedTags(withoutEvents)
  return stripDisallowedTags(normalizedTags)
}

export function ensureRichTextValue(value: string): string {
  if (!value) {
    return ''
  }

  const containsTags = /<[^>]+>/.test(value)

  if (containsTags) {
    return sanitizeRichTextInput(value)
  }

  const escaped = encodeHtml(value).replace(/\r?\n/g, '<br>')
  return sanitizeRichTextInput(escaped)
}

export function stripHtml(value: string): string {
  if (!value) {
    return ''
  }

  return decodeBasicEntities(
    value
      .replace(/<(p|div)[^>]*>/gi, '')
      .replace(/<\/(p|div)>/gi, '\n')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
}

export function isRichTextEmpty(value: string): boolean {
  return stripHtml(value).trim().length === 0
}

