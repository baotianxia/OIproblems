import { useEffect, useState, useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Tree, Dropdown, Modal, Input, message, Spin, Typography } from 'antd'
import type { MenuProps } from 'antd'
import type { DataNode } from 'antd/es/tree'
import { PlusOutlined, FolderOutlined, FileOutlined, OrderedListOutlined } from '@ant-design/icons'
import { submitOnEnter } from '../utils'
import { AutoFocusInput } from './AutoFocusInput'
import { useAppContext } from '../context/AppContext'
import type { TreeNode } from '../types'

function buildTreeData(
  folders: FolderItem[],
  sheets: SheetItem[],
  parts: PartItem[]
): TreeNode[] {
  const folderMap = new Map<number | null, FolderItem[]>()
  for (const f of folders) {
    const pk = f.parent_id
    if (!folderMap.has(pk)) folderMap.set(pk, [])
    folderMap.get(pk)!.push(f)
  }

  function makeFolderNodes(parentId: number | null): TreeNode[] {
    const children = folderMap.get(parentId) ?? []
    const result: TreeNode[] = []
    for (const f of children) {
      const childFolders = makeFolderNodes(f.id)
      const childSheets = sheets
        .filter(s => s.folder_id === f.id)
        .map(s => makeSheetNode(s, parts))
      result.push({
        key: `folder-${f.id}`,
        title: f.name,
        type: 'folder' as const,
        id: f.id,
        parent_id: f.parent_id,
        children: [...childFolders, ...childSheets].length > 0 ? [...childFolders, ...childSheets] : undefined,
        isLeaf: childFolders.length === 0 && childSheets.length === 0
      })
    }
    if (parentId === null) {
      const rootSheets = sheets
        .filter(s => s.folder_id === null)
        .map(s => makeSheetNode(s, parts))
      result.push(...rootSheets)
    }
    return result
  }

  function makeSheetNode(s: SheetItem, parts: PartItem[]): TreeNode {
    const partChildren = parts
      .filter(p => p.sheet_id === s.id)
      .map(p => ({
        key: `part-${p.id}`,
        title: p.title,
        type: 'part' as const,
        id: p.id,
        sheet_id: p.sheet_id,
        isLeaf: true
      }))
    return {
      key: `sheet-${s.id}`,
      title: s.name,
      type: 'sheet' as const,
      id: s.id,
      folder_id: s.folder_id,
      children: partChildren.length > 0 ? partChildren : undefined,
      isLeaf: partChildren.length === 0
    }
  }

  return makeFolderNodes(null)
}

