import { useEffect, useState, useCallback } from 'react'
import { Modal, Tree, message, Empty, Spin } from 'antd'
import { FolderOutlined, GlobalOutlined } from '@ant-design/icons'
import type { DataNode } from 'antd/es/tree'

interface Props {
  visible: boolean
  type: 'folder' | 'sheet'
  itemName: string
  excludeId?: number
  onClose: () => void
  onConfirm: (parentId: number | null) => Promise<{ success: boolean; error?: string }>
}

interface FolderNode extends DataNode {
  id: number
}

export default function MoveModal({ visible, type, itemName, excludeId, onClose, onConfirm }: Props): JSX.Element {
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<{ target: number | null; title: string } | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])

  const buildTree = useCallback((list: FolderItem[]): FolderNode[] => {
    const nodeById = new Map<number, FolderNode>()
    for (const f of list) {
      nodeById.set(f.id, {
        key: `folder-${f.id}`,
        title: f.name,
        id: f.id,
        icon: <FolderOutlined />,
        children: []
      })
    }
    const roots: FolderNode[] = []
    for (const f of list) {
      const node = nodeById.get(f.id)!
      if (f.parent_id != null && nodeById.has(f.parent_id)) {
        nodeById.get(f.parent_id)!.children!.push(node)
      } else {
        roots.push(node)
      }
    }
    return roots
  }, [])

  useEffect(() => {
    if (!visible) return
    setLoading(true)
    setConfirmTarget(null)
    window.api.tree.get().then(data => {
      setFolders(data.folders)
      const keys: React.Key[] = []
      const collect = (nodes: FolderNode[]) => {
        for (const n of nodes) {
          keys.push(n.key)
          if (n.children?.length) collect(n.children as FolderNode[])
        }
      }
      collect(buildTree(data.folders))
      setExpandedKeys(keys)
    }).finally(() => setLoading(false))
  }, [visible, buildTree])

  const isExcluded = (f: FolderItem): boolean => {
    if (type !== 'folder' || excludeId == null) return false
    if (f.id === excludeId) return true
    let pid = f.parent_id
    while (pid != null) {
      if (pid === excludeId) return true
      pid = folders.find(x => x.id === pid)?.parent_id ?? null
    }
    return false
  }

  const handleSelect = async (keys: React.Key[]) => {
    if (keys.length === 0) return
    setExpandedKeys(prev => Array.from(new Set([...prev, ...keys])))
    const key = String(keys[0])
    const match = key.match(/folder-(\d+)/)
    if (!match) return
    const id = parseInt(match[1], 10)
    const folder = folders.find(f => f.id === id)
    setConfirmTarget({ target: id, title: folder?.name || '' })
  }

  const handleConfirm = async () => {
    if (!confirmTarget) return
    const result = await onConfirm(confirmTarget.target)
    if (result.success) {
      message.success(`已移动到"${confirmTarget.title}"`)
      onClose()
    } else {
      message.error(result.error || '移动失败')
    }
  }

  const excludedKeys = new Set<React.Key>()
  for (const f of folders) {
    if (isExcluded(f)) excludedKeys.add(`folder-${f.id}`)
  }

  const stripExcluded = (nodes: FolderNode[]): FolderNode[] => {
    const result: FolderNode[] = []
    for (const n of nodes) {
      if (excludedKeys.has(n.key)) continue
      if (n.children?.length) n.children = stripExcluded(n.children as FolderNode[])
      result.push(n)
    }
    return result
  }

  const treeData = stripExcluded(buildTree(folders))

  return (
    <Modal
      title={`移动${type === 'folder' ? '文件夹' : '题单"${itemName}"'}`}
      open={visible}
      onCancel={onClose}
      onOk={handleConfirm}
      okText="移动到所选位置"
      okButtonProps={{ disabled: !confirmTarget }}
      width={440}
      maskClosable={false}
    >
      <div style={{ marginBottom: 8, color: confirmTarget ? undefined : '#888' }}>
        {confirmTarget ? `目标：${confirmTarget.title}` : `选择目标位置（可为根目录）》`}
      </div>
      {loading ? (
        <Spin style={{ display: 'block', margin: '24px auto' }} />
      ) : (
        <div style={{ maxHeight: 320, overflow: 'auto' }}>
          <div
            style={{ padding: '6px 8px', cursor: 'pointer', borderRadius: 4 }}
            onClick={() => setConfirmTarget({ target: null, title: '根目录' })}
          >
            <GlobalOutlined /> 根目录
          </div>
          {treeData.length > 0 ? (
            <Tree
              treeData={treeData}
              expandedKeys={expandedKeys}
              onExpand={keys => setExpandedKeys(keys)}
              onSelect={handleSelect}
              showIcon
              selectable
            />
          ) : (
            <Empty description="暂无文件夹" />
          )}
        </div>
      )}
    </Modal>
  )
}