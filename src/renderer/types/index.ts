export interface TreeNode {
  key: string
  title: string
  type: 'folder' | 'sheet' | 'part'
  id: number
  parent_id?: number | null
  folder_id?: number
  sheet_id?: number
  children?: TreeNode[]
  isLeaf?: boolean
}

export interface SelectedNode {
  id: number
  type: 'folder' | 'sheet' | 'part'
  name?: string
  partId?: number
  highlightProblemId?: number
  highlightKey?: number
}