export default function DirectoryTreeComponent(): JSX.Element {
  const { selectNode, treeVersion, refreshTree, selectedNode } = useAppContext()
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([])
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const contextNodeRef = useRef<{ key: string; type: string; id: number; parent_id?: number | null; folder_id?: number; sheet_id?: number } | null>(null)
  const [, forceUpdate] = useState(0)
  const expandedLoaded = useRef(false)

  const persistExpandedKeys = useCallback(async (keys: React.Key[]) => {
    await window.api.ui.set('expandedKeys', JSON.stringify(keys))
  }, [])

  const loadTree = useCallback(async () => {
    const data = await window.api.tree.get()
    const nodes = buildTreeData(data.folders, data.sheets, data.parts)
    setTreeNodes(nodes)

    if (!expandedLoaded.current) {
      expandedLoaded.current = true
      const saved = await window.api.ui.get('expandedKeys')
      if (saved) {
        setExpandedKeys(JSON.parse(saved))
      } else {
        const keys: React.Key[] = []
        function collectKeys(ns: TreeNode[]): void {
          for (const n of ns) {
            keys.push(n.key)
            if (n.children) collectKeys(n.children)
          }
        }
        collectKeys(nodes)
        setExpandedKeys(keys)
        persistExpandedKeys(keys)
      }
    }
  }, [persistExpandedKeys])

  useEffect(() => {
    loadTree()
  }, [treeVersion, loadTree])

  const handleSelect = (_: React.Key[], info: { node: DataNode; nativeEvent?: MouseEvent }) => {
    const node = info.node as unknown as TreeNode

    if (info.nativeEvent) {
      const target = info.nativeEvent.target as HTMLElement
      if (!target.closest('.ant-tree-node-content-wrapper')) {
        selectNode(null)
        return
      }
    }

    if (node.type === 'folder') {
      selectNode({ id: node.id, type: 'folder', name: node.title as string })
    } else if (node.type === 'sheet') {
      selectNode({ id: node.id, type: 'sheet', name: node.title as string })
    } else if (node.type === 'part') {
      selectNode({ id: node.sheet_id!, type: 'sheet', name: node.title as string, partId: node.id })
    }
  }

  const handleRightClick = (info: { node: DataNode; event: React.MouseEvent }) => {
    info.event.preventDefault()
    const node = info.node as unknown as TreeNode
    contextNodeRef.current = { key: node.key, type: node.type, id: node.id, parent_id: node.parent_id, folder_id: node.folder_id, sheet_id: node.sheet_id }
    flushSync(() => forceUpdate(n => n + 1))
  }

  const getParentId = (key: string): number | undefined => {
    const match = key.match(/folder-(\d+)/)
    if (match) return parseInt(match[1])
    return undefined
  }

  const createFolder = () => {
    const parentKey = contextNodeRef.current?.type === 'folder' ? contextNodeRef.current.key : undefined
    const defaultParentId = contextNodeRef.current?.type === 'folder' ? contextNodeRef.current.id : undefined
    let name = ''
    Modal.confirm({
      title: '新建文件夹',
      autoFocusButton: null,
      content: (
<AutoFocusInput
            placeholder="输入文件夹名称"
            onChange={e => { name = e.target.value }}
            onKeyDown={submitOnEnter}
          />
      ),
      onOk: async () => {
        if (!name.trim()) return
        await window.api.folder.create({ name: name.trim(), parentId: defaultParentId })
        await refreshTree()
        if (parentKey) setExpandedKeys(keys => Array.from(new Set([...keys, parentKey])))
        message.success('文件夹已创建')
      }
    })
  }

  const createSheet = () => {
    const parentKey = contextNodeRef.current?.type === 'folder' ? contextNodeRef.current.key : undefined
    const folderId = contextNodeRef.current?.type === 'folder' ? contextNodeRef.current.id : undefined
    const hint = folderId ? '（将在选中文件夹下创建）' : '（将在根目录创建）'
    let name = ''
    Modal.confirm({
      title: '新建题单',
      autoFocusButton: null,
      content: (
        <div>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>{hint}</Typography.Text>
<AutoFocusInput
              placeholder="输入题单名称"
              onChange={e => { name = e.target.value }}
              onKeyDown={submitOnEnter}
            />
        </div>
      ),
      onOk: async () => {
        if (!name.trim()) return
        await window.api.sheet.create({ name: name.trim(), folderId })
        await refreshTree()
        if (parentKey) setExpandedKeys(keys => Array.from(new Set([...keys, parentKey])))
        message.success('题单已创建')
      }
    })
  }

  const renameItem = () => {
    const node = contextNodeRef.current
    if (!node) return
    let newName = ''
    Modal.confirm({
      title: '重命名',
      autoFocusButton: null,
      content: (
<AutoFocusInput
            placeholder="输入新名称"
            onChange={e => { newName = e.target.value }}
            onKeyDown={submitOnEnter}
          />
      ),
      onOk: async () => {
        if (!newName.trim()) return
        const node = contextNodeRef.current
        if (!node) return
        if (node.type === 'folder') {
          await window.api.folder.rename({ id: node.id, name: newName.trim() })
        } else if (node.type === 'sheet') {
          await window.api.sheet.rename({ id: node.id, name: newName.trim() })
        } else if (node.type === 'part') {
          await window.api.part.rename({ id: node.id, title: newName.trim() })
        }
        await refreshTree()
        message.success('已重命名')
      }
    })
  }

  const findInTree = (nodes: TreeNode[], id: number, type: string): TreeNode | null => {
    for (const n of nodes) {
      if (n.type === type && n.id === id) return n
      if (n.children) {
        const found = findInTree(n.children, id, type)
        if (found) return found
      }
    }
    return null
  }

  const nodeInSubtree = (nodes: TreeNode[], targetKey: string): boolean => {
    for (const n of nodes) {
      if (n.key === targetKey) return true
      if (n.children && nodeInSubtree(n.children, targetKey)) return true
    }
    return false
  }

  const deleteItem = () => {
    const node = contextNodeRef.current
    if (!node) return
    const confirmText = node.type === 'part'
      ? '确认删除此 Part？内部的题目也将被删除'
      : '删除后无法恢复，确认继续？'
    Modal.confirm({
      title: '确认删除',
      autoFocusButton: null,
      content: confirmText,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          if (node.type === 'folder') {
            await window.api.folder.delete({ id: node.id })
          } else if (node.type === 'sheet') {
            await window.api.sheet.delete({ id: node.id })
          } else if (node.type === 'part') {
            await window.api.part.delete({ id: node.id })
          }
          // Navigate to nearest ancestor if the deleted item affects current selection
          if (selectedNode) {
            const selectedKey = `${selectedNode.type}-${selectedNode.id}`
            if (node.type === 'part' && selectedNode.type === 'sheet' && selectedNode.partId === node.id) {
              const sheetNode = findInTree(treeNodes, node.sheet_id!, 'sheet')
              selectNode({ id: node.sheet_id!, type: 'sheet', name: sheetNode?.title as string || '' })
            } else if (selectedNode.type === node.type && selectedNode.id === node.id) {
              // Direct match: navigate to parent
              if (node.type === 'folder') {
                const parentId = node.parent_id
                if (parentId != null) {
                  const parent = findInTree(treeNodes, parentId, 'folder')
                  selectNode({ id: parentId, type: 'folder', name: parent?.title as string || '' })
                } else {
                  selectNode(null)
                }
              } else if (node.type === 'sheet') {
                const folderId = node.folder_id
                if (folderId != null) {
                  const parent = findInTree(treeNodes, folderId, 'folder')
                  selectNode({ id: folderId, type: 'folder', name: parent?.title as string || '' })
                } else {
                  selectNode(null)
                }
              }
            } else if (node.type === 'folder') {
              // Check if deleted folder is ancestor of selected node
              const delNode = findInTree(treeNodes, node.id, 'folder')
              if (delNode?.children && nodeInSubtree(delNode.children, selectedKey)) {
                const parentId = node.parent_id
                if (parentId != null) {
                  const parent = findInTree(treeNodes, parentId, 'folder')
                  selectNode({ id: parentId, type: 'folder', name: parent?.title as string || '' })
                } else {
                  selectNode(null)
                }
              }
            }
          }
          await refreshTree()
          message.success('已删除')
        } catch (e) {
          message.error('删除失败')
        }
      }
    })
  }

  const getContextMenuItems = (): MenuProps['items'] => {
    const items: MenuProps['items'] = [
      {
        key: 'new-folder',
        icon: <PlusOutlined />,
        label: '新建文件夹',
        onClick: createFolder
      }
    ]
    items.push({
      key: 'new-sheet',
      icon: <OrderedListOutlined />,
      label: '新建题单',
      onClick: createSheet
    })
    if (contextNodeRef.current) {
      items.push({ type: 'divider' })
      items.push({
        key: 'rename',
        label: '重命名',
        onClick: renameItem
      })
      items.push({
        key: 'delete',
        label: '删除',
        danger: true,
        onClick: deleteItem
      })
    }
    return items
  }

  const convertToDataNode = (node: TreeNode): DataNode => ({
    key: node.key,
    title: node.title,
    type: node.type,
    id: node.id,
    parent_id: node.parent_id,
    folder_id: node.folder_id,
    sheet_id: node.sheet_id,
    icon: node.type === 'folder' ? <FolderOutlined /> : node.type === 'sheet' ? <OrderedListOutlined /> : <FileOutlined />,
    children: node.children?.map(convertToDataNode),
    isLeaf: node.isLeaf
  })

  const selectedKeys: React.Key[] = selectedNode
    ? [`${selectedNode.type}-${selectedNode.id}`]
    : []

  return (
    <Dropdown
      menu={{ items: getContextMenuItems() }}
      trigger={['contextMenu']}
      onOpenChange={open => { if (!open) contextNodeRef.current = null }}
    >
      <div style={{ padding: '8px 0', cursor: 'default' }} onClick={e => {
        if (!(e.target as HTMLElement).closest('.ant-tree-treenode')) {
          selectNode(null)
        }
      }}>
        <Tree
          treeData={treeNodes.map(convertToDataNode)}
          selectedKeys={selectedKeys}
          onSelect={handleSelect}
          onRightClick={handleRightClick}
          expandedKeys={expandedKeys}
          onExpand={keys => { setExpandedKeys(keys); persistExpandedKeys(keys) }}
          showIcon
          style={{ fontSize: 14 }}
        />
      </div>
    </Dropdown>
  )
}
