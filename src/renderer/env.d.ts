/// <reference types="vite/client" />

interface ApiType {
  folder: {
    create(params: { name: string; parentId?: number }): Promise<{ id: number }>
    rename(params: { id: number; name: string }): Promise<{ success: boolean }>
    delete(params: { id: number }): Promise<{ success: boolean }>
    updateDescription(params: { id: number; description: string }): Promise<{ success: boolean }>
  }
  sheet: {
    create(params: { name: string; folderId?: number }): Promise<{ id: number }>
    rename(params: { id: number; name: string }): Promise<{ success: boolean }>
    delete(params: { id: number }): Promise<{ success: boolean }>
    getById(params: { id: number }): Promise<SheetDetail | null>
    updateDescription(params: { id: number; description: string }): Promise<{ success: boolean }>
  }
  part: {
    create(params: { title: string; sheetId: number }): Promise<{ id: number }>
    rename(params: { id: number; title: string }): Promise<{ success: boolean }>
    delete(params: { id: number }): Promise<{ success: boolean }>
  }
  problem: {
    create(params: { name: string; partId?: number; sheetId?: number }): Promise<{ id: number }>
    update(params: { id: number; name: string }): Promise<{ success: boolean }>
    delete(params: { id: number }): Promise<{ success: boolean }>
    toggle(params: { id: number }): Promise<{ success: boolean }>
    reorder(params: { items: { id: number; sortOrder: number }[] }): Promise<{ success: boolean }>
    bulkCreate(params: { names: string[]; partId?: number; sheetId?: number }): Promise<{ success: boolean }>
    randomFromContext(params: { folderId?: number }): Promise<{ id: number; name: string; part_id: number | null; sheet_id: number } | null>
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
    import(params: { content: string; targetFolderId?: number; sheetId?: number; activePartId?: number }): Promise<{ success: boolean }>
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
}

interface SheetItem {
  id: number
  name: string
  description: string
  folder_id: number | null
  sort_order: number
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
  parts: { id: number; name: string; sheet_id: number; type: 'part' }[]
  problems: { id: number; name: string; part_id: number | null; sheet_id: number | null; type: 'problem' }[]
}

declare global {
  interface Window {
    api: ApiType
  }
}
