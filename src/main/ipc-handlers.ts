import { ipcMain, dialog } from 'electron'
import { getDb } from './database'
import { readFileSync, writeFileSync, existsSync } from 'fs'

interface FolderRow { id: number; name: string; description: string; parent_id: number | null; sort_order: number }
interface SheetRow { id: number; name: string; description: string; folder_id: number; sort_order: number }
interface PartRow { id: number; title: string; sheet_id: number; sort_order: number }
interface ProblemRow { id: number; name: string; part_id: number | null; sheet_id: number | null; completed: number; sort_order: number }

interface TreeNode {
  id: number
  key: string
  title: string
  type: 'folder' | 'sheet' | 'part'
  isLeaf?: boolean
  children?: TreeNode[]
  parent_id?: number | null
  folder_id?: number
  sheet_id?: number
}

export function registerIpcHandlers(): void {
  const db = getDb()

  ipcMain.handle('folder:create', (_e, { name, parentId }: { name: string; parentId?: number }) => {
    const stmt = db.prepare('INSERT INTO folders (name, parent_id) VALUES (?, ?)')
    const result = stmt.run(name, parentId ?? null)
    return { id: Number(result.lastInsertRowid) }
  })

  ipcMain.handle('folder:rename', (_e, { id, name }: { id: number; name: string }) => {
    db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, id)
    return { success: true }
  })

  ipcMain.handle('folder:updateDescription', (_e, { id, description }: { id: number; description: string }) => {
    db.prepare('UPDATE folders SET description = ? WHERE id = ?').run(description, id)
    return { success: true }
  })

  ipcMain.handle('folder:delete', (_e, { id }: { id: number }) => {
    db.transaction(() => {
      const allIds = db.prepare(`
        WITH RECURSIVE cte AS (
          SELECT id FROM folders WHERE id = ?
          UNION ALL
          SELECT f.id FROM folders f JOIN cte ON f.parent_id = cte.id
        )
        SELECT id FROM cte ORDER BY id DESC
      `).all(id) as { id: number }[]

      for (const row of allIds) {
        const sids = (db.prepare('SELECT id FROM sheets WHERE folder_id = ?').all(row.id) as { id: number }[]).map(r => r.id)
        for (const sid of sids) {
          db.prepare('DELETE FROM problems WHERE part_id IN (SELECT id FROM parts WHERE sheet_id = ?)').run(sid)
          db.prepare('DELETE FROM problems WHERE sheet_id = ?').run(sid)
          db.prepare('DELETE FROM parts WHERE sheet_id = ?').run(sid)
          db.prepare('DELETE FROM sheets WHERE id = ?').run(sid)
        }
        db.prepare('DELETE FROM folders WHERE id = ?').run(row.id)
      }
    })()
    return { success: true }
  })

  ipcMain.handle('sheet:create', (_e, { name, folderId }: { name: string; folderId?: number }) => {
    const stmt = db.prepare('INSERT INTO sheets (name, folder_id) VALUES (?, ?)')
    const result = stmt.run(name, folderId ?? null)
    return { id: Number(result.lastInsertRowid) }
  })

  ipcMain.handle('sheet:rename', (_e, { id, name }: { id: number; name: string }) => {
    db.prepare('UPDATE sheets SET name = ? WHERE id = ?').run(name, id)
    return { success: true }
  })

  ipcMain.handle('sheet:updateDescription', (_e, { id, description }: { id: number; description: string }) => {
    db.prepare('UPDATE sheets SET description = ? WHERE id = ?').run(description, id)
    return { success: true }
  })

  ipcMain.handle('sheet:delete', (_e, { id }: { id: number }) => {
    db.transaction(() => {
      db.prepare('DELETE FROM problems WHERE part_id IN (SELECT id FROM parts WHERE sheet_id = ?)').run(id)
      db.prepare('DELETE FROM problems WHERE sheet_id = ?').run(id)
      db.prepare('DELETE FROM parts WHERE sheet_id = ?').run(id)
      db.prepare('DELETE FROM sheets WHERE id = ?').run(id)
    })()
    return { success: true }
  })

  ipcMain.handle('part:create', (_e, { title, sheetId }: { title: string; sheetId: number }) => {
    const stmt = db.prepare('INSERT INTO parts (title, sheet_id) VALUES (?, ?)')
    const result = stmt.run(title, sheetId)
    return { id: Number(result.lastInsertRowid) }
  })

  ipcMain.handle('part:rename', (_e, { id, title }: { id: number; title: string }) => {
    db.prepare('UPDATE parts SET title = ? WHERE id = ?').run(title, id)
    return { success: true }
  })

  ipcMain.handle('part:delete', (_e, { id }: { id: number }) => {
    db.prepare('DELETE FROM parts WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('problem:create', (_e, { name, partId, sheetId }: { name: string; partId?: number; sheetId?: number }) => {
    const stmt = db.prepare('INSERT INTO problems (name, part_id, sheet_id) VALUES (?, ?, ?)')
    const result = stmt.run(name, partId ?? null, sheetId ?? null)
    return { id: Number(result.lastInsertRowid) }
  })

  ipcMain.handle('problem:update', (_e, { id, name }: { id: number; name: string }) => {
    db.prepare('UPDATE problems SET name = ? WHERE id = ?').run(name, id)
    return { success: true }
  })

  ipcMain.handle('problem:delete', (_e, { id }: { id: number }) => {
    db.prepare('DELETE FROM problems WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('problem:toggle', (_e, { id }: { id: number }) => {
    const problem = db.prepare('SELECT completed FROM problems WHERE id = ?').get(id) as ProblemRow
    db.prepare('UPDATE problems SET completed = ? WHERE id = ?').run(problem.completed ? 0 : 1, id)
    return { success: true }
  })

  ipcMain.handle('problem:reorder', (_e, { items }: { items: { id: number; sortOrder: number }[] }) => {
    const stmt = db.prepare('UPDATE problems SET sort_order = ? WHERE id = ?')
    const transaction = db.transaction(() => {
      for (const item of items) {
        stmt.run(item.sortOrder, item.id)
      }
    })
    transaction()
    return { success: true }
  })

  ipcMain.handle('problem:bulkCreate', (_e, { names, partId, sheetId }: { names: string[]; partId?: number; sheetId?: number }) => {
    const stmt = db.prepare('INSERT INTO problems (name, part_id, sheet_id) VALUES (?, ?, ?)')
    const transaction = db.transaction(() => {
      for (const name of names) {
        stmt.run(name, partId ?? null, sheetId ?? null)
      }
    })
    transaction()
    return { success: true }
  })

  ipcMain.handle('tree:get', () => {
    const folders = db.prepare('SELECT id, name, description, parent_id FROM folders ORDER BY COALESCE(parent_id, 0), sort_order, id').all() as FolderRow[]
    const sheets = db.prepare('SELECT id, name, description, folder_id FROM sheets ORDER BY sort_order, id').all() as SheetRow[]
    const parts = db.prepare('SELECT * FROM parts ORDER BY sort_order, id').all() as PartRow[]
    const problems = db.prepare('SELECT id, name, part_id, sheet_id, completed FROM problems ORDER BY sort_order, id').all() as ProblemRow[]
    return { folders, sheets, parts, problems }
  })

  ipcMain.handle('sheet:getById', (_e, { id }: { id: number }) => {
    const sheet = db.prepare('SELECT * FROM sheets WHERE id = ?').get(id) as SheetRow | undefined
    if (!sheet) return null
    const partsList = db.prepare('SELECT * FROM parts WHERE sheet_id = ? ORDER BY sort_order, id').all(id) as PartRow[]
    const directProblems = db.prepare('SELECT * FROM problems WHERE sheet_id = ? AND part_id IS NULL ORDER BY sort_order, id').all(id) as ProblemRow[]
    let totalProblems = 0
    let completedProblems = 0
    for (const part of partsList) {
      const probs = db.prepare('SELECT * FROM problems WHERE part_id = ? ORDER BY sort_order, id').all(part.id) as ProblemRow[]
      ;(part as any).problems = probs
      const pTotal = probs.length
      const pCompleted = probs.filter(p => p.completed).length
      ;(part as any).totalProblems = pTotal
      ;(part as any).completedProblems = pCompleted
      totalProblems += pTotal
      completedProblems += pCompleted
    }
    totalProblems += directProblems.length
    completedProblems += directProblems.filter(p => p.completed).length
    return { sheet, parts: partsList, directProblems, totalProblems, completedProblems }
  })

  ipcMain.handle('stats:global', () => {
    const total = (db.prepare('SELECT COUNT(*) as c FROM problems').get() as any).c
    const completed = (db.prepare('SELECT COUNT(*) as c FROM problems WHERE completed = 1').get() as any).c
    return { totalProblems: total, completedProblems: completed }
  })

  ipcMain.handle('stats:folder', (_e, { id }: { id: number }) => {
    const folderIds = (db.prepare(`
      WITH RECURSIVE cte AS (
        SELECT id FROM folders WHERE id = ?
        UNION ALL
        SELECT f.id FROM folders f JOIN cte ON f.parent_id = cte.id
      )
      SELECT id FROM cte
    `).all(id) as { id: number }[]).map(r => r.id)

    let totalProblems = 0
    let completedProblems = 0

    for (const fid of folderIds) {
      const sheetIds = (db.prepare('SELECT id FROM sheets WHERE folder_id = ?').all(fid) as { id: number }[]).map(r => r.id)
      for (const sid of sheetIds) {
        const t = (db.prepare('SELECT COUNT(*) as c FROM problems WHERE sheet_id = ? OR part_id IN (SELECT id FROM parts WHERE sheet_id = ?)').get(sid, sid) as any).c
        const c = (db.prepare('SELECT COUNT(*) as c FROM problems WHERE completed = 1 AND (sheet_id = ? OR part_id IN (SELECT id FROM parts WHERE sheet_id = ?))').get(sid, sid) as any).c
        totalProblems += t
        completedProblems += c
      }
    }

    return { totalProblems, completedProblems }
  })

  ipcMain.handle('ui:get', (_e, key: string) => {
    const row = db.prepare('SELECT value FROM ui_state WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  })

  ipcMain.handle('ui:set', (_e, key: string, value: string) => {
    db.prepare('INSERT OR REPLACE INTO ui_state (key, value) VALUES (?, ?)').run(key, value)
    return { success: true }
  })

  ipcMain.handle('search:global', (_e, { query }: { query: string }) => {
    const pattern = `%${query}%`
    const folders = db.prepare("SELECT id, name, parent_id, 'folder' as type FROM folders WHERE name LIKE ?").all(pattern) as any[]
    const sheets = db.prepare("SELECT s.id, s.name, s.folder_id, 'sheet' as type FROM sheets s WHERE s.name LIKE ?").all(pattern) as any[]
    const parts = db.prepare("SELECT p.id, p.title as name, p.sheet_id, 'part' as type FROM parts p WHERE p.title LIKE ?").all(pattern) as any[]
    const problems = db.prepare("SELECT p.id, p.name, p.part_id, COALESCE(p.sheet_id, pt.sheet_id) as sheet_id, 'problem' as type FROM problems p LEFT JOIN parts pt ON p.part_id = pt.id WHERE p.name LIKE ?").all(pattern) as any[]
    return { folders, sheets, parts, problems }
  })

  ipcMain.handle('file:openMarkdown', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: '选择 Markdown 文件',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      properties: ['openFile']
    })
    if (canceled || filePaths.length === 0) return { content: null }
    const content = readFileSync(filePaths[0], 'utf-8')
    return { content, fileName: filePaths[0] }
  })

  ipcMain.handle('markdown:export', async () => {
    const folders = db.prepare('SELECT * FROM folders ORDER BY COALESCE(parent_id, 0), sort_order, id').all() as FolderRow[]
    const sheets = db.prepare('SELECT * FROM sheets ORDER BY sort_order, id').all() as SheetRow[]
    const partsList = db.prepare('SELECT * FROM parts ORDER BY sort_order, id').all() as PartRow[]
    const problems = db.prepare('SELECT * FROM problems ORDER BY sort_order, id').all() as ProblemRow[]

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: '导出 Markdown',
      defaultPath: 'todolist-export.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (canceled || !filePath) return { success: false }

    let md = ''
    const folderMap = new Map<number | null, FolderRow[]>()
    for (const f of folders) {
      const pk = f.parent_id ?? 0
      if (!folderMap.has(pk)) folderMap.set(pk, [])
      folderMap.get(pk)!.push(f)
    }

    function renderFolders(parentId: number | null, level: number): void {
      const children = folderMap.get(parentId) ?? []
      for (const folder of children) {
        const h = '#'.repeat(Math.max(1, level + 1))
        md += `${h} ${folder.name}\n\n`
        renderSheetsInFolder(folder.id, level + 1)
        renderFolders(folder.id, level + 1)
      }
    }

    function renderSheetsInFolder(folderId: number, baseLevel: number): void {
      const sheetList = sheets.filter(s => s.folder_id === folderId)
      for (const sheet of sheetList) {
        const h = '#'.repeat(baseLevel + 1)
        md += `${h} ${sheet.name}\n\n`
        const sp = partsList.filter(p => p.sheet_id === sheet.id)
        if (sp.length > 0) {
          for (const part of sp) {
            const ph = '#'.repeat(baseLevel + 2)
            md += `${ph} ${part.title}\n\n`
            const pp = problems.filter(p => p.part_id === part.id)
            for (const prob of pp) {
              md += `- [${prob.completed ? 'x' : ' '}] ${prob.name}\n`
            }
            md += '\n'
          }
        }
        const dp = problems.filter(p => p.sheet_id === sheet.id && !p.part_id)
        if (dp.length > 0) {
          for (const prob of dp) {
            md += `- [${prob.completed ? 'x' : ' '}] ${prob.name}\n`
          }
          md += '\n'
        }
      }
    }

    renderFolders(null, 0)
    writeFileSync(filePath, md, 'utf-8')
    return { success: true }
  })

  ipcMain.handle('markdown:import', async (_e, { content, targetFolderId, sheetId, activePartId }: { content: string; targetFolderId?: number; sheetId?: number; activePartId?: number }) => {
    const lines = content.split('\n')

    const hasH1 = lines.some(l => /^#[^#]/.test(l.trim()))
    const hasH2 = lines.some(l => /^##[^#]/.test(l.trim()))
    const hasH3 = lines.some(l => /^###[^#]/.test(l.trim()))

    let currentFolderId: number | null = targetFolderId ?? null
    let currentSheetId: number | null = sheetId ?? null
    let currentPartId: number | null = activePartId ?? null

    const transaction = db.transaction(() => {
      for (const rawLine of lines) {
        const line = rawLine.trimEnd()
        if (!line.trim()) continue

        const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
        if (headingMatch) {
          const level = headingMatch[1].length
          const title = headingMatch[2].trim()

          if (level === 1) {
            const isAbsolute = title.startsWith('/')
            const path = isAbsolute ? title.slice(1) : title
            const pathParts = path.split('/')
            let parentId: number | null = isAbsolute ? null : (targetFolderId ?? null)
            for (const part of pathParts) {
              const trimmed = part.trim()
              const existing = db.prepare('SELECT id FROM folders WHERE name = ? AND parent_id IS ?').get(trimmed, parentId) as FolderRow | undefined
              if (existing) {
                parentId = existing.id
              } else {
                const ins = db.prepare('INSERT INTO folders (name, parent_id) VALUES (?, ?)').run(trimmed, parentId)
                parentId = Number(ins.lastInsertRowid)
              }
            }
            currentFolderId = parentId
            if (hasH2) { currentSheetId = null; currentPartId = null }
          } else if (level === 2) {
            if (currentFolderId === null) {
              currentFolderId = targetFolderId ?? null
            }
            let existing: SheetRow | undefined
            if (currentFolderId === null) {
              existing = db.prepare('SELECT id FROM sheets WHERE name = ? AND folder_id IS NULL').get(title) as SheetRow | undefined
            } else {
              existing = db.prepare('SELECT id FROM sheets WHERE name = ? AND folder_id = ?').get(title, currentFolderId) as SheetRow | undefined
            }
            if (existing) {
              currentSheetId = existing.id
            } else {
              const ins = db.prepare('INSERT INTO sheets (name, folder_id) VALUES (?, ?)').run(title, currentFolderId)
              currentSheetId = Number(ins.lastInsertRowid)
            }
            if (hasH3) currentPartId = null
          } else if (level === 3) {
            if (currentSheetId === null) continue
            const existing = db.prepare('SELECT id FROM parts WHERE title = ? AND sheet_id = ?').get(title, currentSheetId) as PartRow | undefined
            if (existing) {
              currentPartId = existing.id
            } else {
              const ins = db.prepare('INSERT INTO parts (title, sheet_id) VALUES (?, ?)').run(title, currentSheetId)
              currentPartId = Number(ins.lastInsertRowid)
            }
          }
          continue
        }

        const listMatch = line.match(/^\s*(?:[-*•·])\s*(?:\[([ xX])\]\s*)?(.+)/)
        if (listMatch) {
          const completed = listMatch[1] ? (['x', 'X'].includes(listMatch[1]) ? 1 : 0) : 0
          const name = listMatch[2].trim()
          if (name) {
            if (currentPartId !== null) {
              db.prepare('INSERT INTO problems (name, part_id, completed) VALUES (?, ?, ?)').run(name, currentPartId, completed)
            } else if (currentSheetId !== null) {
              db.prepare('INSERT INTO problems (name, sheet_id, completed) VALUES (?, ?, ?)').run(name, currentSheetId, completed)
            }
          }
          continue
        }

        if (currentSheetId === null && currentPartId === null) continue
        const trimmed = line.trim()
        if (!trimmed) continue
        db.prepare('INSERT INTO problems (name, part_id, sheet_id, completed) VALUES (?, ?, ?, ?)').run(
          trimmed,
          currentPartId,
          currentPartId ? null : currentSheetId,
          0
        )
      }
    })
    transaction()
    return { success: true }
  })
}
