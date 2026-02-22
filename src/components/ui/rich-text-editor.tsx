'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bold, Italic, List, ListOrdered, Underline, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { sanitizeRichTextInput, stripHtml } from '@/lib/rich-text'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

type FormatCommand = 'bold' | 'italic' | 'underline' | 'unorderedList' | 'orderedList' | 'clear'

function execCommand(command: FormatCommand) {
  switch (command) {
    case 'bold':
      document.execCommand('bold')
      break
    case 'italic':
      document.execCommand('italic')
      break
    case 'underline':
      document.execCommand('underline')
      break
    case 'unorderedList':
      document.execCommand('insertUnorderedList')
      break
    case 'orderedList':
      document.execCommand('insertOrderedList')
      break
    case 'clear':
      document.execCommand('removeFormat')
      break
  }
}

export function RichTextEditor({ value, onChange, disabled, placeholder, className }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [isFocused, setIsFocused] = useState(false)

  const sanitizedValue = useMemo(() => sanitizeRichTextInput(value ?? ''), [value])

  const lastReportedRef = useRef<string | null>(null)

  useEffect(() => {
    const element = editorRef.current
    if (!element) {
      return
    }

    if (sanitizedValue === lastReportedRef.current) {
      return
    }

    if (element.innerHTML !== sanitizedValue) {
      element.innerHTML = sanitizedValue
    }
  }, [sanitizedValue])

  const handleInput = useCallback(() => {
    const element = editorRef.current
    if (!element) {
      return
    }

    const innerHtml = sanitizeRichTextInput(element.innerHTML)
    lastReportedRef.current = innerHtml
    onChange(innerHtml)
  }, [onChange])

  const handleCommand = (command: FormatCommand) => {
    const hasSelection = window.getSelection()?.rangeCount ?? 0
    if (disabled || hasSelection === 0) {
      if (command === 'clear' && editorRef.current) {
        editorRef.current.innerHTML = ''
        onChange('')
      }
      return
    }

    execCommand(command)
    handleInput()
  }

  const isEmpty = stripHtml(sanitizedValue).trim().length === 0

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => handleCommand('bold')}
          disabled={disabled}
        >
          <Bold className="h-4 w-4" />
          <span className="sr-only">굵게</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => handleCommand('italic')}
          disabled={disabled}
        >
          <Italic className="h-4 w-4" />
          <span className="sr-only">기울임꼴</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => handleCommand('underline')}
          disabled={disabled}
        >
          <Underline className="h-4 w-4" />
          <span className="sr-only">밑줄</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => handleCommand('unorderedList')}
          disabled={disabled}
        >
          <List className="h-4 w-4" />
          <span className="sr-only">글머리 기호</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => handleCommand('orderedList')}
          disabled={disabled}
        >
          <ListOrdered className="h-4 w-4" />
          <span className="sr-only">번호 매기기</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => handleCommand('clear')}
          disabled={disabled}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">서식 지우기</span>
        </Button>
      </div>

      <div className="relative">
        {placeholder && isEmpty && !isFocused && (
          <div className="pointer-events-none absolute left-3 top-3 text-sm text-slate-400">{placeholder}</div>
        )}
        <div
          ref={editorRef}
          className={cn(
            'min-h-[160px] w-full rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-900 shadow-sm focus-within:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
            disabled && 'cursor-not-allowed bg-slate-100 opacity-75'
          )}
          contentEditable={!disabled}
          onInput={handleInput}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          role="textbox"
          aria-multiline="true"
          spellCheck="true"
          data-placeholder={placeholder}
          suppressContentEditableWarning
        />
      </div>
    </div>
  )
}

export default RichTextEditor

