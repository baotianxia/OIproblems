import { contextBridge, ipcRenderer } from 'electron'

const api = {
  folder: {
    create: (params: { name: string; parentId?: number }) =>
      ipcRenderer.invoke('folder:create', params),
    rename: (params: { id: number; name: string }) =>
      ipcRenderer.invoke('folder:rename', params),
    delete: (params: { id: number }) =>
      ipcRenderer.invoke('folder:delete', params),
    updateDescription: (params: { id: number; description: string }) =>
      ipcRenderer.invoke('folder:updateDescription', params)
  },
  sheet: {
    create: (params: { name: string; folderId?: number }) =>
      ipcRenderer.invoke('sheet:create', params),
    rename: (params: { id: number; name: string }) =>
      ipcRenderer.invoke('sheet:rename', params),
    delete: (params: { id: number }) =>
      ipcRenderer.invoke('sheet:delete', params),
    getById: (params: { id: number }) =>
      ipcRenderer.invoke('sheet:getById', params),
    updateDescription: (params: { id: number; description: string }) =>
      ipcRenderer.invoke('sheet:updateDescription', params)
  },
  part: {
    create: (params: { title: string; sheetId: number }) =>
      ipcRenderer.invoke('part:create', params),
    rename: (params: { id: number; title: string }) =>
      ipcRenderer.invoke('part:rename', params),
    delete: (params: { id: number }) =>
      ipcRenderer.invoke('part:delete', params)
  },
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
    bulkCreate: (params: { names: string[]; partId?: number; sheetId?: number }) =>
      ipcRenderer.invoke('problem:bulkCreate', params)
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
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ApiType = typeof api
