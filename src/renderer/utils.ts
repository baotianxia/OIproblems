import { createElement } from 'react'
import type { ReactNode } from 'react'

export function submitOnEnter(e: { key: string }): void {
  if (e.key !== 'Enter') return
  const btn = document.querySelector('.ant-modal-confirm-btns .ant-btn-primary') as HTMLButtonElement | null
  btn?.click()
}

export function handleLinkPaste(e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>): void {
  const html = e.clipboardData.getData('text/html')
  if (!html) return
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const links = doc.querySelectorAll('a')
  if (links.length === 0) return
  const link = links[0]
  const url = link.href
  const text = link.textContent || url
  if (!url || url === text) return
  e.preventDefault()
  document.execCommand('insertText', false, `[${text}](${url})`)
}

const linkRegex = /\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\(([^)]+)\)/g

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
