import { createElement } from 'react'
import type { ReactNode } from 'react'

export function submitOnEnter(e: { key: string }): void {
  if (e.key !== 'Enter') return
  const btn = document.querySelector('.ant-modal-confirm-btns .ant-btn-primary') as HTMLButtonElement | null
  btn?.click()
}

const BLOCK_TAGS = /^(DIV|P|LI|TR|TD|TH|SECTION|ARTICLE|UL|OL|BLOCKQUOTE|PRE|H[1-6])$/

function htmlToMarkdown(node: Node): string {
  let out = ''
  if (node.nodeType === Node.TEXT_NODE) {
    out += node.textContent ?? ''
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element
    const tag = el.tagName
    if (tag === 'A') {
      const url = (el as HTMLAnchorElement).href
      const text = (el.textContent || '').trim() || url
      return url && url !== text ? `[${text}](${url})` : text
    }
    if (tag === 'BR') return '\n'
    const isBlock = BLOCK_TAGS.test(tag)
    if (isBlock && out && !out.endsWith('\n')) out += '\n'
    for (const child of Array.from(el.childNodes)) out += htmlToMarkdown(child)
    if (isBlock && out && !out.endsWith('\n')) out += '\n'
  }
  return out
}

export function handleLinkPaste(e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>): void {
  const html = e.clipboardData.getData('text/html')
  if (!html) return
  const doc = new DOMParser().parseFromString(html, 'text/html')
  if (!doc.querySelector('a')) return
  let text = htmlToMarkdown(doc.body)
  if (!text.trim()) return
  e.preventDefault()
  text = mergeSameUrlLinks(text)
  const isTextArea = e.target instanceof HTMLTextAreaElement
  if (isTextArea) {
    text = text.replace(/\n{3,}/g, '\n\n').trim()
  } else {
    text = text.replace(/\s+/g, ' ').trim()
  }
  if (!text) return
  document.execCommand('insertText', false, text)
}

const linkRegex = /\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\(([^)]+)\)/g

interface LinkToken {
  isLink: boolean
  inner?: string
  url?: string
  text?: string
}

function mergeSameUrlLinks(text: string): string {
  const tokens: LinkToken[] = []
  const re = /\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\(([^)]+)\)/g
  let last = 0
  let m: RegExpExecArray | null = null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ isLink: false, text: text.slice(last, m.index) })
    tokens.push({ isLink: true, inner: m[1], url: m[2] })
    last = m.index + m[0].length
  }
  if (last < text.length) tokens.push({ isLink: false, text: text.slice(last) })

  const out: string[] = []
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (!t.isLink || t.url == null) {
      out.push(t.text ?? '')
      i++
      continue
    }
    const url = t.url
    let inner = t.inner ?? ''
    let j = i + 1
    let merged = false
    for (;;) {
      let k = j
      let ok = true
      while (k < tokens.length && !tokens[k].isLink) {
        if ((tokens[k].text ?? '').includes('\n')) { ok = false; break }
        k++
      }
      if (!ok || k >= tokens.length) break
      if (tokens[k].url !== url) break
      for (let x = j; x < k; x++) inner += tokens[x].text
      inner += tokens[k].inner
      merged = true
      j = k + 1
    }
    if (merged) {
      out.push(`[${inner}](${url})`)
      i = j
    } else {
      out.push(`[${t.inner}](${url})`)
      i++
    }
  }
  return out.join('')
}

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
