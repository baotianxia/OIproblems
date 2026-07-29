import type { SelectedNode } from './types'

export interface PreviewItem {
  id: string
  title: string
  type: 'folder' | 'sheet' | 'part' | 'problem'
  description?: string
  children?: PreviewItem[]
}

export interface WarningItem {
  line: number
  text: string
  message: string
}

export interface PreviewResult {
  tree: PreviewItem[]
  folderCount: number
  sheetCount: number
  partCount: number
  problemCount: number
  hasFolders: boolean
  hasSheets: boolean
  hasParts: boolean
  warnings: WarningItem[]
}

export function parseMarkdownToTree(
  content: string,
  context?: { sheetId?: number; partId?: number }
): PreviewResult {
  const lines = content.split('\n')
  const root: PreviewItem[] = []
  const warnings: WarningItem[] = []
  let folderCount = 0
  let sheetCount = 0
  let partCount = 0
  let problemCount = 0
  let currentFolder: PreviewItem | null = null
  let currentSheet: PreviewItem | null = null
  let currentPart: PreviewItem | null = null
  let inFolder = false
  let currentDescription = ''

  const hasH2 = lines.some(l => /^##[^#]/.test(l.trim()))

  const flushDescription = (): void => {
    if (!currentDescription) return
    const desc = currentDescription.trim()
    if (currentPart) currentPart.description = desc
    else if (currentSheet) currentSheet.description = desc
    else if (currentFolder) currentFolder.description = desc
    currentDescription = ''
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const line = rawLine.trimEnd()
    if (!line.trim()) continue

    const blockquoteMatch = line.match(/^>\s?(.*)/)
    if (blockquoteMatch) {
      currentDescription += (currentDescription ? '\n' : '') + blockquoteMatch[1]
      continue
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      flushDescription()
      const level = headingMatch[1].length
      const title = headingMatch[2].trim()
      inFolder = false
      if (level === 1) {
        const folder: PreviewItem = { id: `folder-${folderCount++}`, title, type: 'folder', children: [] }
        root.push(folder)
        currentFolder = folder
        if (hasH2) { currentSheet = null; currentPart = null }
        inFolder = true
      } else if (level === 2) {
        const sheet: PreviewItem = { id: `sheet-${sheetCount++}`, title, type: 'sheet', children: [] }
        if (currentFolder) currentFolder.children!.push(sheet)
        else root.push(sheet)
        currentSheet = sheet
        currentPart = null
      } else if (level === 3) {
        const part: PreviewItem = { id: `part-${partCount++}`, title, type: 'part', children: [] }
        if (currentSheet) currentSheet.children!.push(part)
        else if (currentFolder) currentFolder.children!.push(part)
        else root.push(part)
        currentPart = part
      }
      continue
    }

    const listMatch = line.match(/^\s*(?:[-*•·])\s*(?:\[([ xX])\]\s*)?(.+)/)
    if (listMatch) {
      const name = listMatch[2].trim()
      if (!name) continue
      if (!currentPart && !currentSheet) {
        if (inFolder) {
          warnings.push({ line: i + 1, text: name, message: '文件夹下不能直接添加题目，请先用 ## 创建题单' })
        } else if (context?.sheetId || context?.partId) {
          problemCount++
          root.push({ id: `problem-${problemCount}`, title: name, type: 'problem' })
          continue
        } else {
          warnings.push({ line: i + 1, text: name, message: '缺少题单上下文，题目将被跳过' })
        }
        continue
      }
      problemCount++
      const problem: PreviewItem = { id: `problem-${problemCount}`, title: name, type: 'problem' }
      if (currentPart) currentPart.children!.push(problem)
      else currentSheet!.children!.push(problem)
      continue
    }

    const trimmed = line.trim()
    if (!trimmed) continue

    if (!currentPart && !currentSheet) {
      if (context?.sheetId || context?.partId) {
        problemCount++
        root.push({ id: `problem-${problemCount}`, title: trimmed, type: 'problem' })
        continue
      }
      warnings.push({ line: i + 1, text: trimmed, message: '缺少题单上下文，题目将被跳过' })
      continue
    }

    problemCount++
    const problem: PreviewItem = { id: `problem-${problemCount}`, title: trimmed, type: 'problem' }
    if (currentPart) currentPart.children!.push(problem)
    else currentSheet!.children!.push(problem)
  }

  flushDescription()

  return { tree: root, folderCount, sheetCount, partCount, problemCount, hasFolders: folderCount > 0, hasSheets: sheetCount > 0, hasParts: partCount > 0, warnings }
}

export interface ImportParams {
  targetFolderId?: number
  sheetId?: number
  activePartId?: number
}

function getPlacementText(selectedNode: SelectedNode | null, params?: ImportParams, error?: string): string {
  if (error) return ''
  if (params?.activePartId) {
    if (selectedNode?.partName) {
      if (selectedNode.name) return `将在"${selectedNode.name}"的"${selectedNode.partName}"中创建`
      return `将在"${selectedNode.partName}"中创建`
    }
    return `将在"${selectedNode?.name ?? ''}"的 Part 中创建`
  }
  if (params?.sheetId) {
    if (selectedNode?.name) return `将在题单"${selectedNode.name}"中创建`
    return '将在题单中创建'
  }
  if (selectedNode?.type === 'folder') return `将在"${selectedNode.name}"下创建`
  return '将在根目录下创建'
}

export function computeImportParams(
  result: PreviewResult,
  selectedNode: SelectedNode | null
): { params?: ImportParams; placementText?: string; error?: string } {
  const getFolderBase = (): number | undefined => {
    if (!selectedNode) return undefined
    if (selectedNode.type === 'folder') return selectedNode.id
    if (selectedNode.type === 'sheet' || selectedNode.type === 'part') return selectedNode.folderId
    return undefined
  }

  const folderBase = getFolderBase()
  const isInSheet = selectedNode?.type === 'sheet' || selectedNode?.type === 'part'
  let params: ImportParams | undefined
  let error: string | undefined

  if (result.hasFolders || result.hasSheets) {
    if (isInSheet) {
      error = '导入包含文件夹/题单，不能在题单中选择'
    } else {
      params = { targetFolderId: folderBase }
    }
  } else if (result.hasParts) {
    if (selectedNode?.type === 'sheet' && !selectedNode.partId) {
      params = { sheetId: selectedNode.id }
    } else if (selectedNode?.partId) {
      error = 'Part 中不允许创建 Part'
    } else {
      error = '请先选题单'
    }
  } else if (result.problemCount > 0) {
    if (selectedNode?.partId) {
      params = { activePartId: selectedNode.partId, sheetId: selectedNode.id }
    } else if (selectedNode?.type === 'sheet') {
      params = { sheetId: selectedNode.id }
    } else {
      error = '请先选题单'
    }
  } else {
    error = '未检测到有效内容'
  }

  return { params, placementText: getPlacementText(selectedNode, params, error), error }
}
