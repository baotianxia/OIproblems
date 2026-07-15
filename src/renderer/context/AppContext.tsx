import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import type { SelectedNode } from '../types'

interface AppState {
  selectedNode: SelectedNode | null
  treeVersion: number
  dataVersion: number
  isDark: boolean
}

interface AppContextType extends AppState {
  selectNode: (node: SelectedNode | null) => void
  refreshTree: () => Promise<void>
  bumpDataVersion: () => void
  toggleTheme: () => void
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null)
  const [treeVersion, setTreeVersion] = useState(0)
  const [dataVersion, setDataVersion] = useState(0)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    window.api.ui.get('theme').then(val => {
      if (val === 'dark') setIsDark(true)
    })
  }, [])

  const selectNode = useCallback((node: SelectedNode | null) => {
    setSelectedNode(node)
  }, [])

  const refreshTree = useCallback(async () => {
    setTreeVersion(v => v + 1)
  }, [])

  const bumpDataVersion = useCallback(() => {
    setDataVersion(v => v + 1)
  }, [])

  const toggleTheme = useCallback(() => {
    setIsDark(prev => {
      const next = !prev
      window.api.ui.set('theme', next ? 'dark' : 'light')
      return next
    })
  }, [])

  return (
    <AppContext.Provider value={{ selectedNode, treeVersion, dataVersion, isDark, selectNode, refreshTree, bumpDataVersion, toggleTheme }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext(): AppContextType {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
