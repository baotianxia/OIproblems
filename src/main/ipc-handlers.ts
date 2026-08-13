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

  db.prepare('DELETE FROM operation_log WHERE id NOT IN (SELECT id FROM operation_log ORDER BY id DESC LIMIT 100)').run()
  db.prepare(`
    DELETE FROM ui_state
    WHERE key LIKE 'scrollPos_sheet_%'
      AND CAST(REPLACE(key, 'scrollPos_sheet_', '') AS INTEGER) NOT IN (SELECT id FROM sheets)
  `).run()
  db.prepare(`
    DELETE FROM ui_state
    WHERE key LIKE 'scrollPos_folder_%'
      AND CAST(REPLACE(key, 'scrollPos_folder_', '') AS INTEGER) NOT IN (SELECT id FROM folders)
  `).run()

  const logOperation = (description: string, snapshot: any[]): void => {
    db.prepare('INSERT INTO operation_log (description, snapshot) VALUES (?, ?)').run(description, JSON.stringify(snapshot))
  }

  const snapshotFolderTree = (folderId: number, snapshot: any[]): void => {
    const allIds = db.prepare(`
      WITH RECURSIVE cte AS (
        SELECT id FROM folders WHERE id = ?
        UNION ALL
        SELECT f.id FROM folders f JOIN cte ON f.parent_id = cte.id
      )
      SELECT id FROM cte ORDER BY id DESC
    `).all(folderId) as { id: number }[]

    for (const row of allIds) {
      const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(row.id) as FolderRow | undefined
      if (folder) snapshot.push({ table: 'folders', data: folder })
      const sids = db.prepare('SELECT id FROM sheets WHERE folder_id = ?').all(row.id) as { id: number }[]
      for (const s of sids) {
        snapshotSheetTree(s.id, snapshot)
      }
    }
  }

  const snapshotSheetTree = (sheetId: number, snapshot: any[]): void => {
    const sheet = db.prepare('SELECT * FROM sheets WHERE id = ?').get(sheetId) as SheetRow | undefined
    if (!sheet) return
    snapshot.push({ table: 'sheets', data: sheet })
    const pids = db.prepare('SELECT * FROM parts WHERE sheet_id = ?').all(sheetId) as PartRow[]
    for (const p of pids) {
      snapshot.push({ table: 'parts', data: p })
      const probs = db.prepare('SELECT * FROM problems WHERE part_id = ?').all(p.id) as ProblemRow[]
      for (const pr of probs) snapshot.push({ table: 'problems', data: pr })
    }
    const dps = db.prepare('SELECT * FROM problems WHERE sheet_id = ? AND part_id IS NULL').all(sheetId) as ProblemRow[]
    for (const pr of dps) snapshot.push({ table: 'problems', data: pr })
  }

  const snapshotPartTree = (partId: number, snapshot: any[]): void => {
    const part = db.prepare('SELECT * FROM parts WHERE id = ?').get(partId) as PartRow | undefined
    if (!part) return
    snapshot.push({ table: 'parts', data: part })
    const probs = db.prepare('SELECT * FROM problems WHERE part_id = ?').all(partId) as ProblemRow[]
    for (const pr of probs) snapshot.push({ table: 'problems', data: pr })
  }

  ipcMain.handle('folder:create', (_e, { name, parentId }: { name: string; parentId?: number }) => {
    const stmt = db.prepare('INSERT INTO folders (name, parent_id) VALUES (?, ?)')
    const result = stmt.run(name, parentId ?? null)
    return { id: Number(result.lastInsertRowid) }
  })

  ipcMain.handle('folder:move', (_e, { id, parentId }: { id: number; parentId?: number | null }) => {
    const folder = db.prepare('SELECT id FROM folders WHERE id = ?').get(id) as { id: number } | undefined
    if (!folder) return { success: false, error: '文件夹不存在' }
    if (parentId != null) {
      if (parentId === id) return { success: false, error: '不能移动到自身' }
      const descendant = db.prepare(`
        WITH RECURSIVE cte AS (
          SELECT id FROM folders WHERE id = ?
          UNION ALL
          SELECT f.id FROM folders f JOIN cte ON f.parent_id = cte.id
        )
        SELECT id FROM cte WHERE id = ?
      `).get(id, parentId) as { id: number } | undefined
      if (descendant) return { success: false, error: '不能移动到自己的子文件夹中' }
    }
    db.transaction(() => {
      const last = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM folders WHERE parent_id IS ?').get(parentId ?? null) as { m: number }
      db.prepare('UPDATE folders SET parent_id = ?, sort_order = ? WHERE id = ?').run(parentId ?? null, last.m + 1, id)
    })()
    return { success: true }
  })

  ipcMain.handle('folder:reorder', (_e, { items }: { items: { id: number; sortOrder: number }[] }) => {
    const stmt = db.prepare('UPDATE folders SET sort_order = ? WHERE id = ?')
    const transaction = db.transaction(() => {
      for (const item of items) stmt.run(item.sortOrder, item.id)
    })
    transaction()
    return { success: true }
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
    const snapshot: any[] = []
    db.transaction(() => {
      snapshotFolderTree(id, snapshot)
      const folderIds = snapshot.filter(e => e.table === 'folders').map(e => e.data.id as number)
      if (folderIds.length > 0) {
        db.prepare(`DELETE FROM folders WHERE id IN (${folderIds.map(() => '?').join(',')})`).run(...folderIds)
      }
    })()
    if (snapshot.length > 0) {
      const folder = snapshot.find(e => e.table === 'folders' && e.data.id === id)?.data ?? snapshot.find(e => e.table === 'folders')?.data
      logOperation(`删除文件夹"${folder?.name ?? ''}"（含 ${snapshot.length - 1} 项内容）`, snapshot)
    }
    return { success: true }
  })

  ipcMain.handle('sheet:create', (_e, { name, folderId }: { name: string; folderId?: number }) => {
    const stmt = db.prepare('INSERT INTO sheets (name, folder_id) VALUES (?, ?)')
    const result = stmt.run(name, folderId ?? null)
    return { id: Number(result.lastInsertRowid) }
  })

  ipcMain.handle('sheet:move', (_e, { id, folderId }: { id: number; folderId?: number | null }) => {
    const sheet = db.prepare('SELECT id FROM sheets WHERE id = ?').get(id) as { id: number } | undefined
    if (!sheet) return { success: false, error: '题单不存在' }
    if (folderId != null) {
      const folder = db.prepare('SELECT id FROM folders WHERE id = ?').get(folderId) as { id: number } | undefined
      if (!folder) return { success: false, error: '目标文件夹不存在' }
    }
    db.transaction(() => {
      const last = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM sheets WHERE folder_id IS ?').get(folderId ?? null) as { m: number }
      db.prepare('UPDATE sheets SET folder_id = ?, sort_order = ? WHERE id = ?').run(folderId ?? null, last.m + 1, id)
    })()
    return { success: true }
  })

  ipcMain.handle('sheet:reorder', (_e, { items }: { items: { id: number; sortOrder: number }[] }) => {
    const stmt = db.prepare('UPDATE sheets SET sort_order = ? WHERE id = ?')
    const transaction = db.transaction(() => {
      for (const item of items) stmt.run(item.sortOrder, item.id)
    })
    transaction()
    return { success: true }
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
    const snapshot: any[] = []
    db.transaction(() => {
      snapshotSheetTree(id, snapshot)
      db.prepare('DELETE FROM sheets WHERE id = ?').run(id)
    })()
    if (snapshot.length > 0) {
      const sheet = snapshot[0].data as SheetRow
      logOperation(`删除题单"${sheet.name}"（含 ${snapshot.length - 1} 项内容）`, snapshot)
    }
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
    const snapshot: any[] = []
    db.transaction(() => {
      snapshotPartTree(id, snapshot)
      db.prepare('DELETE FROM parts WHERE id = ?').run(id)
    })()
    if (snapshot.length > 0) {
      const part = snapshot[0].data as PartRow
      logOperation(`删除 Part"${part.title}"（含 ${snapshot.length - 1} 项内容）`, snapshot)
    }
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
    const problem = db.prepare('SELECT * FROM problems WHERE id = ?').get(id) as ProblemRow | undefined
    if (problem) {
      db.prepare('DELETE FROM problems WHERE id = ?').run(id)
      logOperation(`删除题目"${problem.name}"`, [{ table: 'problems', data: problem }])
    }
    return { success: true }
  })

  ipcMain.handle('problem:toggle', (_e, { id }: { id: number }) => {
    const problem = db.prepare('SELECT completed FROM problems WHERE id = ?').get(id) as ProblemRow | undefined
    if (!problem) return { success: false }
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

  ipcMain.handle('problem:batchSetCompleted', (_e, { ids, completed }: { ids: number[]; completed: boolean }) => {
    const stmt = db.prepare('UPDATE problems SET completed = ? WHERE id = ?')
    const transaction = db.transaction(() => {
      for (const id of ids) stmt.run(completed ? 1 : 0, id)
    })
    transaction()
    return { success: true }
  })

  ipcMain.handle('problem:batchDelete', (_e, { ids }: { ids: number[] }) => {
    const snapshot: any[] = []
    const transaction = db.transaction(() => {
      for (const id of ids) {
        const prob = db.prepare('SELECT * FROM problems WHERE id = ?').get(id) as ProblemRow | undefined
        if (!prob) continue
        snapshot.push({ table: 'problems', data: prob })
        db.prepare('DELETE FROM problems WHERE id = ?').run(id)
      }
    })
    transaction()
    if (snapshot.length > 0) {
      logOperation(`批量删除了 ${snapshot.length} 项内容`, snapshot)
    }
    return { success: true }
  })

  ipcMain.handle('part:batchDelete', (_e, { ids }: { ids: number[] }) => {
    const snapshot: any[] = []
    const transaction = db.transaction(() => {
      for (const id of ids) {
        snapshotPartTree(id, snapshot)
        db.prepare('DELETE FROM parts WHERE id = ?').run(id)
      }
    })
    transaction()
    if (snapshot.length > 0) {
      logOperation(`批量删除了 ${snapshot.length} 项内容`, snapshot)
    }
    return { success: true }
  })

  ipcMain.handle('sheet:batchDelete', (_e, { ids }: { ids: number[] }) => {
    const snapshot: any[] = []
    const transaction = db.transaction(() => {
      for (const id of ids) {
        snapshotSheetTree(id, snapshot)
        db.prepare('DELETE FROM sheets WHERE id = ?').run(id)
      }
    })
    transaction()
    if (snapshot.length > 0) {
      logOperation(`批量删除了 ${snapshot.length} 项内容`, snapshot)
    }
    return { success: true }
  })

  ipcMain.handle('folder:batchDelete', (_e, { ids }: { ids: number[] }) => {
    const snapshot: any[] = []
    const transaction = db.transaction(() => {
      for (const id of ids) {
        snapshotFolderTree(id, snapshot)
        const folderIds = snapshot.filter(e => e.table === 'folders').map(e => e.data.id as number)
        if (folderIds.length > 0) {
          db.prepare(`DELETE FROM folders WHERE id IN (${folderIds.map(() => '?').join(',')})`).run(...folderIds)
        }
      }
    })
    transaction()
    if (snapshot.length > 0) {
      logOperation(`批量删除了 ${snapshot.length} 项内容`, snapshot)
    }
    return { success: true }
  })

  ipcMain.handle('problem:randomFromContext', (_e, { folderId }: { folderId?: number }) => {
    if (folderId == null) {
      const row = db.prepare(`
        SELECT p.id, p.name, p.part_id, COALESCE(p.sheet_id, pt.sheet_id) AS sheet_id
        FROM problems p
        LEFT JOIN parts pt ON p.part_id = pt.id
        WHERE p.completed = 0
        ORDER BY RANDOM() LIMIT 1
      `).get() as { id: number; name: string; part_id: number | null; sheet_id: number } | undefined
      return row ?? null
    }
    const row = db.prepare(`
      WITH RECURSIVE folder_tree AS (
        SELECT id FROM folders WHERE id = ?
        UNION ALL
        SELECT f.id FROM folders f JOIN folder_tree ft ON f.parent_id = ft.id
      )
      SELECT p.id, p.name, p.part_id, COALESCE(p.sheet_id, pt.sheet_id) AS sheet_id
      FROM problems p
      LEFT JOIN parts pt ON p.part_id = pt.id
      WHERE COALESCE(p.sheet_id, pt.sheet_id) IN (
        SELECT id FROM sheets WHERE folder_id IN (SELECT id FROM folder_tree)
      ) AND p.completed = 0
      ORDER BY RANDOM() LIMIT 1
    `).get(folderId) as { id: number; name: string; part_id: number | null; sheet_id: number } | undefined
    return row ?? null
  })

  ipcMain.handle('tree:get', () => {
    const folders = db.prepare('SELECT id, name, description, parent_id, created_at FROM folders ORDER BY COALESCE(parent_id, 0), sort_order, id').all() as FolderRow[]
    const sheets = db.prepare('SELECT id, name, description, folder_id, created_at FROM sheets ORDER BY sort_order, id').all() as SheetRow[]
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
    const escaped = query.replace(/[\\%_]/g, m => `\\${m}`)
    const pattern = `%${escaped}%`
    const like = "name LIKE ? ESCAPE '\\'"
    const folders = db.prepare(`SELECT id, name, parent_id, 'folder' as type FROM folders WHERE ${like}`).all(pattern) as any[]
    const sheets = db.prepare(`SELECT s.id, s.name, s.folder_id, 'sheet' as type FROM sheets s WHERE s.${like}`).all(pattern) as any[]
    const parts = db.prepare(`SELECT p.id, p.title as name, p.sheet_id, COALESCE(s.name, '') as sheet_name, 'part' as type FROM parts p LEFT JOIN sheets s ON p.sheet_id = s.id WHERE p.${like}`).all(pattern) as any[]
    const problems = db.prepare(`SELECT p.id, p.name, p.part_id, COALESCE(p.sheet_id, pt.sheet_id) as sheet_id, 'problem' as type FROM problems p LEFT JOIN parts pt ON p.part_id = pt.id WHERE p.${like}`).all(pattern) as any[]
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
    const foldersById = new Map<number, FolderRow>()
    for (const f of folders) {
      foldersById.set(f.id, f)
      const pk = f.parent_id ?? 0
      if (!folderMap.has(pk)) folderMap.set(pk, [])
      folderMap.get(pk)!.push(f)
    }

    const folderPathCache = new Map<number, string>()
    function folderPath(folder: FolderRow): string {
      const cached = folderPathCache.get(folder.id)
      if (cached !== undefined) return cached
      const names: string[] = [folder.name]
      let parentId = folder.parent_id
      while (parentId != null) {
        const parent = foldersById.get(parentId)
        if (!parent) break
        names.unshift(parent.name)
        parentId = parent.parent_id
      }
      const path = names.join('/')
      folderPathCache.set(folder.id, path)
      return path
    }

    function renderDescription(desc: string): void {
      if (!desc) return
      for (const dl of desc.split('\n')) md += `> ${dl}\n`
      md += '\n'
    }

    function renderProblems(probList: ProblemRow[]): void {
      for (const prob of probList) {
        md += `- [${prob.completed ? 'x' : ' '}] ${prob.name}\n`
      }
      if (probList.length > 0) md += '\n'
    }

    function renderSheet(sheet: SheetRow): void {
      md += `## ${sheet.name}\n`
      renderDescription(sheet.description || '')
      const sp = partsList.filter(p => p.sheet_id === sheet.id)
      for (const part of sp) {
        md += `### ${part.title}\n\n`
        renderProblems(problems.filter(p => p.part_id === part.id))
      }
      renderProblems(problems.filter(p => p.sheet_id === sheet.id && !p.part_id))
    }

    function renderFolder(folder: FolderRow): void {
      md += `# ${folderPath(folder)}\n`
      renderDescription(folder.description || '')
      for (const sheet of sheets.filter(s => (s.folder_id ?? 0) === folder.id)) renderSheet(sheet)
      for (const child of folderMap.get(folder.id) ?? []) renderFolder(child)
    }

    for (const sheet of sheets.filter(s => (s.folder_id ?? 0) === 0)) renderSheet(sheet)
    for (const folder of folderMap.get(0) ?? []) renderFolder(folder)
    writeFileSync(filePath, md, 'utf-8')
    return { success: true }
  })

  ipcMain.handle('markdown:import', async (_e, { content, targetFolderId, sheetId, activePartId }: { content: string; targetFolderId?: number; sheetId?: number; activePartId?: number }) => {
    const lines = content.split('\n')

    const hasH1 = lines.some(l => /^#[^#]/.test(l.trim()))
    const hasH2 = lines.some(l => /^##[^#]/.test(l.trim()))
    const hasH3 = lines.some(l => /^###[^#]/.test(l.trim()))

    const inSheetContext = sheetId != null || activePartId != null
    const inPartContext = activePartId != null

    if (hasH1 || hasH2) {
      if (inSheetContext) {
        return { success: false, error: '导入包含文件夹/题单，不能在题单中选择' }
      }
    } else if (hasH3) {
      if (inPartContext) {
        return { success: false, error: 'Part 中不允许创建 Part' }
      }
      if (!inSheetContext) {
        return { success: false, error: '请先选题单' }
      }
    } else {
      const hasContent = lines.some(l => l.trim().length > 0)
      if (!hasContent) {
        return { success: false, error: '未检测到有效内容' }
      }
      if (!inSheetContext) {
        return { success: false, error: '请先选题单' }
      }
    }

    let currentFolderId: number | null = targetFolderId ?? null
    let currentSheetId: number | null = sheetId ?? null
    let currentPartId: number | null = activePartId ?? null
    let currentDescription = ''
    let lastEntityType: 'folder' | 'sheet' | null = null
    let lastEntityId: number | null = null

    const flushDescription = (): void => {
      if (!currentDescription) return
      const desc = currentDescription.trim()
      if (lastEntityType === 'folder' && lastEntityId != null) {
        db.prepare('UPDATE folders SET description = ? WHERE id = ?').run(desc, lastEntityId)
      } else if (lastEntityType === 'sheet' && lastEntityId != null) {
        db.prepare('UPDATE sheets SET description = ? WHERE id = ?').run(desc, lastEntityId)
      }
      currentDescription = ''
    }

    const transaction = db.transaction(() => {
      for (const rawLine of lines) {
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
            lastEntityType = 'folder'
            lastEntityId = currentFolderId
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
            lastEntityType = 'sheet'
            lastEntityId = currentSheetId
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
      flushDescription()
    })
    transaction()
    return { success: true }
  })

  ipcMain.handle('operation:log', (_e, { description, snapshot }: { description: string; snapshot: any[] }) => {
    db.prepare('INSERT INTO operation_log (description, snapshot) VALUES (?, ?)').run(description, JSON.stringify(snapshot))
    return { success: true }
  })

  ipcMain.handle('operation:getLogs', (_e, { limit }: { limit: number }) => {
    const logs = db.prepare('SELECT id, description, snapshot, created_at FROM operation_log ORDER BY id DESC LIMIT ?').all(limit) as { id: number; description: string; snapshot: string; created_at: string }[]
    return logs.map(l => ({ id: l.id, description: l.description, created_at: l.created_at, snapshot: JSON.parse(l.snapshot) as any[] }))
  })

  ipcMain.handle('operation:rollback', (_e, { id }: { id: number }) => {
    const log = db.prepare('SELECT * FROM operation_log WHERE id = ?').get(id) as { id: number; description: string; snapshot: string; created_at: string } | undefined
    if (!log) return { success: false, error: '日志不存在' }
    const snapshot = JSON.parse(log.snapshot) as { table: string; data: Record<string, any> }[]

    const byTable: Record<string, Record<string, any>[]> = { folders: [], sheets: [], parts: [], problems: [] }
    for (const entry of snapshot) {
      byTable[entry.table]?.push(entry.data)
    }

    try {
      db.pragma('foreign_keys = OFF')
      db.transaction(() => {
        const insertFolders = byTable.folders.sort((a, b) => a.id - b.id)
        for (const d of insertFolders) {
          db.prepare('INSERT OR IGNORE INTO folders (id, name, description, parent_id, sort_order) VALUES (?, ?, ?, ?, ?)').run(d.id, d.name, d.description || '', d.parent_id, d.sort_order || 0)
        }
        const insertSheets = byTable.sheets.sort((a, b) => a.id - b.id)
        for (const d of insertSheets) {
          db.prepare('INSERT OR IGNORE INTO sheets (id, name, description, folder_id, sort_order) VALUES (?, ?, ?, ?, ?)').run(d.id, d.name, d.description || '', d.folder_id, d.sort_order || 0)
        }
        const insertParts = byTable.parts.sort((a, b) => a.id - b.id)
        for (const d of insertParts) {
          db.prepare('INSERT OR IGNORE INTO parts (id, title, sheet_id, sort_order) VALUES (?, ?, ?, ?)').run(d.id, d.title, d.sheet_id, d.sort_order || 0)
        }
        const insertProblems = byTable.problems.sort((a, b) => a.id - b.id)
        for (const d of insertProblems) {
          db.prepare('INSERT OR IGNORE INTO problems (id, name, part_id, sheet_id, sort_order, completed) VALUES (?, ?, ?, ?, ?, ?)').run(d.id, d.name, d.part_id, d.sheet_id, d.sort_order || 0, d.completed || 0)
        }
      })()
      db.pragma('foreign_keys = ON')
    } catch (e) {
      db.pragma('foreign_keys = ON')
      return { success: false, error: '回滚失败：' + (e instanceof Error ? e.message : String(e)) }
    }
    return { success: true }
  })

  ipcMain.handle('operation:cleanup', (_e, { maxCount }: { maxCount: number }) => {
    db.prepare('DELETE FROM operation_log WHERE id NOT IN (SELECT id FROM operation_log ORDER BY id DESC LIMIT ?)').run(maxCount)
    return { success: true }
  })
}
