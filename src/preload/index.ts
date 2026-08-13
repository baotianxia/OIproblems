import { contextBridge, ipcRenderer } from 'electron'

const api = {
  problem: {
    create: (params: { name: string; partId?: number; sheetId?: number }) =>
      ipcRenderer.invoke('problem:create', params),
    update: (params: { id: number; name: string }) =>
      ipcRenderer.invoke('problem:update', params),
    delete: (params: { id: number }) =>
      ipcRenderer.invoke('problem:delete', params),
    toggle: (params: { id: number }) =>
      ipcRenderer.invoke('problem:toggle', params),
    reorder: (params: { items: { id: number; sortOrder: number }[] }) =>
      ipcRenderer.invoke('problem:reorder', params),
    sort: (params: { items: { id: number; sortOrder: number }[] }) =>
      ipcRenderer.invoke('problem:sort', params),
    bulkCreate: (params: { names: string[]; partId?: number; sheetId?: number }) =>
      ipcRenderer.invoke('problem:bulkCreate', params),
    randomFromContext: (params: { folderId?: number }) =>
      ipcRenderer.invoke('problem:randomFromContext', params),
    batchSetCompleted: (params: { ids: number[]; completed: boolean }) =>
      ipcRenderer.invoke('problem:batchSetCompleted', params),
    batchDelete: (params: { ids: number[] }) =>
      ipcRenderer.invoke('problem:batchDelete', params)
  },
  part: {
    create: (params: { title: string; sheetId: number }) =>
      ipcRenderer.invoke('part:create', params),
    rename: (params: { id: number; title: string }) =>
      ipcRenderer.invoke('part:rename', params),
    delete: (params: { id: number }) =>
      ipcRenderer.invoke('part:delete', params),
    batchDelete: (params: { ids: number[] }) =>
      ipcRenderer.invoke('part:batchDelete', params)
  },
  sheet: {
    create: (params: { name: string; folderId?: number }) =>
      ipcRenderer.invoke('sheet:create', params),
    rename: (params: { id: number; name: string }) =>
      ipcRenderer.invoke('sheet:rename', params),
    delete: (params: { id: number }) =>
      ipcRenderer.invoke('sheet:delete', params),
    move: (params: { id: number; folderId?: number | null }) =>
      ipcRenderer.invoke('sheet:move', params),
    reorder: (params: { items: { id: number; sortOrder: number }[] }) =>
      ipcRenderer.invoke('sheet:reorder', params),
    getById: (params: { id: number }) =>
      ipcRenderer.invoke('sheet:getById', params),
    updateDescription: (params: { id: number; description: string }) =>
      ipcRenderer.invoke('sheet:updateDescription', params),
    batchDelete: (params: { ids: number[] }) =>
      ipcRenderer.invoke('sheet:batchDelete', params)
  },
  folder: {
    create: (params: { name: string; parentId?: number }) =>
      ipcRenderer.invoke('folder:create', params),
    rename: (params: { id: number; name: string }) =>
      ipcRenderer.invoke('folder:rename', params),
    delete: (params: { id: number }) =>
      ipcRenderer.invoke('folder:delete', params),
    move: (params: { id: number; parentId?: number | null }) =>
      ipcRenderer.invoke('folder:move', params),
    reorder: (params: { items: { id: number; sortOrder: number }[] }) =>
      ipcRenderer.invoke('folder:reorder', params),
    updateDescription: (params: { id: number; description: string }) =>
      ipcRenderer.invoke('folder:updateDescription', params),
    batchDelete: (params: { ids: number[] }) =>
      ipcRenderer.invoke('folder:batchDelete', params)
  },
  tree: {
    get: () => ipcRenderer.invoke('tree:get')
  },
  stats: {
    global: () => ipcRenderer.invoke('stats:global'),
    folder: (params: { id: number }) => ipcRenderer.invoke('stats:folder', params)
  },
  ui: {
    get: (key: string) => ipcRenderer.invoke('ui:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('ui:set', key, value)
  },
  search: {
    global: (params: { query: string }) =>
      ipcRenderer.invoke('search:global', params)
  },
  file: {
    openMarkdown: () => ipcRenderer.invoke('file:openMarkdown')
  },
  markdown: {
    export: () => ipcRenderer.invoke('markdown:export'),
    import: (params: { content: string; targetFolderId?: number; sheetId?: number; activePartId?: number }) =>
      ipcRenderer.invoke('markdown:import', params)
  },
  operation: {
    log: (params: { description: string; snapshot: any[] }) =>
      ipcRenderer.invoke('operation:log', params),
    getLogs: (params: { limit: number }) =>
      ipcRenderer.invoke('operation:getLogs', params),
    rollback: (params: { id: number }) =>
      ipcRenderer.invoke('operation:rollback', params),
    cleanup: (params: { maxCount: number }) =>
      ipcRenderer.invoke('operation:cleanup', params)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ApiType = typeof api
