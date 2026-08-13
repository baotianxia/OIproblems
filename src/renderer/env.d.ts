/// <reference types="vite/client" />

interface ApiType {
  folder: {
    create(params: { name: string; parentId?: number }): Promise<{ id: number }>
    rename(params: { id: number; name: string }): Promise<{ success: boolean }>
    delete(params: { id: number }): Promise<{ success: boolean }>
    move(params: { id: number; parentId?: number | null }): Promise<{ success: boolean; error?: string }>
    reorder(params: { items: { id: number; sortOrder: number }[] }): Promise<{ success: boolean }>
    updateDescription(params: { id: number; description: string }): Promise<{ success: boolean }>
    batchDelete(params: { ids: number[] }): Promise<{ success: boolean }>
  }
  sheet: {
    create(params: { name: string; folderId?: number }): Promise<{ id: number }>
    rename(params: { id: number; name: string }): Promise<{ success: boolean }>
    delete(params: { id: number }): Promise<{ success: boolean }>
    move(params: { id: number; folderId?: number | null }): Promise<{ success: boolean; error?: string }>
    reorder(params: { items: { id: number; sortOrder: number }[] }): Promise<{ success: boolean }>
    getById(params: { id: number }): Promise<SheetDetail | null>
    updateDescription(params: { id: number; description: string }): Promise<{ success: boolean }>
    batchDelete(params: { ids: number[] }): Promise<{ success: boolean }>
  }
  part: {
    create(params: { title: string; sheetId: number }): Promise<{ id: number }>
    rename(params: { id: number; title: string }): Promise<{ success: boolean }>
    delete(params: { id: number }): Promise<{ success: boolean }>
    batchDelete(params: { ids: number[] }): Promise<{ success: boolean }>
  }
  problem: {
    create(params: { name: string; partId?: number; sheetId?: number }): Promise<{ id: number }>
    update(params: { id: number; name: string }): Promise<{ success: boolean }>
    delete(params: { id: number }): Promise<{ success: boolean }>
    toggle(params: { id: number }): Promise<{ success: boolean }>
    reorder(params: { items: { id: number; sortOrder: number }[] }): Promise<{ success: boolean }>
    bulkCreate(params: { names: string[]; partId?: number; sheetId?: number }): Promise<{ success: boolean }>
    randomFromContext(params: { folderId?: number }): Promise<{ id: number; name: string; part_id: number | null; sheet_id: number } | null>
    batchSetCompleted(params: { ids: number[]; completed: boolean }): Promise<{ success: boolean }>
    batchDelete(params: { ids: number[] }): Promise<{ success: boolean }>
  }
  tree: {
    get(): Promise<TreeData>
  }
  stats: {
    global(): Promise<GlobalStats>
    folder(params: { id: number }): Promise<GlobalStats>
  }
  ui: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<{ success: boolean }>
  }
  search: {
    global(params: { query: string }): Promise<SearchResults>
  }
  file: {
    openMarkdown(): Promise<{ content: string | null; fileName?: string }>
  }
  markdown: {
    export(): Promise<{ success: boolean }>
    import(params: { content: string; targetFolderId?: number; sheetId?: number; activePartId?: number }): Promise<{ success: boolean; error?: string }>
  }
  operation: {
    log(params: { description: string; snapshot: any[] }): Promise<{ success: boolean }>
    getLogs(params: { limit: number }): Promise<{ id: number; description: string; created_at: string; snapshot: { table: string; data: any }[] }[]>
    rollback(params: { id: number }): Promise<{ success: boolean; error?: string }>
    cleanup(params: { maxCount: number }): Promise<{ success: boolean }>
  }
}

interface TreeData {
  folders: FolderItem[]
  sheets: SheetItem[]
  parts: PartItem[]
  problems: ProblemItem[]
}

interface FolderItem {
  id: number
  name: string
  description: string
  parent_id: number | null
  sort_order: number
  created_at: string
}

interface SheetItem {
  id: number
  name: string
  description: string
  folder_id: number | null
  sort_order: number
  created_at: string
}

interface PartItem {
  id: number
  title: string
  sheet_id: number
  sort_order: number
}

interface ProblemItem {
  id: number
  name: string
  part_id: number | null
  sheet_id: number | null
  completed: number
}

interface SheetDetail {
  sheet: SheetItem
  parts: (PartItem & { problems: ProblemItem[]; totalProblems: number; completedProblems: number })[]
  directProblems: ProblemItem[]
  totalProblems: number
  completedProblems: number
}

interface GlobalStats {
  totalProblems: number
  completedProblems: number
}

interface SearchResults {
  folders: { id: number; name: string; parent_id: number | null; type: 'folder' }[]
  sheets: { id: number; name: string; folder_id: number; type: 'sheet' }[]
  parts: { id: number; name: string; sheet_id: number; sheet_name: string; type: 'part' }[]
  problems: { id: number; name: string; part_id: number | null; sheet_id: number | null; type: 'problem' }[]
}

interface Window {
  api: ApiType
}
