import { createElement } from 'react'
import type { ReactNode } from 'react'

export function submitOnEnter(e: { key: string }): void {
  if (e.key !== 'Enter') return
  const btn = document.querySelector('.ant-modal-confirm-btns .ant-btn-primary') as HTMLButtonElement | null
  btn?.click()
}

const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g

export function renderMarkdown(text: string, isDark?: boolean): ReactNode {
  const linkColor = isDark ? '#64B5F6' : '#1565C0'
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null = null
  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push(
      createElement('a', { key: match.index, href: match[2], target: '_blank', rel: 'noopener noreferrer', style: { color: linkColor } }, match[1])
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts.length > 0 ? parts : text
}
